import { ensureBrowser } from '@remotion/renderer';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import { canonicalJson } from '@motion-engine/core';
import { RemotionMotionRenderer, REMOTION_RENDERER_VERSION } from '@motion-engine/renderer-remotion';
import {
  ACTIVE_VISUAL_GRAMMAR,
  CAMERA_DEFINITIONS,
  MOTION_PHRASE_DEFINITIONS,
  SCENE_BRIDGE_DEFINITIONS,
  VISUAL_PATTERN_DEFINITIONS,
  VISUAL_REGISTRY_FINGERPRINTS,
  hashVisualDocument,
} from '@motion-engine/visual-core';

import { browserExecutable, controlFrames, gitState, sha256File, toolchainFingerprint } from './p1.6-support.ts';
import { buildP31Pipeline, p31FontBytes } from './p3.1-support.ts';
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
        const offset = ((y + rowIndex * scale + dy) * target.width + x + (cursor - x) + columnIndex * scale + dx) * 4;
        target.data[offset] = 255; target.data[offset + 1] = 255; target.data[offset + 2] = 255; target.data[offset + 3] = 255;
      }
    }));
    cursor += scale * 6;
  }
}

function comparativeBoard(p2Files: readonly string[], p31Files: readonly string[], outputFile: string): void {
  if (p2Files.length !== p31Files.length || p2Files.length === 0) throw new Error('Comparaison P2/P3.1 incomplète.');
  const p2 = p2Files.map((file) => PNG.sync.read(readFileSync(file)));
  const p31 = p31Files.map((file) => PNG.sync.read(readFileSync(file)));
  const width = p2[0]!.width; const height = p2[0]!.height; const header = 64;
  if ([...p2, ...p31].some((image) => image.width !== width || image.height !== height)) throw new Error('Dimensions P2/P3.1 incompatibles.');
  const output = new PNG({ width: width * p2.length, height: (height + header) * 2 });
  for (let offset = 0; offset < output.data.length; offset += 4) {
    output.data[offset] = 7; output.data[offset + 1] = 26; output.data[offset + 2] = 61; output.data[offset + 3] = 255;
  }
  const pasteRow = (images: readonly PNG[], row: number): void => images.forEach((source, index) => {
    for (let y = 0; y < height; y += 1) {
      const sourceStart = y * width * 4;
      const destinationStart = (((row * (height + header)) + header + y) * output.width + index * width) * 4;
      source.data.copy(output.data, destinationStart, sourceStart, sourceStart + width * 4);
    }
  });
  pasteRow(p2, 0); pasteRow(p31, 1);
  drawLabel(output, 'P2', 20, 10);
  drawLabel(output, 'P3.1', 20, height + header + 10);
  writeFileSync(outputFile, PNG.sync.write(output));
}

describe('P3.1 — film de référence Professional Visual Grammar', () => {
  it('rend, vérifie et publie atomiquement le package de review Ciel bleu', async () => {
    const browser = await availableBrowser();
    const compileStarted = performance.now();
    const pipeline = buildP31Pipeline(1);
    const compileMs = performance.now() - compileStarted;
    expect(pipeline.visual_compile.preflight.summary.errors).toBe(0);
    expect(pipeline.p1.preflight.summary?.errors ?? 0).toBe(0);
    expect(pipeline.p1.render_plan.canvas).toMatchObject({ width: 1080, height: 1920, fps: 30, duration_frames: 900 });

    const output = path.join(WORKSPACE, 'out', 'p3.1', 'reference');
    const framesDirectory = path.join(output, 'frames');
    const goldenDirectory = path.join(WORKSPACE, 'visual-compiler', 'goldens', 'p3.1', 'visual');
    const p2Fixture = path.join(WORKSPACE, 'fixtures', 'p3.1', 'p2-science-baseline');
    const updateGoldens = process.env['UPDATE_P31_VISUAL_GOLDENS'] === '1';
    mkdirSync(framesDirectory, { recursive: true });
    if (updateGoldens) mkdirSync(goldenDirectory, { recursive: true });

    const renderer = new RemotionMotionRenderer({ browserExecutable: browser });
    const video = path.join(output, 'p3-1-blue-sky.mp4');
    const baselineVideo = path.join(output, 'p2-science-baseline.mp4');
    const frameMetrics: Array<{ name: string; frame: number; render_ms: number; bytes: number }> = [];
    const comparisons: Record<string, ReturnType<typeof comparePngFiles>> = {};
    const p31ControlFrames: string[] = [];
    let renderResult;
    try {
      renderResult = await renderer.renderVideo({ plan: pipeline.p1.render_plan, output_file: video, resource_root: WORKSPACE });
      for (const point of controlFrames(900)) {
        const name = `${point.phase.toLowerCase()}.png`;
        const candidate = path.join(framesDirectory, name);
        const frame = await renderer.renderFrame({ plan: pipeline.p1.render_plan, output_file: candidate, frame: point.frame, resource_root: WORKSPACE });
        const golden = path.join(goldenDirectory, name);
        if (updateGoldens) copyFileSync(candidate, golden);
        if (!existsSync(golden)) throw new Error(`Référence visuelle P3.1 absente : ${golden}. Utiliser explicitement UPDATE_P31_VISUAL_GOLDENS=1.`);
        comparisons[name] = comparePngFiles(golden, candidate, CROSS_ENVIRONMENT_TOLERANCE);
        frameMetrics.push({ name, frame: point.frame, render_ms: frame.render_ms, bytes: frame.bytes });
        p31ControlFrames.push(candidate);
      }
      const keyFrames = [
        { name: 'opening', frame: 12 }, { name: 'first-impact', frame: 62 }, { name: 'depth-early', frame: 146 },
        { name: 'depth-late', frame: 220 }, { name: 'kinetic-type', frame: 75 },
        { name: 'bridge-before', frame: 377 }, { name: 'bridge-midpoint', frame: 392 }, { name: 'bridge-after', frame: 405 },
        { name: 'final-composition', frame: 845 },
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
    copyFileSync(path.join(p2Fixture, 'p2-science-baseline.mp4'), baselineVideo);
    copyFileSync(path.join(p2Fixture, 'contact-sheet.png'), path.join(output, 'p2-contact-sheet.png'));
    createGridBoard(p31ControlFrames, 5, path.join(output, 'p3-1-contact-sheet.png'));
    const p2ControlFrames = ['enter', 'accent', 'settle', 'hold', 'exit'].map((name) => path.join(p2Fixture, 'frames', `${name}.png`));
    comparativeBoard(p2ControlFrames, p31ControlFrames, path.join(output, 'p2-vs-p3-1-comparison-sheet.png'));

    writeJson(path.join(output, 'visual-plan.json'), pipeline.visual_plan);
    writeJson(path.join(output, 'visual-preflight.json'), pipeline.visual_compile.preflight);
    writeJson(path.join(output, 'visual-diversity-report.json'), pipeline.diversity);
    writeJson(path.join(output, 'visual-provenance.json'), pipeline.visual_compile.provenance);
    writeJson(path.join(output, 'motion-spec.json'), pipeline.visual_compile.motion_spec);
    writeJson(path.join(output, 'render-plan.json'), pipeline.p1.render_plan);
    writeJson(path.join(output, 'p1-preflight.json'), pipeline.p1.preflight);
    writeJson(path.join(output, 'hashes.json'), {
      grammar: ACTIVE_VISUAL_GRAMMAR.fingerprint, registries: VISUAL_REGISTRY_FINGERPRINTS,
      visual_plan: hashVisualDocument(pipeline.visual_plan), motion_spec: pipeline.visual_compile.hashes.motion_spec,
      compiler: pipeline.visual_compile.hashes.compiler_fingerprint, render_plan: pipeline.p1.hashes.render_plan,
      reference_film: sha256File(video), p2_baseline: sha256File(baselineVideo),
    });
    writeJson(path.join(output, 'visual-regression-report.json'), {
      schema: 'p3.1-visual-regression-report', schema_version: '0.1.0', update_mode: updateGoldens,
      tolerance: CROSS_ENVIRONMENT_TOLERANCE, comparisons,
      result: Object.values(comparisons).every((entry) => entry.within_tolerance) ? 'pass' : 'fail',
      human_review_required: true,
      limitation: 'A contact sheet cannot demonstrate easing, speed, fluidity, or real timing; inspect the MP4.',
    });
    writeJson(path.join(output, 'metrics.json'), {
      schema: 'p3.1-render-metrics', schema_version: '0.1.0',
      environment: { os: process.platform, arch: process.arch, node: process.version, local_gpu_required: false },
      compile_visual_pipeline_ms: compileMs,
      render: { ...renderResult, frames_per_second: renderResult.frames / (renderResult.render_ms / 1_000) },
      control_frames: frameMetrics,
      node_peak_memory_bytes: process.resourceUsage().maxRSS * 1_024,
      complexity: {
        scenes: pipeline.visual_plan.scenes.length,
        entities: pipeline.visual_plan.scenes.reduce((sum, scene) => sum + scene.entities.length, 0),
        layers: pipeline.visual_compile.provenance.length,
        tracks: pipeline.p1.render_plan.scenes.reduce((sum, scene) => sum + JSON.stringify(scene).split('"property"').length - 1, 0),
        patterns: pipeline.visual_plan.scenes.reduce((sum, scene) => sum + scene.patterns.length, 0),
        bridges: pipeline.visual_plan.bridges.length,
        depth_layers: pipeline.visual_plan.scenes.reduce((sum, scene) => sum + scene.depth_layers.length, 0),
        font_bytes: p31FontBytes(),
      },
    });
    const git = gitState();
    const manifest = {
      schema: 'p3.1-reference-manifest', schema_version: '0.1.0', commit: git.commit, tree_clean: !git.dirty,
      baseline_p2_commit: 'd52ce75ac15a3f4004390ee8f77db54a19dd60ec',
      visual_grammar: { version: ACTIVE_VISUAL_GRAMMAR.version, sha256: ACTIVE_VISUAL_GRAMMAR.fingerprint },
      registries: VISUAL_REGISTRY_FINGERPRINTS,
      registry_versions: {
        patterns: VISUAL_PATTERN_DEFINITIONS.map(({ id, version }) => ({ id, version })),
        phrases: MOTION_PHRASE_DEFINITIONS.map(({ id, version }) => ({ id, version })),
        bridges: SCENE_BRIDGE_DEFINITIONS.map(({ id, version }) => ({ id, version })),
        cameras: CAMERA_DEFINITIONS.map(({ id, version }) => ({ id, version })),
      },
      hashes: { visual_plan: hashVisualDocument(pipeline.visual_plan), motion_spec: pipeline.visual_compile.hashes.motion_spec, render_plan: pipeline.p1.hashes.render_plan },
      renderer: REMOTION_RENDERER_VERSION, toolchain: toolchainFingerprint(browser),
      capabilities: pipeline.p1.render_plan.requirements.capabilities,
      preflight: { visual: pipeline.visual_compile.preflight.summary, p1: pipeline.p1.preflight.summary },
      reference_eligibility: !git.dirty && pipeline.visual_compile.preflight.summary.errors === 0 && (pipeline.p1.preflight.summary?.errors ?? 0) === 0,
      no_local_gpu_required: true, provider_calls: 0, human_visual_review_required: true,
    };
    writeJson(path.join(output, 'manifest.json'), manifest);
    const artifacts = [
      video, baselineVideo, path.join(output, 'p3-1-contact-sheet.png'), path.join(output, 'p2-vs-p3-1-comparison-sheet.png'),
      ...p31ControlFrames, ...['opening', 'first-impact', 'depth-early', 'depth-late', 'kinetic-type', 'bridge-before', 'bridge-midpoint', 'bridge-after', 'final-composition'].map((name) => path.join(framesDirectory, `${name}.png`)),
    ];
    writeJson(path.join(output, 'artifact-integrity.json'), artifacts.map((file) => ({ file: path.relative(output, file).replaceAll('\\', '/'), bytes: statSync(file).size, sha256: sha256File(file) })));
  }, 1_200_000);
});
