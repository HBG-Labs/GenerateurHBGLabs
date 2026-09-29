import { ensureBrowser } from '@remotion/renderer';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { canonicalJson } from '@motion-engine/core';
import { RemotionMotionRenderer, REMOTION_P17_RENDERER_VERSION } from '@motion-engine/renderer-remotion';

import { browserExecutable, gitState, sha256File, toolchainFingerprint } from './p1.6-support.ts';
import { buildP17Pipeline } from './p1.7-support.ts';
import { WORKSPACE } from './support.ts';
import { comparePngFiles, createGridBoard, CROSS_ENVIRONMENT_TOLERANCE } from './visual-regression.ts';

const FRAME_POINTS = Object.freeze([
  { name: 'start', frame: 6 },
  { name: 'mid', frame: 72 },
  { name: 'end', frame: 144 },
  { name: 'hold', frame: 190 },
] as const);

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

describe('P1.7 — rendu réel Dynamic Typography', () => {
  it('rend tracking/wght/wdth et vérifie les frames P1.7 sans toucher aux goldens historiques', async () => {
    const browser = await availableBrowser();
    const compileStarted = performance.now();
    const fixture = buildP17Pipeline({}, 1);
    const compileMs = performance.now() - compileStarted;
    expect(fixture.pipeline.render_plan).toMatchObject({ schema_version: '0.4.0', compiler_version: '0.6.0' });
    expect(fixture.pipeline.preflight.summary?.errors ?? 0).toBe(0);

    const output = path.join(WORKSPACE, 'out', 'p1.7', 'reference');
    const framesDirectory = path.join(output, 'frames');
    const goldenDirectory = path.join(WORKSPACE, 'core', 'goldens', 'p1.7', 'visual');
    const updateGoldens = process.env['UPDATE_P17_VISUAL_GOLDENS'] === '1';
    mkdirSync(framesDirectory, { recursive: true });
    if (updateGoldens) mkdirSync(goldenDirectory, { recursive: true });

    const renderer = new RemotionMotionRenderer({ browserExecutable: browser, dynamicTypography: true });
    const video = path.join(output, 'p1-7-dynamic-typography.mp4');
    const renderedFrames: string[] = [];
    const comparisons: Record<string, ReturnType<typeof comparePngFiles>> = {};
    const frameMetrics: Array<{ name: string; frame: number; render_ms: number; bytes: number }> = [];
    let renderResult;
    try {
      renderResult = await renderer.renderVideo({ plan: fixture.pipeline.render_plan, output_file: video, resource_root: WORKSPACE });
      for (const point of FRAME_POINTS) {
        const file = path.join(framesDirectory, `${point.name}.png`);
        const result = await renderer.renderFrame({ plan: fixture.pipeline.render_plan, output_file: file, frame: point.frame, resource_root: WORKSPACE });
        const golden = path.join(goldenDirectory, `${point.name}.png`);
        if (updateGoldens) copyFileSync(file, golden);
        if (!existsSync(golden)) throw new Error(`Golden visuel P1.7 absent : ${golden}. Utiliser explicitement golden:update:visual:p1.7.`);
        comparisons[point.name] = comparePngFiles(golden, file, CROSS_ENVIRONMENT_TOLERANCE);
        renderedFrames.push(file);
        frameMetrics.push({ ...point, render_ms: result.render_ms, bytes: result.bytes });
      }
    } finally {
      renderer.dispose();
    }

    expect(isMp4(video)).toBe(true);
    expect(Object.values(comparisons).every((comparison) => comparison.within_tolerance)).toBe(true);
    const frameHashes = renderedFrames.map(sha256File);
    expect(new Set(frameHashes.slice(0, 3)).size).toBe(3);
    expect(frameHashes[3]).toBe(frameHashes[2]);
    createGridBoard(renderedFrames, 4, path.join(output, 'p1-7-contact-sheet.png'));
    writeJson(path.join(output, 'motion-spec.json'), fixture.spec);
    writeJson(path.join(output, 'render-plan.json'), fixture.pipeline.render_plan);
    writeJson(path.join(output, 'preflight.json'), fixture.pipeline.preflight);
    writeJson(path.join(output, 'hashes.json'), { ...fixture.pipeline.hashes, reference_film: sha256File(video) });
    writeJson(path.join(output, 'visual-regression-report.json'), {
      schema: 'p1.7-visual-regression-report', schema_version: '0.1.0', update_mode: updateGoldens,
      tolerance: CROSS_ENVIRONMENT_TOLERANCE, comparisons,
      result: Object.values(comparisons).every((comparison) => comparison.within_tolerance) ? 'pass' : 'fail',
      human_review_required: true,
    });
    writeJson(path.join(output, 'metrics.json'), {
      schema: 'p1.7-render-metrics', schema_version: '0.1.0',
      environment: { os: process.platform, arch: process.arch, node: process.version, local_gpu_required: false },
      compile_ms: compileMs,
      render: { ...renderResult, frames_per_second: renderResult.frames / (renderResult.render_ms / 1_000) },
      frames: frameMetrics,
      node_peak_memory_bytes: process.resourceUsage().maxRSS * 1_024,
    });
    const git = gitState();
    writeJson(path.join(output, 'manifest.json'), {
      schema: 'p1.7-reference-manifest', schema_version: '0.1.0', commit: git.commit, tree_clean: !git.dirty,
      renderer: REMOTION_P17_RENDERER_VERSION, toolchain: toolchainFingerprint(browser),
      contracts: { render_plan: fixture.pipeline.render_plan.schema_version, compiler: fixture.pipeline.render_plan.compiler_version },
      hashes: fixture.pipeline.hashes, capabilities: fixture.pipeline.render_plan.requirements.capabilities,
      preflight: fixture.pipeline.preflight.summary, reference_eligible: !git.dirty && (fixture.pipeline.preflight.summary?.errors ?? 0) === 0,
      provider_calls: 0, local_gpu_required: false,
    });
    const artifacts = [video, path.join(output, 'p1-7-contact-sheet.png'), ...renderedFrames];
    writeJson(path.join(output, 'artifact-integrity.json'), artifacts.map((file) => ({
      file: path.relative(output, file).replaceAll('\\', '/'), bytes: statSync(file).size, sha256: sha256File(file),
    })));
  }, 300_000);
});
