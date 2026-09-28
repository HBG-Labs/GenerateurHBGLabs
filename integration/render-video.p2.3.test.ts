import { ensureBrowser } from '@remotion/renderer';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { canonicalJson } from '@motion-engine/core';
import { RemotionMotionRenderer } from '@motion-engine/renderer-remotion';

import { browserExecutable, controlFrames, sha256File } from './p1.6-support.ts';
import { buildP23Pipeline } from './p2.3-support.ts';
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

describe('P2.3 — rendu réel CreativePlan vers MP4', () => {
  it('rend la fixture hypothétique avec Signal et Nocturne et vérifie ses références propres', async () => {
    const browser = await availableBrowser();
    const signal = buildP23Pipeline('hypothetical-30s', 'signal', 1);
    const nocturne = buildP23Pipeline('hypothetical-30s', 'nocturne', 1);
    expect(signal.p1.render_plan.canvas).toMatchObject({ width: 1080, height: 1920, fps: 30, duration_frames: 900 });
    expect(nocturne.p1.render_plan.canvas).toMatchObject({ width: 1080, height: 1920, fps: 30, duration_frames: 900 });

    const out = path.join(WORKSPACE, 'out', 'p2.3', 'reference');
    const framesDirectory = path.join(out, 'frames');
    const goldenDirectory = path.join(WORKSPACE, 'creative-compiler', 'goldens', 'p2.3', 'visual');
    const updateGoldens = process.env['UPDATE_P23_VISUAL_GOLDENS'] === '1';
    mkdirSync(framesDirectory, { recursive: true });
    if (updateGoldens) mkdirSync(goldenDirectory, { recursive: true });

    const renderer = new RemotionMotionRenderer({ browserExecutable: browser });
    const signalVideo = path.join(out, 'p2-3-hypothetical-signal.mp4');
    const nocturneVideo = path.join(out, 'p2-3-hypothetical-nocturne.mp4');
    const comparisons: Record<string, ReturnType<typeof comparePngFiles>> = {};
    const frameMetrics: Array<{ style: string; phase: string; frame: number; render_ms: number; bytes: number }> = [];
    const boardFiles: string[] = [];
    let signalRender;
    let nocturneRender;
    try {
      signalRender = await renderer.renderVideo({ plan: signal.p1.render_plan, output_file: signalVideo, resource_root: WORKSPACE });
      nocturneRender = await renderer.renderVideo({ plan: nocturne.p1.render_plan, output_file: nocturneVideo, resource_root: WORKSPACE });
      for (const [style, compiled] of [['signal', signal], ['nocturne', nocturne]] as const) {
        const points = controlFrames(compiled.p1.render_plan.canvas.duration_frames);
        for (const point of points) {
          const name = `${style}-${point.phase.toLowerCase()}.png`;
          const candidate = path.join(framesDirectory, name);
          const rendered = await renderer.renderFrame({
            plan: compiled.p1.render_plan,
            output_file: candidate,
            frame: point.frame,
            resource_root: WORKSPACE,
          });
          const golden = path.join(goldenDirectory, name);
          if (updateGoldens) copyFileSync(candidate, golden);
          if (!existsSync(golden)) throw new Error(`Référence visuelle P2.3 absente : ${golden}. Utiliser explicitement UPDATE_P23_VISUAL_GOLDENS=1.`);
          comparisons[name] = comparePngFiles(golden, candidate, CROSS_ENVIRONMENT_TOLERANCE);
          frameMetrics.push({ style, phase: point.phase, frame: point.frame, render_ms: rendered.render_ms, bytes: rendered.bytes });
          boardFiles.push(candidate);
        }
        const representative = path.join(out, `${style}-representative.png`);
        copyFileSync(path.join(framesDirectory, `${style}-hold.png`), representative);
      }
    } finally {
      renderer.dispose();
    }

    expect(isMp4(signalVideo)).toBe(true);
    expect(isMp4(nocturneVideo)).toBe(true);
    expect(Object.values(comparisons).every((comparison) => comparison.within_tolerance)).toBe(true);
    expect(signalRender.bundle_reused).toBe(false);
    expect(nocturneRender.bundle_reused).toBe(true);
    createGridBoard(boardFiles, 5, path.join(out, 'contact-sheet.png'));

    for (const [style, compiled] of [['signal', signal], ['nocturne', nocturne]] as const) {
      writeJson(path.join(out, `motion-spec-${style}.json`), compiled.creative_compile.motion_spec);
      writeJson(path.join(out, `creative-compile-report-${style}.json`), compiled.creative_compile.report);
      writeJson(path.join(out, `provenance-${style}.json`), compiled.creative_compile.provenance);
      writeJson(path.join(out, `render-plan-${style}.json`), compiled.p1.render_plan);
      writeJson(path.join(out, `audio-plan-${style}.json`), compiled.p1.audio_plan);
      writeJson(path.join(out, `subtitle-plan-${style}.json`), compiled.p1.subtitle_plan);
      writeJson(path.join(out, `preflight-${style}.json`), compiled.p1.preflight);
    }
    writeJson(path.join(out, 'hashes.json'), {
      signal: { creative: signal.creative_compile.report.hashes, p1: signal.p1.hashes },
      nocturne: { creative: nocturne.creative_compile.report.hashes, p1: nocturne.p1.hashes },
    });
    writeJson(path.join(out, 'visual-regression-report.json'), {
      schema: 'p2.3-visual-regression-report', schema_version: '0.1.0',
      update_mode: updateGoldens,
      tolerance: CROSS_ENVIRONMENT_TOLERANCE,
      comparisons,
      result: Object.values(comparisons).every((comparison) => comparison.within_tolerance) ? 'pass' : 'fail',
      human_review_required: true,
    });
    writeJson(path.join(out, 'metrics.json'), {
      schema: 'p2.3-render-metrics', schema_version: '0.1.0',
      environment: { os: process.platform, arch: process.arch, node: process.version },
      signal: { ...signalRender, frames_per_second: signalRender.frames / (signalRender.render_ms / 1_000) },
      nocturne: { ...nocturneRender, frames_per_second: nocturneRender.frames / (nocturneRender.render_ms / 1_000) },
      control_frames: frameMetrics,
      node_peak_memory_bytes: process.resourceUsage().maxRSS * 1_024,
    });
    writeJson(path.join(out, 'artifact-integrity.json'), [
      signalVideo,
      nocturneVideo,
      path.join(out, 'signal-representative.png'),
      path.join(out, 'nocturne-representative.png'),
      path.join(out, 'contact-sheet.png'),
    ].map((file) => ({
      file: path.relative(out, file).replaceAll('\\', '/'),
      bytes: statSync(file).size,
      sha256: sha256File(file),
    })));
  }, 900_000);
});
