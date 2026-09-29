import { ensureBrowser } from '@remotion/renderer';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import { canonicalJson } from '@motion-engine/core';
import { RemotionMotionRenderer, REMOTION_P17_RENDERER_VERSION } from '@motion-engine/renderer-remotion';
import {
  buildVisualDirectorPlanningContext,
  CANONICAL_IMMUTABLE_FIELDS,
  DIRECTOR_REGISTRY_FINGERPRINTS,
  hashVisualDirectorPlanningContext,
  MOTION_IDENTITY_DEFINITIONS,
  PROVIDER_MUTABLE_FIELDS,
  SEQUENCE_STRATEGY_DEFINITIONS,
  TECHNIQUE_COMPOSITION_DEFINITIONS,
  VISUAL_DIRECTOR_FINGERPRINT,
} from '@motion-engine/visual-director-core';

import { browserExecutable, controlFrames, gitState, sha256File, toolchainFingerprint } from './p1.6-support.ts';
import { profileP33APipeline, type P33AFixtureKind, type P33APipeline } from './p3.3a-support.ts';
import { WORKSPACE } from './support.ts';
import { createGridBoard } from './visual-regression.ts';

type RenderedKind = 'science' | 'product' | 'editorial';

const FILMS: Readonly<Record<RenderedKind, string>> = Object.freeze({
  science: 'p3-3a-blue-sky.mp4',
  product: 'p3-3a-product-app.mp4',
  editorial: 'p3-3a-editorial.mp4',
});

const CONTACT_SHEETS: Readonly<Record<RenderedKind, string>> = Object.freeze({
  science: 'p3-3a-blue-sky-contact-sheet.png',
  product: 'p3-3a-product-app-contact-sheet.png',
  editorial: 'p3-3a-editorial-contact-sheet.png',
});

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, `${canonicalJson(value)}\n`, 'utf8');
}

function isMp4(file: string): boolean {
  const bytes = readFileSync(file).subarray(0, 12);
  return bytes.length >= 8 && bytes.subarray(4, 8).toString('ascii') === 'ftyp';
}

async function availableBrowser(): Promise<string> {
  const existing = browserExecutable();
  if (existing) return existing;
  const status = await ensureBrowser({ chromeMode: 'chrome-for-testing', logLevel: 'warn' });
  if (status.type === 'user-defined-path' || status.type === 'local-puppeteer-browser') return status.path;
  throw new Error(`Chromium indisponible après ensureBrowser (${status.type}).`);
}

function countOccurrences(value: unknown, key: string): number {
  return JSON.stringify(value).split(`\"${key}\"`).length - 1;
}

function allFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? allFiles(file) : [file];
  });
}

const glyphs: Readonly<Record<string, readonly string[]>> = {
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  '2': ['11110', '00001', '00001', '01110', '10000', '10000', '11111'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
};

function drawLabel(target: PNG, label: string, x: number, y: number, scale = 6): void {
  let cursor = x;
  for (const char of label) {
    const glyph = glyphs[char];
    if (!glyph) {
      cursor += scale * 3;
      continue;
    }
    glyph.forEach((row, rowIndex) => [...row].forEach((pixel, columnIndex) => {
      if (pixel !== '1') return;
      for (let dy = 0; dy < scale; dy += 1) for (let dx = 0; dx < scale; dx += 1) {
        const offset = ((y + rowIndex * scale + dy) * target.width + cursor + columnIndex * scale + dx) * 4;
        target.data[offset] = 255;
        target.data[offset + 1] = 255;
        target.data[offset + 2] = 255;
        target.data[offset + 3] = 255;
      }
    }));
    cursor += scale * 6;
  }
}

function comparativeBoard(rows: readonly { label: string; files: readonly string[] }[], outputFile: string): void {
  if (rows.length === 0 || rows.some((row) => row.files.length !== rows[0]!.files.length || row.files.length === 0)) {
    throw new Error('Comparaison P3.2/P3.3A incomplète.');
  }
  const images = rows.map((row) => row.files.map((file) => PNG.sync.read(readFileSync(file))));
  const width = images[0]![0]!.width;
  const height = images[0]![0]!.height;
  const header = 64;
  if (images.flat().some((image) => image.width !== width || image.height !== height)) throw new Error('Dimensions de comparaison incompatibles.');
  const output = new PNG({ width: width * rows[0]!.files.length, height: (height + header) * rows.length });
  for (let offset = 0; offset < output.data.length; offset += 4) {
    output.data[offset] = 2;
    output.data[offset + 1] = 8;
    output.data[offset + 2] = 23;
    output.data[offset + 3] = 255;
  }
  images.forEach((rowImages, row) => {
    rowImages.forEach((source, column) => {
      for (let y = 0; y < height; y += 1) {
        const sourceStart = y * width * 4;
        const destinationStart = (((row * (height + header)) + header + y) * output.width + column * width) * 4;
        source.data.copy(output.data, destinationStart, sourceStart, sourceStart + width * 4);
      }
    });
    drawLabel(output, rows[row]!.label, 20, row * (height + header) + 10);
  });
  writeFileSync(outputFile, PNG.sync.write(output));
}

function publishDirectory(staging: string, output: string): void {
  const expectedRoot = `${path.resolve(WORKSPACE, 'out', 'p3.3a')}${path.sep}`;
  const resolvedOutput = path.resolve(output);
  if (!resolvedOutput.startsWith(expectedRoot)) throw new Error(`Publication hors racine P3.3A refusée : ${resolvedOutput}`);
  const backup = `${output}.previous`;
  if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
  if (existsSync(output)) renameSync(output, backup);
  try {
    renameSync(staging, output);
    if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (existsSync(backup) && !existsSync(output)) renameSync(backup, output);
    throw error;
  }
}

function writePipelineArtifacts(directory: string, pipeline: P33APipeline): void {
  mkdirSync(directory, { recursive: true });
  writeJson(path.join(directory, 'visual-director-context.json'), pipeline.context);
  writeJson(path.join(directory, 'visual-direction-plan.json'), pipeline.direction_plan);
  writeJson(path.join(directory, 'director-preflight.json'), pipeline.direction_compile.direction_preflight);
  writeJson(path.join(directory, 'decision-trace.json'), pipeline.direction_compile.decision_trace);
  writeJson(path.join(directory, 'sequence-coherence-report.json'), pipeline.direction_compile.coherence);
  writeJson(path.join(directory, 'visual-plan.json'), pipeline.visual_plan);
  writeJson(path.join(directory, 'visual-preflight.json'), pipeline.visual_compile.preflight);
  writeJson(path.join(directory, 'visual-diversity-report.json'), pipeline.diversity);
  writeJson(path.join(directory, 'motion-spec.json'), pipeline.visual_compile.motion_spec);
  writeJson(path.join(directory, 'render-plan.json'), pipeline.p1.render_plan);
  writeJson(path.join(directory, 'p1-preflight.json'), pipeline.p1.preflight);
  const providerContext = buildVisualDirectorPlanningContext(pipeline.creative_plan, pipeline.context);
  writeJson(path.join(directory, 'future-provider-context.json'), providerContext);
  writeJson(path.join(directory, 'hashes.json'), {
    visual_director: VISUAL_DIRECTOR_FINGERPRINT,
    registries: DIRECTOR_REGISTRY_FINGERPRINTS,
    director_context: pipeline.direction_plan.source.director_context_sha256,
    future_provider_context: hashVisualDirectorPlanningContext(providerContext),
    visual_direction_plan: pipeline.direction_compile.hashes.direction_plan,
    decision_trace: pipeline.direction_compile.hashes.decision_trace,
    visual_plan: pipeline.direction_compile.hashes.visual_plan,
    motion_spec: pipeline.visual_compile.hashes.motion_spec,
    render_plan: pipeline.p1.hashes.render_plan,
  });
}

describe('P3.3A — films de référence Visual Director Core', () => {
  it('rend trois directions distinctes et publie atomiquement le package de review', async () => {
    const browser = await availableBrowser();
    const kinds = ['science', 'product', 'editorial', 'problem_solution'] as const;
    const profiled = Object.fromEntries(kinds.map((kind) => [kind, profileP33APipeline(kind, 1)])) as Record<P33AFixtureKind, ReturnType<typeof profileP33APipeline>>;
    for (const { pipeline } of Object.values(profiled)) {
      expect(pipeline.direction_compile.direction_preflight.summary.errors).toBe(0);
      expect(pipeline.visual_compile.preflight.summary.errors).toBe(0);
      expect(pipeline.p1.preflight.summary?.errors ?? 0).toBe(0);
      expect(pipeline.p1.render_plan.canvas).toMatchObject({ width: 1080, height: 1920, fps: 30 });
    }

    const root = path.join(WORKSPACE, 'out', 'p3.3a');
    const output = path.join(root, 'reference');
    const staging = path.join(root, `.reference-staging-${process.pid}`);
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });

    for (const kind of kinds) writePipelineArtifacts(path.join(staging, kind.replace('_', '-')), profiled[kind].pipeline);

    const renderer = new RemotionMotionRenderer({ browserExecutable: browser, dynamicTypography: true });
    const renderMetrics: Record<string, unknown> = {};
    const frameMetrics: Record<string, unknown[]> = {};
    const controlFrameFiles: Record<RenderedKind, string[]> = { science: [], product: [], editorial: [] };
    try {
      for (const kind of ['science', 'product', 'editorial'] as const) {
        const pipeline = profiled[kind].pipeline;
        const video = path.join(staging, FILMS[kind]);
        const result = await renderer.renderVideo({ plan: pipeline.p1.render_plan, output_file: video, resource_root: WORKSPACE });
        expect(isMp4(video)).toBe(true);
        renderMetrics[kind] = { ...result, frames_per_second: result.frames / (result.render_ms / 1_000) };
        const framesDirectory = path.join(staging, 'frames', kind);
        mkdirSync(framesDirectory, { recursive: true });
        const metrics: unknown[] = [];
        for (const point of controlFrames(pipeline.p1.render_plan.canvas.duration_frames)) {
          const file = path.join(framesDirectory, `${point.phase.toLowerCase()}.png`);
          const rendered = await renderer.renderFrame({ plan: pipeline.p1.render_plan, output_file: file, frame: point.frame, resource_root: WORKSPACE });
          metrics.push({ phase: point.phase, frame: point.frame, render_ms: rendered.render_ms, bytes: rendered.bytes, bundle_reused: rendered.bundle_reused });
          controlFrameFiles[kind].push(file);
        }
        frameMetrics[kind] = metrics;
        createGridBoard(controlFrameFiles[kind], 5, path.join(staging, CONTACT_SHEETS[kind]));
      }
    } finally {
      renderer.dispose();
    }

    expect((renderMetrics['product'] as { bundle_reused: boolean }).bundle_reused).toBe(true);
    expect((renderMetrics['editorial'] as { bundle_reused: boolean }).bundle_reused).toBe(true);

    const p32Frames = path.join(WORKSPACE, 'out', 'p3.2', 'reference', 'frames');
    const phaseNames = ['enter', 'accent', 'settle', 'hold', 'exit'];
    if (!phaseNames.every((name) => existsSync(path.join(p32Frames, `${name}.png`)))) throw new Error('Frames baseline P3.2 absentes.');
    comparativeBoard([
      { label: 'P3.2', files: phaseNames.map((name) => path.join(p32Frames, `${name}.png`)) },
      { label: 'P3.3A', files: controlFrameFiles.science },
    ], path.join(staging, 'p3-2-p3-3a-blue-sky-comparison.png'));

    const git = gitState();
    const registryManifest = {
      schema: 'p3.3a-director-registry-manifest',
      schema_version: '0.1.0',
      visual_director_fingerprint: VISUAL_DIRECTOR_FINGERPRINT,
      fingerprints: DIRECTOR_REGISTRY_FINGERPRINTS,
      sequence_strategies: SEQUENCE_STRATEGY_DEFINITIONS.map(({ id, version }) => ({ id, version })),
      motion_identities: MOTION_IDENTITY_DEFINITIONS.map(({ id, version }) => ({ id, version })),
      technique_compositions: TECHNIQUE_COMPOSITION_DEFINITIONS.map(({ id, version, status }) => ({ id, version, status })),
    };
    writeJson(path.join(staging, 'registry-manifest.json'), registryManifest);
    writeJson(path.join(staging, 'provider-attack-surface.json'), {
      schema: 'p3.3a-provider-attack-surface',
      schema_version: '0.1.0',
      mutable_fields: PROVIDER_MUTABLE_FIELDS,
      canonical_immutable_fields: CANONICAL_IMMUTABLE_FIELDS,
      executable_fields: [],
      network_fields: [],
      filesystem_fields: [],
    });
    writeJson(path.join(staging, 'metrics.json'), {
      schema: 'p3.3a-certification-metrics',
      schema_version: '0.1.0',
      environment: { os: process.platform, arch: process.arch, node: process.version, local_gpu_required: false },
      compile: Object.fromEntries(kinds.map((kind) => [kind, profiled[kind].metrics])),
      render: renderMetrics,
      control_frames: frameMetrics,
      node_peak_memory_bytes: process.resourceUsage().maxRSS * 1_024,
      complexity: Object.fromEntries(kinds.map((kind) => {
        const pipeline = profiled[kind].pipeline;
        return [kind, {
          scenes: pipeline.visual_plan.scenes.length,
          entities: pipeline.visual_plan.scenes.reduce((sum, scene) => sum + scene.entities.length, 0),
          patterns: pipeline.visual_plan.scenes.reduce((sum, scene) => sum + scene.patterns.length, 0),
          phrases: pipeline.visual_plan.scenes.reduce((sum, scene) => sum + scene.motion_phrases.length, 0),
          bridges: pipeline.visual_plan.bridges.length,
          layers: countOccurrences(pipeline.p1.render_plan, 'node_id'),
          tracks: countOccurrences(pipeline.p1.render_plan, 'property'),
          keyframes: countOccurrences(pipeline.p1.render_plan, 'frame'),
        }];
      })),
    });
    const warnings = Object.fromEntries(kinds.map((kind) => [kind, {
      director: profiled[kind].pipeline.direction_compile.direction_preflight.diagnostics.filter((entry) => entry.severity === 'warning'),
      visual: profiled[kind].pipeline.visual_compile.preflight.diagnostics.filter((entry) => entry.severity === 'warning'),
      p1: profiled[kind].pipeline.p1.preflight.issues.filter((entry) => entry.severity === 'warning'),
    }]));
    const filmHashes = Object.fromEntries((['science', 'product', 'editorial'] as const).map((kind) => [kind, sha256File(path.join(staging, FILMS[kind]))]));
    const manifest = {
      schema: 'p3.3a-reference-manifest',
      schema_version: '0.1.0',
      commit: git.commit,
      tree_clean: !git.dirty,
      branch: 'feature/social-visual-director-core',
      baseline_p325_commit: '0245f7a225be8c0399fb173a9913488b0544f431',
      baseline_p32_commit: '5a25897f0364083d5ecfa8c21015f8c709b22a74',
      director: { version: '0.1.0', fingerprint: VISUAL_DIRECTOR_FINGERPRINT, registries: DIRECTOR_REGISTRY_FINGERPRINTS },
      films: filmHashes,
      renderer: REMOTION_P17_RENDERER_VERSION,
      toolchain: toolchainFingerprint(browser),
      preflight: Object.fromEntries(kinds.map((kind) => [kind, {
        director: profiled[kind].pipeline.direction_compile.direction_preflight.summary,
        visual: profiled[kind].pipeline.visual_compile.preflight.summary,
        p1: profiled[kind].pipeline.p1.preflight.summary,
      }])),
      warnings,
      bundle_reuse: {
        first_render_reused: (renderMetrics['science'] as { bundle_reused: boolean }).bundle_reused,
        product_reused: (renderMetrics['product'] as { bundle_reused: boolean }).bundle_reused,
        editorial_reused: (renderMetrics['editorial'] as { bundle_reused: boolean }).bundle_reused,
      },
      reference_eligibility: !git.dirty && kinds.every((kind) => profiled[kind].pipeline.direction_compile.direction_preflight.summary.errors === 0 && profiled[kind].pipeline.visual_compile.preflight.summary.errors === 0 && (profiled[kind].pipeline.p1.preflight.summary?.errors ?? 0) === 0),
      provider_calls: 0,
      external_assets: 0,
      no_local_gpu_required: true,
      human_visual_review_required: true,
    };
    writeJson(path.join(staging, 'manifest.json'), manifest);

    const textual = allFiles(staging).filter((file) => file.endsWith('.json'));
    const secretPattern = /(sk-[a-z0-9_-]{16,}|OPENAI_API_KEY|ELEVENLABS_API_KEY|FAL_KEY|HIGGSFIELD)/iu;
    const leaks = textual.filter((file) => secretPattern.test(readFileSync(file, 'utf8')));
    expect(leaks).toEqual([]);
    writeJson(path.join(staging, 'security-scan.json'), {
      schema: 'p3.3a-security-scan', schema_version: '0.1.0', files_scanned: textual.map((file) => path.relative(staging, file).replaceAll('\\', '/')), leaks: [], result: 'pass',
    });
    const artifacts = allFiles(staging).filter((file) => path.basename(file) !== 'artifact-integrity.json');
    writeJson(path.join(staging, 'artifact-integrity.json'), artifacts.map((file) => ({
      file: path.relative(staging, file).replaceAll('\\', '/'), bytes: statSync(file).size, sha256: sha256File(file),
    })));
    publishDirectory(staging, output);
  }, 1_800_000);
});
