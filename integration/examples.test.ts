import { describe, expect, it } from 'vitest';

import {
  buildReproducibilityManifest,
  hashDocument,
  validateIntent,
  validateSpec,
} from '@motion-engine/core';
import type { MotionSceneSpec, RenderPlan } from '@motion-engine/core';

import { loadNocturne, loadRezoBrand, mustResolve, readJson } from './support.ts';

const rezo = mustResolve({ brand: loadRezoBrand() });
const nocturne = mustResolve({ style: loadNocturne() });
const pilotSpec = () => readJson('examples/rezo360/pilots/pilot-b-interrupt/spec.json');

describe('exemple REZO360 (mode marque)', () => {
  it('se résout comme n’importe quelle marque, sans code dédié', () => {
    expect(rezo.mode).toBe('brand');
    expect(rezo.sources.brand?.id).toBe('rezo360');
    expect(rezo.sources.style.id).toBe('rezo360_style');
    expect(rezo.identity.lexicon).toEqual([{ term: 'REZO360', say: 'Rézo trois-cent-soixante', locale: 'fr-FR' }]);
    expect(rezo.identity.asset_priority[0]).toBe('screenshot');
    expect(rezo.locks).toEqual(['forbidden', 'motifs.rule', 'palette', 'typography.families']);
  });

  it('valide l’intent et la spec de la tranche du pilote B', () => {
    expect(validateIntent(readJson('examples/rezo360/pilots/pilot-b-interrupt/intent.json')).ok).toBe(true);
    const result = validateSpec(pilotSpec(), rezo);
    expect(result.ok, JSON.stringify(result)).toBe(true);
  });
});

describe('la même spec, d’autres styles', () => {
  it('la spec du pilote B est valide avec le style de contrôle Nocturne, par substitution explicite', () => {
    expect(validateSpec(pilotSpec(), nocturne).ok).toBe(false);
    const result = validateSpec(pilotSpec(), nocturne, { allowStyleSubstitution: true });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(result.ok && result.warnings.map((w) => w.code)).toEqual(['style.substituted']);
  });

  it('la spec neutre du cœur est valide avec REZO360 comme avec Nocturne', () => {
    const moon = readJson('core/test-fixtures/moon.spec.json');
    expect(validateSpec(moon, rezo, { allowStyleSubstitution: true }).ok).toBe(true);
    expect(validateSpec(moon, nocturne, { allowStyleSubstitution: true }).ok).toBe(true);
  });

  it('le manifeste trace la substitution de style', () => {
    const spec = pilotSpec() as unknown as MotionSceneSpec;
    const plan = {
      schema: 'render-plan',
      schema_version: '0.2.0',
      spec: { spec_id: spec.spec_id, revision: spec.revision, sha256: hashDocument(spec) },
      style: { mode: nocturne.mode, sha256: nocturne.sha256 },
      compiler_version: '0.3.0',
      canvas: { width: 1080, height: 1920, fps: 30, duration_frames: 30 },
      safe_zone: { x: 0, y: 0, w: 1080, h: 1920 },
      provenance: {
        timing_source: 'explicit_duration',
        behavior_registry_fingerprint: 'c'.repeat(64),
        text_engine: { name: 'harfbuzzjs', package_version: '1.6.2', native_version: '14.5.0', shaping_configuration: { direction: 'auto', kerning: true, ligatures: true, cluster_level: 'monotone_graphemes' } },
      },
      fonts: [],
      assets: [],
      scenes: [{ id: 'sc_02', from: 0, to: 30, background: nocturne.style.palette['surface.primary']!, nodes: [], transition_out: null }],
      preflight: { status: 'pass', issues: [], checks: { fonts: 0, assets: 0, text_nodes: 0, safe_nodes: 0, contrast_pairs: 0 } },
    } satisfies RenderPlan;
    const manifest = buildReproducibilityManifest({
      createdAt: '2026-09-27T18:00:00+02:00',
      engine: { name: '@motion-engine/core', version: '0.1.0', git_commit: null },
      spec,
      resolvedStyle: nocturne,
      plan,
      platformPresets: null,
      toolchain: { node: process.version, remotion: null, chromium: null, ffmpeg: null },
      renderConfig: { width: 1080, height: 1920, fps: 30, codec: 'png-still', crf: null, pixel_format: null },
      substitutionReason: 'preuve d’indépendance : même spec, style sans marque',
    });
    expect(manifest.style).toMatchObject({
      binding: { kind: 'brand', id: 'rezo360', version: '1.0.0' },
      mode: 'creative',
      substituted: true,
      sources: { style: { id: 'control_nocturne' }, brand: null, series: null },
    });
  });
});
