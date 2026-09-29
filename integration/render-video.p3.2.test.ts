import { ensureBrowser } from '@remotion/renderer';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import { canonicalJson } from '@motion-engine/core';
import { RemotionMotionRenderer, REMOTION_P17_RENDERER_VERSION } from '@motion-engine/renderer-remotion';
import {
  P32_CAMERA_DEFINITIONS,
  P32_MOTION_PHRASE_DEFINITIONS,
  P32_SCENE_BRIDGE_DEFINITIONS,
  P32_VISUAL_GRAMMAR,
  P32_VISUAL_PATTERN_DEFINITIONS,
  P32_VISUAL_REGISTRY_FINGERPRINTS,
  hashVisualDocument,
} from '@motion-engine/visual-core';

import { browserExecutable, controlFrames, gitState, sha256File, toolchainFingerprint } from './p1.6-support.ts';
import { buildP32Pipeline } from './p3.2-support.ts';
import { WORKSPACE } from './support.ts';
import { comparePngFiles, createGridBoard, CROSS_ENVIRONMENT_TOLERANCE } from './visual-regression.ts';

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

const glyphs: Readonly<Record<string, readonly string[]>> = {
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  '2': ['11110', '00001', '00001', '01110', '10000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
};

function drawLabel(target: PNG, label: string, x: number, y: number, scale = 6): void {
  let cursor = x;
  for (const char of label) {
    const glyph = glyphs[char];
    if (!glyph) { cursor += scale * 3; continue; }
    glyph.forEach((row, rowIndex) => [...row].forEach((pixel, columnIndex) => {
      if (pixel !== '1') return;
      for (let dy = 0; dy < scale; dy += 1) for (let dx = 0; dx < scale; dx += 1) {
        const offset = ((y + rowIndex * scale + dy) * target.width + cursor + columnIndex * scale + dx) * 4;
        target.data[offset] = 255; target.data[offset + 1] = 255; target.data[offset + 2] = 255; target.data[offset + 3] = 255;
      }
    }));
    cursor += scale * 6;
  }
}

function comparativeBoard(rows: readonly { label: string; files: readonly string[] }[], outputFile: string): void {
  if (rows.length === 0 || rows.some((row) => row.files.length !== rows[0]!.files.length || row.files.length === 0)) throw new Error('Comparaison P2/P3.1/P3.2 incomplète.');
  const images = rows.map((row) => row.files.map((file) => PNG.sync.read(readFileSync(file))));
  const width = images[0]![0]!.width; const height = images[0]![0]!.height; const header = 64;
  if (images.flat().some((image) => image.width !== width || image.height !== height)) throw new Error('Dimensions P2/P3.1/P3.2 incompatibles.');
  const output = new PNG({ width: width * rows[0]!.files.length, height: (height + header) * rows.length });
  for (let offset = 0; offset < output.data.length; offset += 4) {
    output.data[offset] = 2; output.data[offset + 1] = 8; output.data[offset + 2] = 23; output.data[offset + 3] = 255;
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

function countOccurrences(value: unknown, key: string): number {
  return JSON.stringify(value).split(`\"${key}\"`).length - 1;
}

function collectTrackProperties(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectTrackProperties);
  if (value === null || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return [typeof record['property'] === 'string' ? record['property'] : null, ...Object.values(record).flatMap(collectTrackProperties)]
    .filter((entry): entry is string => entry !== null);
}

describe('P3.2 — film de référence Premium Motion Vocabulary', () => {
  it('rend et publie atomiquement le package de review Blue Sky', async () => {
    const browser = await availableBrowser();
    const compileStarted = performance.now();
    const pipeline = buildP32Pipeline(1);
    const compileMs = performance.now() - compileStarted;
    expect(pipeline.visual_compile.preflight.summary.errors).toBe(0);
    expect(pipeline.p1.preflight.summary?.errors ?? 0).toBe(0);
    expect(pipeline.p1.render_plan.canvas).toMatchObject({ width: 1080, height: 1920, fps: 30, duration_frames: 900 });

    const root = path.join(WORKSPACE, 'out', 'p3.2');
    const output = path.join(root, 'reference');
    const staging = path.join(root, '.reference-staging');
    const framesDirectory = path.join(staging, 'frames');
    const goldenDirectory = path.join(WORKSPACE, 'visual-compiler', 'goldens', 'p3.2', 'visual');
    const p2Fixture = path.join(WORKSPACE, 'fixtures', 'p3.1', 'p2-science-baseline');
    const p31Golden = path.join(WORKSPACE, 'visual-compiler', 'goldens', 'p3.1', 'visual');
    const updateGoldens = process.env['UPDATE_P32_VISUAL_GOLDENS'] === '1';
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(framesDirectory, { recursive: true });
    if (updateGoldens) mkdirSync(goldenDirectory, { recursive: true });

    const renderer = new RemotionMotionRenderer({ browserExecutable: browser, dynamicTypography: true });
    const video = path.join(staging, 'p3-2-blue-sky.mp4');
    const frameMetrics: Array<{ name: string; frame: number; render_ms: number; bytes: number }> = [];
    const comparisons: Record<string, ReturnType<typeof comparePngFiles>> = {};
    const p32ControlFrames: string[] = [];
    let renderResult;
    try {
      renderResult = await renderer.renderVideo({ plan: pipeline.p1.render_plan, output_file: video, resource_root: WORKSPACE });
      for (const point of controlFrames(900)) {
        const name = point.phase.toLowerCase();
        const candidate = path.join(framesDirectory, `${name}.png`);
        const frame = await renderer.renderFrame({ plan: pipeline.p1.render_plan, output_file: candidate, frame: point.frame, resource_root: WORKSPACE });
        const golden = path.join(goldenDirectory, `${name}.png`);
        if (updateGoldens) copyFileSync(candidate, golden);
        if (!existsSync(golden)) throw new Error(`Référence visuelle P3.2 absente : ${golden}. Utiliser explicitement UPDATE_P32_VISUAL_GOLDENS=1.`);
        comparisons[`${name}.png`] = comparePngFiles(golden, candidate, CROSS_ENVIRONMENT_TOLERANCE);
        frameMetrics.push({ name, frame: point.frame, render_ms: frame.render_ms, bytes: frame.bytes });
        p32ControlFrames.push(candidate);
      }
      const keyFrames = [
        { name: 'opening', frame: 12 }, { name: 'typography-before', frame: 405 }, { name: 'typography-anticipation', frame: 420 },
        { name: 'typography-impact', frame: 438 }, { name: 'typography-midpoint', frame: 456 }, { name: 'typography-settle', frame: 486 },
        { name: 'continuity-before', frame: 382 }, { name: 'continuity-impact', frame: 392 }, { name: 'continuity-midpoint', frame: 399 },
        { name: 'continuity-after', frame: 410 }, { name: 'continuity-settle', frame: 426 },
        { name: 'depth-before', frame: 122 }, { name: 'depth-anticipation', frame: 150 }, { name: 'depth-impact', frame: 180 },
        { name: 'depth-midpoint', frame: 210 }, { name: 'depth-settle', frame: 238 }, { name: 'final-payoff', frame: 845 },
      ];
      for (const point of keyFrames) {
        const file = path.join(framesDirectory, `${point.name}.png`);
        const frame = await renderer.renderFrame({ plan: pipeline.p1.render_plan, output_file: file, frame: point.frame, resource_root: WORKSPACE });
        frameMetrics.push({ name: point.name, frame: point.frame, render_ms: frame.render_ms, bytes: frame.bytes });
      }
    } finally {
      renderer.dispose();
    }

    expect(isMp4(video)).toBe(true);
    expect(Object.values(comparisons).every((entry) => entry.within_tolerance)).toBe(true);
    createGridBoard(p32ControlFrames, 5, path.join(staging, 'p3-2-contact-sheet.png'));
    const strip = (prefix: string): string[] => ['before', 'anticipation', 'impact', 'midpoint', 'settle'].map((suffix) => path.join(framesDirectory, `${prefix}-${suffix}.png`));
    createGridBoard(strip('typography'), 5, path.join(staging, 'p3-2-typography-strip.png'));
    createGridBoard(strip('depth'), 5, path.join(staging, 'p3-2-depth-camera-strip.png'));
    createGridBoard([
      path.join(framesDirectory, 'continuity-before.png'), path.join(framesDirectory, 'continuity-impact.png'),
      path.join(framesDirectory, 'continuity-midpoint.png'), path.join(framesDirectory, 'continuity-after.png'),
      path.join(framesDirectory, 'continuity-settle.png'),
    ], 5, path.join(staging, 'p3-2-continuity-strip.png'));
    const phaseNames = ['enter', 'accent', 'settle', 'hold', 'exit'];
    comparativeBoard([
      { label: 'P2', files: phaseNames.map((name) => path.join(p2Fixture, 'frames', `${name}.png`)) },
      { label: 'P3.1', files: phaseNames.map((name) => path.join(p31Golden, `${name}.png`)) },
      { label: 'P3.2', files: p32ControlFrames },
    ], path.join(staging, 'p2-p3-1-p3-2-comparison.png'));

    writeJson(path.join(staging, 'visual-plan.json'), pipeline.visual_plan);
    writeJson(path.join(staging, 'visual-preflight.json'), pipeline.visual_compile.preflight);
    writeJson(path.join(staging, 'visual-diversity-report.json'), pipeline.diversity);
    writeJson(path.join(staging, 'visual-provenance.json'), pipeline.visual_compile.provenance);
    writeJson(path.join(staging, 'motion-spec.json'), pipeline.visual_compile.motion_spec);
    writeJson(path.join(staging, 'render-plan.json'), pipeline.p1.render_plan);
    writeJson(path.join(staging, 'p1-preflight.json'), pipeline.p1.preflight);
    const hashes = {
      grammar: P32_VISUAL_GRAMMAR.fingerprint, registries: P32_VISUAL_REGISTRY_FINGERPRINTS,
      visual_plan: hashVisualDocument(pipeline.visual_plan), motion_spec: pipeline.visual_compile.hashes.motion_spec,
      compiler: pipeline.visual_compile.hashes.compiler_fingerprint, render_plan: pipeline.p1.hashes.render_plan,
      reference_film: sha256File(video),
    };
    writeJson(path.join(staging, 'hashes.json'), hashes);
    writeJson(path.join(staging, 'visual-regression-report.json'), {
      schema: 'p3.2-visual-regression-report', schema_version: '0.1.0', update_mode: updateGoldens,
      tolerance: CROSS_ENVIRONMENT_TOLERANCE, comparisons,
      result: Object.values(comparisons).every((entry) => entry.within_tolerance) ? 'pass' : 'fail',
      human_review_required: true,
      limitation: 'Contact sheets demonstrate composition only. Inspect the MP4 for easing, speed, fluidity, causality, and bridge timing.',
    });
    const dynamicTracks = collectTrackProperties(pipeline.p1.render_plan)
      .filter((property) => property === 'tracking_px' || property.startsWith('font_axis.'));
    writeJson(path.join(staging, 'metrics.json'), {
      schema: 'p3.2-render-metrics', schema_version: '0.1.0',
      environment: { os: process.platform, arch: process.arch, node: process.version, local_gpu_required: false },
      compile_visual_pipeline_ms: compileMs,
      render: { ...renderResult, frames_per_second: renderResult.frames / (renderResult.render_ms / 1_000) },
      control_frames: frameMetrics,
      node_peak_memory_bytes: process.resourceUsage().maxRSS * 1_024,
      complexity: {
        scenes: pipeline.visual_plan.scenes.length,
        entities: pipeline.visual_plan.scenes.reduce((sum, scene) => sum + scene.entities.length, 0),
        layers: pipeline.visual_compile.provenance.length,
        tracks: countOccurrences(pipeline.p1.render_plan, 'property'),
        keyframes: countOccurrences(pipeline.p1.render_plan, 'frame'),
        paths: pipeline.visual_plan.scenes.reduce((sum, scene) => sum + scene.entities.filter((entry) => entry.kind === 'path').length, 0),
        masks: pipeline.visual_plan.scenes.reduce((sum, scene) => sum + scene.entities.filter((entry) => entry.kind === 'mask').length, 0),
        patterns: pipeline.visual_plan.scenes.reduce((sum, scene) => sum + scene.patterns.length, 0),
        phrases: pipeline.visual_plan.scenes.reduce((sum, scene) => sum + scene.motion_phrases.length, 0),
        bridges: pipeline.visual_plan.bridges.length,
        morph_chains: pipeline.visual_plan.scenes.reduce((sum, scene) => sum + (scene.morph_chains?.length ?? 0), 0),
        causal_relations: pipeline.visual_plan.scenes.reduce((sum, scene) => sum + (scene.causal_relations?.length ?? 0), 0),
        depth_layers: pipeline.visual_plan.scenes.reduce((sum, scene) => sum + scene.depth_layers.length, 0),
        dynamic_typography_tracks: dynamicTracks.length,
      },
    });
    const git = gitState();
    const manifest = {
      schema: 'p3.2-reference-manifest', schema_version: '0.1.0', commit: git.commit, tree_clean: !git.dirty,
      baseline_p31_commit: '010c18f05040d3322324c3f2a8516e765f729024', p17_commit: '534877b08d16b9bdf0e3966d0612244861351c67',
      visual_grammar: { version: P32_VISUAL_GRAMMAR.version, sha256: P32_VISUAL_GRAMMAR.fingerprint }, registries: P32_VISUAL_REGISTRY_FINGERPRINTS,
      registry_versions: {
        patterns: P32_VISUAL_PATTERN_DEFINITIONS.map(({ id, version }) => ({ id, version })),
        phrases: P32_MOTION_PHRASE_DEFINITIONS.map(({ id, version }) => ({ id, version })),
        bridges: P32_SCENE_BRIDGE_DEFINITIONS.map(({ id, version }) => ({ id, version })),
        cameras: P32_CAMERA_DEFINITIONS.map(({ id, version }) => ({ id, version })),
      },
      hashes, renderer: REMOTION_P17_RENDERER_VERSION, toolchain: toolchainFingerprint(browser),
      capabilities: pipeline.p1.render_plan.requirements.capabilities,
      preflight: { visual: pipeline.visual_compile.preflight.summary, p1: pipeline.p1.preflight.summary },
      wow_moments: [
        { id: 'wow_typography', scenes: [pipeline.visual_plan.scenes[0]!.id, pipeline.visual_plan.scenes[3]!.id], phrases: ['TYPE_TRACKING_IMPACT', 'TYPE_AXIS_PULSE', 'WORD_MASK_BRIDGE'] },
        { id: 'wow_continuity', scenes: [pipeline.visual_plan.scenes[2]!.id, pipeline.visual_plan.scenes[3]!.id], bridge: 'FRAME_EXPANSION', chain: 'scatter_semantic_chain' },
        { id: 'wow_depth_camera', scenes: [pipeline.visual_plan.scenes[1]!.id, pipeline.visual_plan.scenes[4]!.id], phrases: ['CAMERA_DEPTH_SURGE', 'FRAME_PORTAL_TRANSFORM'] },
      ],
      reference_eligibility: !git.dirty && pipeline.visual_compile.preflight.summary.errors === 0 && (pipeline.p1.preflight.summary?.errors ?? 0) === 0,
      no_local_gpu_required: true, provider_calls: 0, external_assets: 0, human_visual_review_required: true,
    };
    writeJson(path.join(staging, 'manifest.json'), manifest);
    const textual = ['visual-plan.json', 'visual-preflight.json', 'visual-diversity-report.json', 'visual-provenance.json', 'motion-spec.json', 'render-plan.json', 'p1-preflight.json', 'hashes.json', 'metrics.json', 'manifest.json'];
    const secretPattern = /(sk-[a-z0-9_-]{16,}|OPENAI_API_KEY|ELEVENLABS_API_KEY|FAL_KEY)/iu;
    const leaks = textual.filter((file) => secretPattern.test(readFileSync(path.join(staging, file), 'utf8')));
    expect(leaks).toEqual([]);
    writeJson(path.join(staging, 'security-scan.json'), { schema: 'p3.2-security-scan', schema_version: '0.1.0', files_scanned: textual, leaks: [], result: 'pass' });
    const artifacts = [video, path.join(staging, 'p3-2-contact-sheet.png'), path.join(staging, 'p2-p3-1-p3-2-comparison.png'), path.join(staging, 'p3-2-typography-strip.png'), path.join(staging, 'p3-2-continuity-strip.png'), path.join(staging, 'p3-2-depth-camera-strip.png'), ...frameMetrics.map((entry) => path.join(framesDirectory, `${entry.name}.png`))];
    writeJson(path.join(staging, 'artifact-integrity.json'), artifacts.map((file) => ({ file: path.relative(staging, file).replaceAll('\\', '/'), bytes: statSync(file).size, sha256: sha256File(file) })));
    rmSync(output, { recursive: true, force: true });
    renameSync(staging, output);
  }, 1_200_000);
});
