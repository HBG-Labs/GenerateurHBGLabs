import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  buildSemanticCertificationFingerprint,
  canonicalJson,
  profileCompileForRender,
} from '@motion-engine/core';
import type {
  CompilerPhaseMetrics,
  RenderCompilationResult,
  SemanticCertificationFingerprint,
} from '@motion-engine/core';
import { REMOTION_CAPABILITIES } from '../renderer-remotion/src/capabilities.ts';
import { REMOTION_RENDERER_VERSION } from '../renderer-remotion/src/version.ts';

import { pattern, platforms } from './p1.2-support.ts';
import { buildP14Pipeline, p14FontResources } from './p1.4-support.ts';
import { WORKSPACE } from './support.ts';

export const P16_CONTROL_POINTS = Object.freeze([
  { phase: 'ENTER', ratio: 0.04 },
  { phase: 'ACCENT', ratio: 0.24 },
  { phase: 'SETTLE', ratio: 0.42 },
  { phase: 'HOLD', ratio: 0.67 },
  { phase: 'EXIT', ratio: 0.94 },
] as const);

export function controlFrames(durationFrames: number): Array<{ phase: string; frame: number }> {
  return P16_CONTROL_POINTS.map(({ phase, ratio }) => ({
    phase,
    frame: Math.min(durationFrames - 1, Math.max(0, Math.round((durationFrames - 1) * ratio))),
  }));
}

export function sha256File(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

export function browserExecutable(): string | undefined {
  return [
    process.env['CHROME_BIN'],
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
}

function executableVersion(command: string | undefined): string | null {
  if (!command) return null;
  try {
    if (process.platform === 'win32') {
      const literal = command.replaceAll("'", "''");
      return `Chrome ${execFileSync('pwsh.exe', ['-NoProfile', '-Command', `(Get-Item -LiteralPath '${literal}').VersionInfo.ProductVersion`], { encoding: 'utf8' }).trim()}`;
    }
    return execFileSync(command, ['--version'], { encoding: 'utf8' }).trim();
  } catch { return null; }
}

function npmVersion(): string {
  const match = /(?:^|\s)npm\/([^\s]+)/u.exec(process.env['npm_config_user_agent'] ?? '');
  if (!match?.[1]) throw new Error('Version npm indisponible : exécuter la certification via npm run.');
  return `npm@${match[1]}`;
}

export interface ToolchainFingerprint {
  schema: 'toolchain-fingerprint';
  schema_version: '0.1.0';
  node: string;
  package_manager: string;
  lockfile_sha256: string;
  remotion: string;
  chromium: string | null;
  harfbuzzjs: string;
  renderer_package: string;
  os: string;
  arch: string;
  ffmpeg: string | null;
  sha256: string;
}

export function toolchainFingerprint(browserPath = browserExecutable()): ToolchainFingerprint {
  const body = {
    schema: 'toolchain-fingerprint' as const,
    schema_version: '0.1.0' as const,
    node: process.version,
    package_manager: npmVersion(),
    lockfile_sha256: sha256File(path.join(WORKSPACE, 'package-lock.json')),
    remotion: '4.0.529',
    chromium: executableVersion(browserPath),
    harfbuzzjs: '1.6.2',
    renderer_package: REMOTION_RENDERER_VERSION,
    os: process.platform,
    arch: process.arch,
    // Remotion 4.0.529 n'expose pas de version FFmpeg publique et stable.
    ffmpeg: null,
  };
  return { ...body, sha256: createHash('sha256').update(canonicalJson(body)).digest('hex') };
}

export function gitState(): { commit: string; dirty: boolean } {
  const run = (args: string[]) => execFileSync('git', ['-c', `safe.directory=${WORKSPACE.replaceAll('\\', '/')}`, ...args], { cwd: WORKSPACE, encoding: 'utf8' }).trim();
  return { commit: run(['rev-parse', 'HEAD']), dirty: run(['status', '--porcelain', '--untracked-files=normal']).length > 0 };
}

export interface CertificationPair {
  signal: RenderCompilationResult;
  nocturne: RenderCompilationResult;
  metrics: { signal: CompilerPhaseMetrics; nocturne: CompilerPhaseMetrics };
  semantic: { signal: SemanticCertificationFingerprint; nocturne: SemanticCertificationFingerprint };
  fixture: ReturnType<typeof buildP14Pipeline>;
  toolchain: ToolchainFingerprint;
}

export function buildCertificationPair(options: { referenceEligible?: boolean; git?: { commit: string; dirty: boolean }; browserPath?: string } = {}): CertificationPair {
  const fixture = buildP14Pipeline(0.5);
  const platform = platforms();
  const definition = pattern();
  const toolchain = toolchainFingerprint(options.browserPath);
  const git = options.git ?? { commit: '8a6bfd7dd1565b7b0fc0e15fb81f732aa8a84493', dirty: true };
  const descriptor = { name: '@motion-engine/renderer-remotion', version: REMOTION_RENDERER_VERSION, capabilities: REMOTION_CAPABILITIES };
  const manifestContext = (substitutionReason?: string) => ({
    createdAt: '2026-09-27T00:00:00.000Z',
    engine: {
      name: '@motion-engine/core', version: '0.5.0', git_commit: git.commit,
      git_dirty: git.dirty, reference_eligible: options.referenceEligible ?? false,
    },
    platformPresets: platform,
    toolchain: {
      node: toolchain.node, package_manager: toolchain.package_manager, lockfile_sha256: toolchain.lockfile_sha256,
      remotion: toolchain.remotion, chromium: toolchain.chromium, ffmpeg: toolchain.ffmpeg,
      harfbuzzjs: toolchain.harfbuzzjs, renderer_package: toolchain.renderer_package, os: toolchain.os, arch: toolchain.arch,
    },
    renderConfig: { width: 540, height: 960, fps: 30, codec: 'h264' as const, crf: null, pixel_format: null },
    ...(substitutionReason ? { substitutionReason } : {}),
  });
  const common = {
    spec: fixture.spec, platformPresets: platform, pattern: definition,
    assetResources: { [fixture.asset.ref]: fixture.asset },
    config: { fps: 30, render_scale: 0.5, minimum_readable_size: 14 },
  } as const;
  const signalProfiled = profileCompileForRender(
    { ...common, resolvedStyle: fixture.signalStyle, fontResources: p14FontResources(fixture.signalStyle) },
    descriptor, manifestContext(), () => performance.now(),
  );
  const nocturneProfiled = profileCompileForRender(
    { ...common, resolvedStyle: fixture.nocturneStyle, fontResources: p14FontResources(fixture.nocturneStyle), allowStyleSubstitution: true },
    descriptor, manifestContext('P1.6 : même spec neutre, style de contrôle Nocturne'), () => performance.now(),
  );
  const semantic = (compiled: RenderCompilationResult) => buildSemanticCertificationFingerprint({
    renderPlan: compiled.render_plan, audioPlan: compiled.audio_plan, subtitlePlan: compiled.subtitle_plan,
    dependencyGraph: compiled.dependency_graph, preflight: compiled.preflight, manifest: compiled.manifest,
  });
  return {
    signal: signalProfiled.result,
    nocturne: nocturneProfiled.result,
    metrics: { signal: signalProfiled.metrics, nocturne: nocturneProfiled.metrics },
    semantic: { signal: semantic(signalProfiled.result), nocturne: semantic(nocturneProfiled.result) },
    fixture,
    toolchain,
  };
}
