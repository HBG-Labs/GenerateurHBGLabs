import { ensureBrowser } from '@remotion/renderer';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { canonicalJson } from '@motion-engine/core';
import { RemotionMotionRenderer } from '@motion-engine/renderer-remotion';

import { buildP14Pipeline } from './p1.4-support.ts';
import { browserExecutable, buildCertificationPair, controlFrames, gitState, sha256File } from './p1.6-support.ts';
import { WORKSPACE } from './support.ts';
import { comparePngFiles, createGridBoard, CROSS_ENVIRONMENT_TOLERANCE } from './visual-regression.ts';

function writeJson(file: string, value: unknown): void { writeFileSync(file, `${canonicalJson(value)}\n`, 'utf8'); }
function isMp4(file: string): boolean { const bytes = readFileSync(file).subarray(0, 12); return bytes.length >= 8 && bytes.subarray(4, 8).toString('ascii') === 'ftyp'; }

async function certifiedBrowser(): Promise<string> {
  const existing = browserExecutable();
  if (existing) return existing;
  const status = await ensureBrowser({ chromeMode: 'chrome-for-testing', logLevel: 'warn' });
  if (status.type === 'user-defined-path' || status.type === 'local-puppeteer-browser') return status.path;
  throw new Error(`Chromium indisponible après ensureBrowser (${status.type}).`);
}

describe('P1.6 — gate de rendu réel et certification visuelle', () => {
  it('rend Signal et Nocturne, compare dix frames et publie un dossier atomique complet', async () => {
    const git = gitState();
    expect(git.dirty, 'La certification de référence P1.6 exige un commit propre.').toBe(false);
    const browser = await certifiedBrowser();
    const pair = buildCertificationPair({ referenceEligible: true, git, browserPath: browser });
    expect(pair.signal.manifest.engine.reference_eligible).toBe(true);
    expect(pair.nocturne.manifest.engine.reference_eligible).toBe(true);
    const renderer = new RemotionMotionRenderer({ browserExecutable: browser });
    const out = path.join(WORKSPACE, 'out', 'p1.6', 'certification');
    const framesDirectory = path.join(out, 'frames');
    const goldenDirectory = path.join(WORKSPACE, 'certification', 'goldens', 'visual');
    mkdirSync(framesDirectory, { recursive: true });

    const signalVideo = path.join(out, 'signal.mp4');
    const nocturneVideo = path.join(out, 'nocturne.mp4');
    let signalRender;
    let nocturneRender;
    const comparisons: Record<string, ReturnType<typeof comparePngFiles>> = {};
    const boardFiles: string[] = [];
    const frameMetrics: Array<{ style: string; phase: string; frame: number; render_ms: number; bytes: number }> = [];
    try {
      signalRender = await renderer.renderVideo({ plan: pair.signal.render_plan, output_file: signalVideo, resource_root: WORKSPACE });
      nocturneRender = await renderer.renderVideo({ plan: pair.nocturne.render_plan, output_file: nocturneVideo, resource_root: WORKSPACE });
      for (const [style, compiled] of [['signal', pair.signal], ['nocturne', pair.nocturne]] as const) {
        for (const point of controlFrames(compiled.render_plan.canvas.duration_frames)) {
          const name = `${style}-${point.phase.toLowerCase()}.png`;
          const candidate = path.join(framesDirectory, name);
          const rendered = await renderer.renderFrame({ plan: compiled.render_plan, output_file: candidate, frame: point.frame, resource_root: WORKSPACE });
          comparisons[name] = comparePngFiles(path.join(goldenDirectory, name), candidate, CROSS_ENVIRONMENT_TOLERANCE);
          boardFiles.push(candidate);
          frameMetrics.push({ style, phase: point.phase, frame: point.frame, render_ms: rendered.render_ms, bytes: rendered.bytes });
        }
      }
      const full = buildP14Pipeline(1).signalPlan;
      await renderer.renderFrame({ plan: full, output_file: path.join(out, 'frame-1080x1920.png'), frame: controlFrames(full.canvas.duration_frames)[3]!.frame, resource_root: WORKSPACE });
    } finally { renderer.dispose(); }

    expect(isMp4(signalVideo)).toBe(true);
    expect(isMp4(nocturneVideo)).toBe(true);
    expect(Object.values(comparisons).every((comparison) => comparison.within_tolerance)).toBe(true);
    expect(signalRender.bundle_reused).toBe(false);
    expect(nocturneRender.bundle_reused).toBe(true);
    expect(nocturneRender.bundle_ms).toBe(0);
    createGridBoard(boardFiles, 5, path.join(out, 'contact-sheet.png'));

    for (const [style, compiled] of [['signal', pair.signal], ['nocturne', pair.nocturne]] as const) {
      writeJson(path.join(out, `render-plan-${style}.json`), compiled.render_plan);
      writeJson(path.join(out, `audio-plan-${style}.json`), compiled.audio_plan);
      writeJson(path.join(out, `subtitle-plan-${style}.json`), compiled.subtitle_plan);
      writeJson(path.join(out, `dependency-graph-${style}.json`), compiled.dependency_graph);
      writeJson(path.join(out, `preflight-${style}.json`), compiled.preflight);
      writeJson(path.join(out, `manifest-${style}.json`), compiled.manifest);
    }
    writeJson(path.join(out, 'toolchain-fingerprint.json'), pair.toolchain);
    writeJson(path.join(out, 'semantic-fingerprints.json'), pair.semantic);
    writeJson(path.join(out, 'render-plan-hashes.json'), {
      signal: pair.signal.hashes.render_plan, nocturne: pair.nocturne.hashes.render_plan,
      signal_dependency_graph: pair.signal.hashes.dependency_graph, nocturne_dependency_graph: pair.nocturne.hashes.dependency_graph,
    });
    writeJson(path.join(out, 'visual-regression-report.json'), {
      schema: 'p1.6-visual-regression-report', schema_version: '0.1.0',
      tolerance: CROSS_ENVIRONMENT_TOLERANCE, comparisons,
      result: Object.values(comparisons).every((comparison) => comparison.within_tolerance) ? 'pass' : 'fail',
      human_review_required: true,
    });
    const metrics = {
      schema: 'p1.6-metrics', schema_version: '0.1.0', environment: { os: process.platform, arch: process.arch, node: process.version },
      compile: pair.metrics,
      rendering: {
        signal: { ...signalRender, frames_per_second: signalRender.frames / (signalRender.render_ms / 1000) },
        nocturne: { ...nocturneRender, frames_per_second: nocturneRender.frames / (nocturneRender.render_ms / 1000) },
        control_frames: frameMetrics,
        node_peak_memory_bytes: process.resourceUsage().maxRSS * 1024,
        chromium_memory_bytes: null,
        ffmpeg_memory_bytes: null,
      },
      p1_5_windows_baseline: { signal_compile_ms: 43.2722, nocturne_compile_ms: 17.4447, bundle_ms: 3138.0301, signal_render_ms: 26801.884, nocturne_render_ms: 25507.4847, node_peak_memory_bytes: 694943744 },
      policy: { functional_gates: 'strict', observations: 'informative', catastrophic_ratio: 3, catastrophic_gate_enabled_in_shared_ci: false },
    };
    writeJson(path.join(out, 'metrics.json'), metrics);
    const artifacts = [signalVideo, nocturneVideo, path.join(out, 'frame-1080x1920.png'), path.join(out, 'contact-sheet.png')]
      .map((file) => ({ file: path.relative(out, file).replaceAll('\\', '/'), bytes: statSync(file).size, sha256: sha256File(file) }));
    writeJson(path.join(out, 'artifact-integrity.json'), artifacts);
    writeJson(path.join(out, 'certification-report.json'), {
      schema: 'p1.6-certification-report', schema_version: '0.1.0', commit: git.commit,
      host: { os: process.platform, arch: process.arch },
      linux_real_render: process.platform === 'linux',
      semantic_determinism: 'pass', render_determinism: 'pass_with_documented_tolerance', binary_determinism: 'not_claimed',
      styles: ['signal', 'nocturne'], visual_regression: 'pass', reference_eligible: true,
      warnings: ['contrast.unknown_on_image'], artifacts,
    });
    expect(existsSync(path.join(out, 'certification-report.json'))).toBe(true);
  }, 180_000);
});
