import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildReproducibilityManifest, canonicalJson, hashDocument } from '@motion-engine/core';
import { RemotionMotionRenderer } from '@motion-engine/renderer-remotion';

import { buildP13Pipeline } from './p1.3-support.ts';
import { platforms } from './p1.2-support.ts';
import { WORKSPACE } from './support.ts';

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

function isMp4(file: string): boolean {
  const header = readFileSync(file).subarray(0, 12);
  return header.length >= 8 && header.subarray(4, 8).toString('ascii') === 'ftyp';
}

describe('smoke MP4 P1.3', () => {
  it('rend Signal et Nocturne depuis la même spec et le renderer générique', async () => {
    const pipeline = buildP13Pipeline();
    const out = path.join(WORKSPACE, 'out', 'p1.3');
    mkdirSync(out, { recursive: true });
    writeJson(path.join(out, 'motion-scene-spec.json'), pipeline.spec);
    writeJson(path.join(out, 'signal.render-plan.json'), pipeline.signalPlan);
    writeJson(path.join(out, 'nocturne.render-plan.json'), pipeline.nocturnePlan);
    writeJson(path.join(out, 'signal.temporal.json'), pipeline.signalTemporal);
    writeJson(path.join(out, 'nocturne.temporal.json'), pipeline.nocturneTemporal);

    const executable = browserExecutable();
    const renderer = new RemotionMotionRenderer(executable ? { browserExecutable: executable } : {});
    const signal = await renderer.renderVideo({
      plan: pipeline.signalPlan,
      output_file: path.join(out, 'Signal.mp4'),
      resource_root: WORKSPACE,
    });
    const nocturne = await renderer.renderVideo({
      plan: pipeline.nocturnePlan,
      output_file: path.join(out, 'Nocturne.mp4'),
      resource_root: WORKSPACE,
    });

    const manifest = (style: typeof pipeline.signalStyle, plan: typeof pipeline.signalPlan, substitutionReason?: string) =>
      buildReproducibilityManifest({
        createdAt: '2026-09-27T00:00:00Z',
        engine: { name: '@motion-engine/core', version: '0.2.0', git_commit: null },
        spec: pipeline.spec,
        resolvedStyle: style,
        plan,
        platformPresets: platforms(),
        toolchain: { node: process.version, remotion: '4.0.529', chromium: executable ?? null, ffmpeg: 'Remotion bundled' },
        renderConfig: { width: 540, height: 960, fps: 30, codec: 'h264', crf: null, pixel_format: null },
        ...(substitutionReason ? { substitutionReason } : {}),
      });
    writeJson(path.join(out, 'signal.manifest.json'), manifest(pipeline.signalStyle, pipeline.signalPlan));
    writeJson(path.join(out, 'nocturne.manifest.json'), manifest(pipeline.nocturneStyle, pipeline.nocturnePlan, 'P1.3 : même spec, style de contrôle Nocturne'));
    writeJson(path.join(out, 'metrics.json'), {
      spec_sha256: pipeline.specHash,
      signal_plan_sha256: hashDocument(pipeline.signalPlan),
      nocturne_plan_sha256: hashDocument(pipeline.nocturnePlan),
      signal,
      nocturne,
      note: 'max_rss_bytes mesure le processus Node hôte ; ce n’est pas le pic agrégé Chromium/FFmpeg.',
    });

    expect(signal.bytes).toBeGreaterThan(10_000);
    expect(nocturne.bytes).toBeGreaterThan(10_000);
    expect(isMp4(signal.output_file)).toBe(true);
    expect(isMp4(nocturne.output_file)).toBe(true);
  }, 600_000);
});
