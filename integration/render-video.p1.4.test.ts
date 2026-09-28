import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { describe, expect, it } from 'vitest';

import { buildReproducibilityManifest, canonicalJson, hashDocument } from '@motion-engine/core';
import type { RenderPlan, ResolvedStyle } from '@motion-engine/core';
import { RemotionMotionRenderer } from '@motion-engine/renderer-remotion';

import { platforms } from './p1.2-support.ts';
import { buildP13Pipeline } from './p1.3-support.ts';
import { buildP14Pipeline } from './p1.4-support.ts';
import { WORKSPACE } from './support.ts';
import { createSideBySideBoard, CROSS_ENVIRONMENT_TOLERANCE } from './visual-regression.ts';

function browserExecutable(): string | undefined {
  return [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
  ].find((candidate) => existsSync(candidate));
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, `${canonicalJson(value)}\n`, 'utf8');
}

function sha256File(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function isMp4(file: string): boolean {
  const header = readFileSync(file).subarray(0, 12);
  return header.length >= 8 && header.subarray(4, 8).toString('ascii') === 'ftyp';
}

function gitState(): { commit: string; dirty: boolean } {
  const git = (args: string[]): string => execFileSync(
    'git',
    ['-c', `safe.directory=${WORKSPACE.replaceAll('\\', '/')}`, ...args],
    { cwd: WORKSPACE, encoding: 'utf8' },
  ).trim();
  const commit = git(['rev-parse', 'HEAD']);
  const status = git(['status', '--porcelain', '--untracked-files=normal']);
  return { commit, dirty: status.length > 0 };
}

function manifest(
  state: ReturnType<typeof gitState>,
  style: ResolvedStyle,
  plan: RenderPlan,
  spec: ReturnType<typeof buildP14Pipeline>['spec'],
  executable: string | undefined,
  substitutionReason?: string,
) {
  return buildReproducibilityManifest({
    createdAt: new Date().toISOString(),
    engine: {
      name: '@motion-engine/core',
      version: '0.3.0',
      git_commit: state.commit,
      git_dirty: state.dirty,
      reference_eligible: !state.dirty,
    },
    spec,
    resolvedStyle: style,
    plan,
    platformPresets: platforms(),
    toolchain: { node: process.version, package_manager: 'npm@11.17.0', lockfile_sha256: '0'.repeat(64), remotion: '4.0.529', chromium: executable ?? null, ffmpeg: 'Remotion bundled (version not exposed)', renderer_package: '0.5.0', os: process.platform, arch: process.arch },
    renderConfig: {
      width: plan.canvas.width,
      height: plan.canvas.height,
      fps: plan.canvas.fps,
      codec: 'h264',
      crf: null,
      pixel_format: null,
    },
    renderer: { name: '@motion-engine/renderer-remotion', version: '0.3.0' },
    ...(substitutionReason ? { substitutionReason } : {}),
  });
}

describe('références visuelles P1.4', () => {
  it('produit deux MP4, une planche comparative et une frame 1080×1920 avec un bundle mutualisé', async () => {
    const state = gitState();
    const memoryBefore = process.memoryUsage().rss;
    const p13Started = performance.now();
    buildP13Pipeline();
    const p13CompileMs = performance.now() - p13Started;
    const p14Started = performance.now();
    const pipeline = buildP14Pipeline(0.5);
    const p14CompileMs = performance.now() - p14Started;
    const fullResolution = buildP14Pipeline(1);
    const memoryAfterCompile = process.memoryUsage().rss;
    const showcaseFrame = Math.min(100, pipeline.signalPlan.canvas.duration_frames - 1);
    const out = path.join(WORKSPACE, 'out', 'p1.4');
    mkdirSync(out, { recursive: true });

    const signalVideo = path.join(out, 'p1-4-signal.mp4');
    const nocturneVideo = path.join(out, 'p1-4-nocturne.mp4');
    const signalFrame = path.join(out, 'p1-4-signal-frame.png');
    const nocturneFrame = path.join(out, 'p1-4-nocturne-frame.png');
    const targetFrame = path.join(out, 'p1-4-signal-1080x1920.png');
    const comparisonBoard = path.join(out, 'p1-4-comparison.png');
    writeJson(path.join(out, 'motion-scene-spec.json'), pipeline.spec);
    writeJson(path.join(out, 'p1-4-signal.render-plan.json'), pipeline.signalPlan);
    writeJson(path.join(out, 'p1-4-nocturne.render-plan.json'), pipeline.nocturnePlan);

    const executable = browserExecutable();
    const renderer = new RemotionMotionRenderer(executable ? { browserExecutable: executable } : {});
    let signal;
    let nocturne;
    let signalStill;
    let nocturneStill;
    let targetStill;
    try {
      signal = await renderer.renderVideo({ plan: pipeline.signalPlan, output_file: signalVideo, resource_root: WORKSPACE });
      nocturne = await renderer.renderVideo({ plan: pipeline.nocturnePlan, output_file: nocturneVideo, resource_root: WORKSPACE });
      signalStill = await renderer.renderFrame({ plan: pipeline.signalPlan, output_file: signalFrame, frame: showcaseFrame, resource_root: WORKSPACE });
      nocturneStill = await renderer.renderFrame({ plan: pipeline.nocturnePlan, output_file: nocturneFrame, frame: showcaseFrame, resource_root: WORKSPACE });
      targetStill = await renderer.renderFrame({ plan: fullResolution.signalPlan, output_file: targetFrame, frame: showcaseFrame, resource_root: WORKSPACE });
    } finally {
      renderer.dispose();
    }
    createSideBySideBoard(signalFrame, nocturneFrame, comparisonBoard);

    const signalManifest = manifest(state, pipeline.signalStyle, pipeline.signalPlan, pipeline.spec, executable);
    const nocturneManifest = manifest(
      state,
      pipeline.nocturneStyle,
      pipeline.nocturnePlan,
      pipeline.spec,
      executable,
      'P1.4 : même spec neutre, style de contrôle Nocturne',
    );
    writeJson(path.join(out, 'p1-4-signal.manifest.json'), signalManifest);
    writeJson(path.join(out, 'p1-4-nocturne.manifest.json'), nocturneManifest);

    const previousMetricsFile = path.join(WORKSPACE, 'out', 'p1.3', 'metrics.json');
    const previousMetrics = existsSync(previousMetricsFile) ? JSON.parse(readFileSync(previousMetricsFile, 'utf8')) as unknown : null;
    const metrics = {
      environment: { node: process.version, platform: process.platform, arch: process.arch, browser: executable ?? null },
      git: state,
      compilation_ms: { p1_3_pipeline: p13CompileMs, p1_4_pipeline: p14CompileMs },
      memory: {
        rss_before_bytes: memoryBefore,
        rss_after_compile_bytes: memoryAfterCompile,
        compile_delta_bytes: memoryAfterCompile - memoryBefore,
        note: 'RSS du processus Node hôte ; Chromium/FFmpeg ne sont pas agrégés.',
      },
      bundle_mutualization: {
        first_render_bundle_ms: signal.bundle_ms,
        subsequent_render_bundle_ms: nocturne.bundle_ms,
        subsequent_render_reused: nocturne.bundle_reused,
      },
      render: { signal, nocturne, signalStill, nocturneStill, targetStill },
      p1_3_recorded_metrics: previousMetrics,
    };
    writeJson(path.join(out, 'metrics.json'), metrics);
    writeJson(path.join(out, 'visual-regression.json'), {
      environment: metrics.environment,
      frame: showcaseFrame,
      exact_reference_hashes: {
        signal: sha256File(signalFrame),
        nocturne: sha256File(nocturneFrame),
        signal_1080x1920: sha256File(targetFrame),
        comparison_board: sha256File(comparisonBoard),
      },
      cross_environment_tolerance: CROSS_ENVIRONMENT_TOLERANCE,
      policy: 'Hash exact sur environnement de référence ; comparaison RGB normalisée avec tolérance entre environnements.',
    });
    writeJson(path.join(out, 'reference-run.json'), {
      git: state,
      reference_eligible: !state.dirty,
      spec_sha256: hashDocument(pipeline.spec),
      signal_plan_sha256: hashDocument(pipeline.signalPlan),
      nocturne_plan_sha256: hashDocument(pipeline.nocturnePlan),
    });

    expect(signal.bytes).toBeGreaterThan(10_000);
    expect(nocturne.bytes).toBeGreaterThan(10_000);
    expect(isMp4(signalVideo)).toBe(true);
    expect(isMp4(nocturneVideo)).toBe(true);
    expect(signal.bundle_reused).toBe(false);
    expect(nocturne.bundle_reused).toBe(true);
    expect(nocturne.bundle_ms).toBe(0);
    expect(signalStill.bundle_reused && nocturneStill.bundle_reused && targetStill.bundle_reused).toBe(true);
    expect(readFileSync(targetFrame).length).toBeGreaterThan(10_000);
  }, 600_000);
});
