import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  runCreativeGateway,
} from '@motion-engine/creative-gateway';
import {
  AlwaysInvalidProvider,
  CapabilityLimitedProvider,
} from '@motion-engine/creative-gateway/testing';

import {
  P26_CERTIFICATION_MATRIX,
  P26MatrixProvider,
  buildP26GatewayRun,
  compileP26GatewayResult,
  p26Case,
  p26ReadingPolicy,
  p26Request,
} from './p2.6-support.ts';
import { WORKSPACE } from './support.ts';

function fingerprint(): string {
  return execFileSync(
    process.execPath,
    ['--experimental-strip-types', path.join(WORKSPACE, 'scripts', 'p2.6-fingerprint.ts')],
    {
      cwd: WORKSPACE,
      encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    },
  ).trim();
}

describe('P2.6 — certification offline du Creative Director', () => {
  it.each(P26_CERTIFICATION_MATRIX)('$label atteint un RenderPlan sans ERROR', async (entry) => {
    const gateway = await buildP26GatewayRun(entry);
    expect(gateway.ok, JSON.stringify(gateway.report.diagnostics)).toBe(true);
    expect(gateway.planning?.report?.archetype.id).toBe(entry.expected_archetype);
    expect(gateway.snapshot).not.toBeNull();
    const compiled = compileP26GatewayResult(gateway);
    expect(compiled.creative_compile.ok).toBe(true);
    expect(compiled.p1.preflight.summary?.errors ?? 0).toBe(0);
    expect(compiled.p1.render_plan.canvas.duration_frames).toBe(entry.request.target_duration_ms * 30 / 1_000);
  });

  it('certifie les accents, apostrophes, nombres et ponctuation française jusqu’au RenderPlan', async () => {
    const gateway = await buildP26GatewayRun(p26Case('french_typography'));
    const accepted = gateway.snapshot?.resolution_output.content.map((entry) => entry.text).join(' ') ?? '';
    expect(accepted).toContain('Électricité');
    expect(accepted).toContain('Aujourd’hui');
    expect(accepted).toContain('1 249,90 €');
    expect(accepted).toMatch(/[?!:;«»]/u);
    const compiled = compileP26GatewayResult(gateway);
    expect(compiled.p1.preflight.issues.map((issue) => issue.code)).not.toContain('text.overflow');
  });

  it('répare ensemble un dépassement temporel et géométrique sans perdre la portée', async () => {
    const entry = p26Case('hypothetical');
    const provider = new P26MatrixProvider(entry, 'combined');
    const gateway = await buildP26GatewayRun(entry, provider);
    expect(gateway.ok, JSON.stringify(gateway.report.diagnostics)).toBe(true);
    expect(gateway.report.resolution_repair?.attempt_count).toBe(1);
    const codes = new Set(gateway.report.resolution_repair?.diagnostic_codes_by_target.flatMap((target) => target.codes));
    expect(codes.has('gateway.output.content_reading_budget_exceeded')).toBe(true);
    expect(codes.has('gateway.output.subtitle_geometry_overflow')).toBe(true);
    expect(gateway.report.resolution_repair?.remaining_invalid_targets).toEqual([]);
    expect(gateway.snapshot?.provenance.resolution_repair?.occurred).toBe(true);
    expect(gateway.snapshot?.resolution_output.content.every((content) => content.scene_id === undefined)).toBe(true);
    const compiled = compileP26GatewayResult(gateway);
    expect(compiled.p1.preflight.summary?.errors ?? 0).toBe(0);
  });

  it('contient missing_glyph dans un diagnostic ciblé puis répare sans fuite TypographyEngineError', async () => {
    const entry = p26Case('minimal_short');
    const provider = new P26MatrixProvider(entry, 'missing_glyph');
    const gateway = await buildP26GatewayRun(entry, provider);
    expect(gateway.ok, JSON.stringify(gateway.report.diagnostics)).toBe(true);
    expect(provider.calls).toBe(3);
    expect(gateway.report.resolution_repair?.attempt_count).toBe(1);
    expect(gateway.report.resolution_repair?.diagnostic_codes_by_target).toEqual([
      expect.objectContaining({ codes: expect.arrayContaining(['gateway.output.font_missing_glyph']) }),
    ]);
    const initialDiagnostic = gateway.report.resolution_repair?.diagnostic_codes_by_target[0];
    expect(initialDiagnostic?.target.slot_id).toMatch(/^slot_/u);
    const repairedTarget = gateway.snapshot?.provenance.resolution_repair?.repaired_targets[0];
    expect(repairedTarget).toEqual(initialDiagnostic?.target);
    expect(gateway.report.resolution_repair?.remaining_invalid_targets).toEqual([]);
    expect(gateway.snapshot?.resolution_output.content.some((item) => /[\u4e00-\u9fff]/u.test(item.text))).toBe(false);
    const compiled = compileP26GatewayResult(gateway);
    expect(compiled.p1.preflight.summary?.errors ?? 0).toBe(0);
  });

  it('épuise proprement le repair si le provider conserve le missing glyph', async () => {
    const entry = p26Case('minimal_short');
    const gateway = await buildP26GatewayRun(entry, new P26MatrixProvider(entry, 'missing_glyph_exhausted'));
    expect(gateway.ok).toBe(false);
    expect(gateway.report.failure_kind).toBe('repair_exhausted');
    expect(gateway.report.diagnostics.map((item) => item.code)).toContain('gateway.output.font_missing_glyph');
    const diagnostic = gateway.report.diagnostics.find((item) => item.code === 'gateway.output.font_missing_glyph');
    expect(diagnostic).toMatchObject({
      severity: 'error',
      node_id: expect.stringMatching(/^slot_/u),
      context: {
        typography_error_code: 'font.missing_glyph',
        content_role: expect.any(String),
        segment_index: 0,
        repair_target: true,
      },
    });
    expect(diagnostic?.context?.['font_family']).not.toBe('unknown');
    expect(gateway.snapshot).toBeNull();
    expect(gateway.creative_resolution).toBeNull();
  });

  it('regroupe plusieurs glyphes absents d’une target en un seul patch borné', async () => {
    const entry = p26Case('minimal_short');
    const gateway = await buildP26GatewayRun(entry, new P26MatrixProvider(entry, 'multiple_missing_glyphs'));
    expect(gateway.ok, JSON.stringify(gateway.report.diagnostics)).toBe(true);
    expect(gateway.report.resolution_repair?.initial_invalid_targets).toHaveLength(1);
    expect(gateway.report.resolution_repair?.patched_targets).toHaveLength(1);
  });

  it('répare plusieurs targets missing_glyph dans un seul appel ciblé', async () => {
    const entry = p26Case('hypothetical');
    const provider = new P26MatrixProvider(entry, 'multiple_missing_targets');
    const gateway = await buildP26GatewayRun(entry, provider);
    expect(gateway.ok, JSON.stringify(gateway.report.diagnostics)).toBe(true);
    expect(provider.calls).toBe(3);
    expect(gateway.report.resolution_repair?.initial_invalid_targets).toHaveLength(2);
    expect(gateway.report.resolution_repair?.patched_targets).toHaveLength(2);
    expect(gateway.report.resolution_repair?.remaining_invalid_targets).toEqual([]);
  });

  it('répare source_required depuis le ContentSlot canonique puis repasse le Full Stage B Preflight', async () => {
    const entry = p26Case('science_explainer');
    const provider = new P26MatrixProvider(entry, 'factual_requirement');
    const gateway = await buildP26GatewayRun(entry, provider);
    expect(gateway.ok, JSON.stringify(gateway.report.diagnostics)).toBe(true);
    expect(provider.calls).toBe(3);
    expect(gateway.report.resolution_repair?.diagnostic_codes_by_target).toEqual([
      expect.objectContaining({ codes: expect.arrayContaining(['gateway.output.factual_requirement_changed']) }),
    ]);
    expect(gateway.report.resolution_repair?.remaining_invalid_targets).toEqual([]);
    const compiled = compileP26GatewayResult(gateway);
    expect(compiled.creative_compile.ok).toBe(true);
    expect(compiled.p1.preflight.summary?.errors ?? 0).toBe(0);
  });

  it('agrège factual et subtitle geometry dès le premier Full Stage B Preflight', async () => {
    const entry = p26Case('science_explainer');
    const provider = new P26MatrixProvider(entry, 'cumulative_preflight');
    const gateway = await buildP26GatewayRun(entry, provider);
    expect(gateway.ok, JSON.stringify(gateway.report.diagnostics)).toBe(true);
    expect(provider.calls).toBe(3);
    expect(gateway.report.resolution_repair?.attempt_count).toBe(1);
    const codes = new Set(gateway.report.resolution_repair?.diagnostic_codes_by_target.flatMap((target) => target.codes));
    expect(codes).toContain('gateway.output.factual_requirement_changed');
    expect(codes).toContain('gateway.output.subtitle_geometry_overflow');
    expect(codes).toContain('gateway.output.content_reading_budget_exceeded');
    expect(gateway.report.resolution_repair?.initial_invalid_targets.length).toBeGreaterThan(1);
    expect(gateway.report.resolution_repair?.remaining_invalid_targets).toEqual([]);
    const compiled = compileP26GatewayResult(gateway);
    expect(compiled.p1.preflight.summary?.errors ?? 0).toBe(0);
  });

  it('agrège factual, temporal, geometry et missing glyph dans le même repair borné', async () => {
    const entry = p26Case('science_explainer');
    const provider = new P26MatrixProvider(entry, 'cumulative_multi_error');
    const gateway = await buildP26GatewayRun(entry, provider);
    expect(gateway.ok, JSON.stringify(gateway.report.diagnostics)).toBe(true);
    expect(provider.calls).toBe(3);
    expect(gateway.report.resolution_repair?.attempt_count).toBe(1);
    const targets = gateway.report.resolution_repair?.diagnostic_codes_by_target ?? [];
    const codes = new Set(targets.flatMap((target) => target.codes));
    expect(codes).toContain('gateway.output.factual_requirement_changed');
    expect(codes).toContain('gateway.output.content_reading_budget_exceeded');
    expect(codes).toContain('gateway.output.subtitle_geometry_overflow');
    expect(codes).toContain('gateway.output.font_missing_glyph');
    expect(targets.some((target) => (
      target.codes.includes('gateway.output.factual_requirement_changed')
      && target.codes.includes('gateway.output.content_reading_budget_exceeded')
      && target.codes.includes('gateway.output.subtitle_geometry_overflow')
    ))).toBe(true);
    expect(gateway.report.resolution_repair?.remaining_invalid_targets).toEqual([]);
  });

  it('bloque proprement une liaison de scène invalide sans snapshot trompeur', async () => {
    const entry = p26Case('comparison');
    const gateway = await buildP26GatewayRun(entry, new P26MatrixProvider(entry, 'scene_binding'));
    expect(gateway.ok).toBe(false);
    expect(gateway.snapshot).toBeNull();
    expect(gateway.creative_resolution).toBeNull();
    expect(gateway.report.diagnostics.some((entry) => entry.code.includes('scene'))).toBe(true);
    expect(gateway.report.diagnostics.map((entry) => entry.code)).not.toContain('gateway.output.content_reading_budget_exceeded');
    expect(gateway.report.diagnostics.map((entry) => entry.code)).not.toContain('gateway.output.subtitle_geometry_overflow');
    expect(gateway.report.diagnostics.map((entry) => entry.code)).not.toContain('gateway.output.font_missing_glyph');
  });

  it('bloque proprement un provider toujours invalide après repair borné', async () => {
    const entry = p26Case('minimal_short');
    const gateway = await runCreativeGateway(p26Request(entry), {
      provider: new AlwaysInvalidProvider(),
      max_repair_attempts: 1,
      timeout_ms: 1_000,
    });
    expect(gateway.ok).toBe(false);
    expect(gateway.report.failure_kind).toBe('repair_exhausted');
    expect(gateway.snapshot).toBeNull();
  });

  it('bloque avant appel une capability provider incompatible', async () => {
    const entry = p26Case('science_explainer');
    const provider = new CapabilityLimitedProvider();
    const gateway = await runCreativeGateway(p26Request(entry), { provider });
    expect(gateway.ok).toBe(false);
    expect(gateway.report.failure_kind).toBe('unsupported_capability');
    expect(provider.calls).toBe(0);
  });

  it('bloque un asset obligatoire absent sans accepter de snapshot', async () => {
    const entry = p26Case('product_demo');
    const gateway = await runCreativeGateway(p26Request(entry), {
      provider: new P26MatrixProvider(entry),
      max_repair_attempts: 1,
      timeout_ms: 2_000,
      reading_policy: p26ReadingPolicy(),
    });
    expect(gateway.ok).toBe(false);
    expect(gateway.report.failure_kind).toBe('unresolved_required_asset');
    expect(gateway.snapshot).toBeNull();
  });

  it('bloque proprement un repair qui reste impossible', async () => {
    const entry = p26Case('hypothetical');
    const gateway = await buildP26GatewayRun(entry, new P26MatrixProvider(entry, 'repair_exhausted'));
    expect(gateway.ok).toBe(false);
    expect(gateway.report.failure_kind).toBe('repair_exhausted');
    expect(gateway.snapshot).toBeNull();
    expect(gateway.report.resolution_repair?.remaining_invalid_targets.length).toBeGreaterThan(0);
  });

  it('produit le même fingerprint de matrice dans deux processus Node', () => {
    const first = fingerprint();
    const second = fingerprint();
    expect(first).toBe(second);
    const parsed = JSON.parse(first) as { cases: Array<{ render_plan_sha256: string }> };
    expect(parsed.cases).toHaveLength(P26_CERTIFICATION_MATRIX.length);
    expect(parsed.cases.every((entry) => /^[0-9a-f]{64}$/u.test(entry.render_plan_sha256))).toBe(true);
  }, 60_000);

  it('rejoue un snapshot accepté dans deux processus sans clé ni appel provider', async () => {
    const gateway = await buildP26GatewayRun(p26Case('science_explainer'));
    expect(gateway.snapshot).not.toBeNull();
    const directory = mkdtempSync(path.join(tmpdir(), 'p2-6-replay-'));
    const snapshotFile = path.join(directory, 'snapshot.json');
    writeFileSync(snapshotFile, JSON.stringify(gateway.snapshot), 'utf8');
    const replay = () => {
      const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' };
      delete env['OPENAI_API_KEY'];
      return execFileSync(process.execPath, [
        '--experimental-strip-types',
        path.join(WORKSPACE, 'scripts', 'p2.6-replay-child.ts'),
        '--snapshot',
        snapshotFile,
      ], { cwd: WORKSPACE, encoding: 'utf8', env }).trim();
    };
    try {
      const first = replay();
      const second = replay();
      expect(first).toBe(second);
      const parsed = JSON.parse(first) as { provider_calls: number; snapshot_sha256: string };
      expect(parsed.provider_calls).toBe(0);
      expect(parsed.snapshot_sha256).toBe(gateway.snapshot?.snapshot_sha256);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
