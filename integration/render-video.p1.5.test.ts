import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { describe, expect, it } from 'vitest';

import { canonicalJson, compileForRender, hashDocument, RenderMetricsSchema } from '@motion-engine/core';
import { REMOTION_RENDERER_VERSION, RemotionMotionRenderer } from '@motion-engine/renderer-remotion';

import { pattern, platforms } from './p1.2-support.ts';
import { buildP14Pipeline, p14FontResources } from './p1.4-support.ts';
import { WORKSPACE } from './support.ts';
import { createSideBySideBoard, CROSS_ENVIRONMENT_TOLERANCE } from './visual-regression.ts';

function browserExecutable(): string | undefined {
  return [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium',
  ].find((candidate) => existsSync(candidate));
}

function commandVersion(command: string | undefined): string | null {
  if (!command) return null;
  try {
    if (process.platform === 'win32') {
      const literal = command.replaceAll("'", "''");
      const version = execFileSync('pwsh.exe', ['-NoProfile', '-Command', `(Get-Item -LiteralPath '${literal}').VersionInfo.ProductVersion`], { encoding: 'utf8' }).trim();
      return version ? `Chrome ${version}` : command;
    }
    return execFileSync(command, ['--version'], { encoding: 'utf8' }).trim();
  } catch { return command; }
}

function writeJson(file: string, value: unknown): void { writeFileSync(file, `${canonicalJson(value)}\n`, 'utf8'); }
function sha256File(file: string): string { return createHash('sha256').update(readFileSync(file)).digest('hex'); }
function isMp4(file: string): boolean { const bytes = readFileSync(file).subarray(0, 12); return bytes.length >= 8 && bytes.subarray(4, 8).toString('ascii') === 'ftyp'; }

function gitState(): { commit: string; dirty: boolean } {
  const git = (args: string[]) => execFileSync('git', ['-c', `safe.directory=${WORKSPACE.replaceAll('\\', '/')}`, ...args], { cwd: WORKSPACE, encoding: 'utf8' }).trim();
  return { commit: git(['rev-parse', 'HEAD']), dirty: git(['status', '--porcelain', '--untracked-files=normal']).length > 0 };
}

describe('références P1.5', () => {
  it('produit le dossier de preuve complet depuis un commit propre, avec bundle mutualisé', async () => {
    const state = gitState();
    expect(state.dirty, 'Les références P1.5 exigent un commit propre.').toBe(false);
    const fixture = buildP14Pipeline(0.5);
    const platform = platforms();
    const definition = pattern();
    const executable = browserExecutable();
    const chromeVersion = commandVersion(executable);
    const renderer = new RemotionMotionRenderer(executable ? { browserExecutable: executable } : {});
    const manifestContext = (substitutionReason?: string) => ({
      createdAt: new Date().toISOString(),
      engine: { name: '@motion-engine/core', version: '0.4.0', git_commit: state.commit, git_dirty: state.dirty, reference_eligible: true },
      platformPresets: platform,
      toolchain: { node: process.version, remotion: '4.0.529', chromium: chromeVersion, ffmpeg: 'Remotion bundled', renderer_package: REMOTION_RENDERER_VERSION, os: process.platform, arch: process.arch },
      renderConfig: { width: 540, height: 960, fps: 30, codec: 'h264' as const, crf: null, pixel_format: null },
      ...(substitutionReason ? { substitutionReason } : {}),
    });
    const common = {
      spec: fixture.spec, platformPresets: platform, pattern: definition,
      assetResources: { [fixture.asset.ref]: fixture.asset }, config: { fps: 30, render_scale: 0.5, minimum_readable_size: 14 },
    } as const;
    const signalCompileStarted = performance.now();
    const signal = compileForRender(
      { ...common, resolvedStyle: fixture.signalStyle, fontResources: p14FontResources(fixture.signalStyle) },
      renderer.descriptor, manifestContext(),
    );
    const signalCompileMs = performance.now() - signalCompileStarted;
    const nocturneCompileStarted = performance.now();
    const nocturne = compileForRender(
      { ...common, resolvedStyle: fixture.nocturneStyle, fontResources: p14FontResources(fixture.nocturneStyle), allowStyleSubstitution: true },
      renderer.descriptor, manifestContext('P1.5 : même spec neutre, style de contrôle Nocturne'),
    );
    const nocturneCompileMs = performance.now() - nocturneCompileStarted;
    const full = buildP14Pipeline(1).signalPlan;
    const out = path.join(WORKSPACE, 'out', 'p1.5', 'reference');
    mkdirSync(out, { recursive: true });
    const signalVideo = path.join(out, 'p1-5-signal.mp4');
    const nocturneVideo = path.join(out, 'p1-5-nocturne.mp4');
    const signalFrame = path.join(out, 'signal-frame.png');
    const nocturneFrame = path.join(out, 'nocturne-frame.png');
    const targetFrame = path.join(out, 'frame-1080x1920.png');
    const contactSheet = path.join(out, 'contact-sheet.png');
    const frame = Math.min(100, signal.render_plan.canvas.duration_frames - 1);

    writeJson(path.join(out, 'spec.json'), fixture.spec);
    writeJson(path.join(out, 'resolved-style-signal.json'), fixture.signalStyle);
    writeJson(path.join(out, 'resolved-style-nocturne.json'), fixture.nocturneStyle);
    for (const [name, compiled] of [['signal', signal], ['nocturne', nocturne]] as const) {
      writeJson(path.join(out, `render-plan-${name}.json`), compiled.render_plan);
      writeJson(path.join(out, `audio-plan-${name}.json`), compiled.audio_plan);
      writeJson(path.join(out, `subtitle-plan-${name}.json`), compiled.subtitle_plan);
      writeJson(path.join(out, `dependency-graph-${name}.json`), compiled.dependency_graph);
      writeJson(path.join(out, `preflight-${name}.json`), compiled.preflight);
      writeJson(path.join(out, `manifest-${name}.json`), compiled.manifest);
    }

    let signalRender;
    let nocturneRender;
    let signalStill;
    let nocturneStill;
    let targetStill;
    try {
      signalRender = await renderer.renderVideo({ plan: signal.render_plan, output_file: signalVideo, resource_root: WORKSPACE });
      nocturneRender = await renderer.renderVideo({ plan: nocturne.render_plan, output_file: nocturneVideo, resource_root: WORKSPACE });
      signalStill = await renderer.renderFrame({ plan: signal.render_plan, output_file: signalFrame, frame, resource_root: WORKSPACE });
      nocturneStill = await renderer.renderFrame({ plan: nocturne.render_plan, output_file: nocturneFrame, frame, resource_root: WORKSPACE });
      targetStill = await renderer.renderFrame({ plan: full, output_file: targetFrame, frame, resource_root: WORKSPACE });
    } finally { renderer.dispose(); }
    createSideBySideBoard(signalFrame, nocturneFrame, contactSheet);

    const measured = (value: number, unit: 'ms' | 'frames/s' | 'bytes') => ({ value, unit, kind: 'measured' as const });
    const signalMetrics = RenderMetricsSchema.parse({
      schema: 'render-metrics', schema_version: '0.1.0', compile_ms: measured(signalCompileMs, 'ms'), text_shape_ms: null,
      bundle_ms: measured(signalRender.bundle_ms, 'ms'), render_ms: measured(signalRender.render_ms, 'ms'),
      frames_per_second: measured(signalRender.frames / (signalRender.render_ms / 1000), 'frames/s'),
      node_peak_memory: measured(process.resourceUsage().maxRSS * 1024, 'bytes'), render_peak_memory: measured(signalRender.max_rss_bytes, 'bytes'),
      output_bytes: measured(signalRender.bytes, 'bytes'), bundle_reused: signalRender.bundle_reused,
    });
    const nocturneMetrics = RenderMetricsSchema.parse({
      schema: 'render-metrics', schema_version: '0.1.0', compile_ms: measured(nocturneCompileMs, 'ms'), text_shape_ms: null,
      bundle_ms: measured(nocturneRender.bundle_ms, 'ms'), render_ms: measured(nocturneRender.render_ms, 'ms'),
      frames_per_second: measured(nocturneRender.frames / (nocturneRender.render_ms / 1000), 'frames/s'),
      node_peak_memory: measured(process.resourceUsage().maxRSS * 1024, 'bytes'), render_peak_memory: measured(nocturneRender.max_rss_bytes, 'bytes'),
      output_bytes: measured(nocturneRender.bytes, 'bytes'), bundle_reused: nocturneRender.bundle_reused,
    });
    const p14Metrics = path.join(WORKSPACE, 'out', 'p1.4', 'metrics.json');
    writeJson(path.join(out, 'metrics.json'), {
      schema: 'p1.5-metrics-suite', schema_version: '0.1.0', environment: { node: process.version, os: process.platform, arch: process.arch, chromium: chromeVersion },
      signal: signalMetrics, nocturne: nocturneMetrics,
      comparison: { p1_4_recorded: existsSync(p14Metrics) ? JSON.parse(readFileSync(p14Metrics, 'utf8')) : null, note: 'Valeurs mesurées et estimées ne sont jamais fusionnées.' },
      bundle_reuse: { first_bundle_ms: signalRender.bundle_ms, second_bundle_ms: nocturneRender.bundle_ms, second_reused: nocturneRender.bundle_reused },
    });
    writeJson(path.join(out, 'visual-regression.json'), {
      frame, exact_reference_hashes: { signal: sha256File(signalFrame), nocturne: sha256File(nocturneFrame), target_1080x1920: sha256File(targetFrame), contact_sheet: sha256File(contactSheet) },
      cross_environment_tolerance: CROSS_ENVIRONMENT_TOLERANCE,
      policy: 'Hash exact sur cet environnement ; comparaison perceptuelle tolérée entre OS.',
    });
    writeJson(path.join(out, 'reference-run.json'), {
      git: state, reference_eligible: signal.manifest.engine.reference_eligible && nocturne.manifest.engine.reference_eligible,
      spec_sha256: hashDocument(fixture.spec), signal_render_plan_sha256: signal.hashes.render_plan,
      nocturne_render_plan_sha256: nocturne.hashes.render_plan,
      expected_warnings: [...new Set([...signal.preflight.issues, ...nocturne.preflight.issues].filter((issue) => issue.severity === 'warning').map((issue) => issue.code))].sort(),
    });

    expect(signal.manifest.engine.reference_eligible && nocturne.manifest.engine.reference_eligible).toBe(true);
    expect(signal.preflight.summary?.errors).toBe(0);
    expect(nocturne.preflight.summary?.errors).toBe(0);
    expect(isMp4(signalVideo) && isMp4(nocturneVideo)).toBe(true);
    expect(signalRender.bundle_reused).toBe(false);
    expect(nocturneRender.bundle_reused).toBe(true);
    expect(nocturneRender.bundle_ms).toBe(0);
    expect(signalStill.bundle_reused && nocturneStill.bundle_reused && targetStill.bundle_reused).toBe(true);
  }, 600_000);
});
