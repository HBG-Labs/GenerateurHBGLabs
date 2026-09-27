import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { canonicalJson, hashDocument } from '@motion-engine/core';
import { RemotionMotionRenderer } from '@motion-engine/renderer-remotion';

import { buildP12Pipeline } from './p1.2-support.ts';
import { WORKSPACE } from './support.ts';

function browserExecutable(): string | undefined {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, `${canonicalJson(value)}\n`, 'utf8');
}

describe('smoke renderer P1.2', () => {
  it('rend une vraie frame Signal et une vraie frame Nocturne depuis la même spec', async () => {
    const pipeline = buildP12Pipeline();
    const out = path.join(WORKSPACE, 'out', 'p1.2');
    mkdirSync(out, { recursive: true });
    writeJson(path.join(out, 'motion-scene-spec.json'), pipeline.spec);
    writeJson(path.join(out, 'signal.render-plan.json'), pipeline.signalPlan);
    writeJson(path.join(out, 'nocturne.render-plan.json'), pipeline.nocturnePlan);
    writeJson(path.join(out, 'signal.manifest.json'), pipeline.signalManifest);
    writeJson(path.join(out, 'nocturne.manifest.json'), pipeline.nocturneManifest);

    const executable = browserExecutable();
    const renderer = new RemotionMotionRenderer(executable ? { browserExecutable: executable } : {});
    const signal = await renderer.renderFrame({
      plan: pipeline.signalPlan,
      output_file: path.join(out, 'signal.png'),
      frame: 0,
      resource_root: WORKSPACE,
    });
    const nocturne = await renderer.renderFrame({
      plan: pipeline.nocturnePlan,
      output_file: path.join(out, 'nocturne.png'),
      frame: 0,
      resource_root: WORKSPACE,
    });
    const metrics = {
      spec_sha256: hashDocument(pipeline.spec),
      signal_plan_sha256: hashDocument(pipeline.signalPlan),
      nocturne_plan_sha256: hashDocument(pipeline.nocturnePlan),
      signal,
      nocturne,
      note: 'max_rss_bytes mesure le processus Node hôte ; ce n’est pas le pic agrégé Chromium.',
    };
    writeJson(path.join(out, 'metrics.json'), metrics);
    expect(signal.bytes).toBeGreaterThan(1_000);
    expect(nocturne.bytes).toBeGreaterThan(1_000);
    expect(signal.bytes).not.toBe(nocturne.bytes);
  }, 180_000);
});
