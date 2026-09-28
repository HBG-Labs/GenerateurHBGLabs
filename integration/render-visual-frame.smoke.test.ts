import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { RemotionMotionRenderer } from '@motion-engine/renderer-remotion';

import { buildP14Pipeline } from './p1.4-support.ts';
import { WORKSPACE } from './support.ts';
import { createSideBySideBoard } from './visual-regression.ts';

function browserExecutable(): string | undefined {
  return [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
  ].find((candidate) => existsSync(candidate));
}

describe('smoke frame visuelle P1.4', () => {
  it('rend Image, Path, Mask et texte mesuré pour les deux styles avec un seul bundle', async () => {
    const pipeline = buildP14Pipeline();
    const frame = Math.min(100, pipeline.signalPlan.canvas.duration_frames - 1);
    const out = path.join(WORKSPACE, 'out', 'p1.4');
    const signalFile = path.join(out, 'p1-4-signal-frame.png');
    const nocturneFile = path.join(out, 'p1-4-nocturne-frame.png');
    const executable = browserExecutable();
    const renderer = new RemotionMotionRenderer(executable ? { browserExecutable: executable } : {});
    let signal;
    let nocturne;
    try {
      signal = await renderer.renderFrame({ plan: pipeline.signalPlan, output_file: signalFile, frame, resource_root: WORKSPACE });
      nocturne = await renderer.renderFrame({ plan: pipeline.nocturnePlan, output_file: nocturneFile, frame, resource_root: WORKSPACE });
    } finally {
      renderer.dispose();
    }
    createSideBySideBoard(signalFile, nocturneFile, path.join(out, 'p1-4-comparison.png'));
    expect(signal.bytes).toBeGreaterThan(10_000);
    expect(nocturne.bytes).toBeGreaterThan(10_000);
    expect(signal.bundle_reused).toBe(false);
    expect(nocturne.bundle_reused).toBe(true);
    expect(nocturne.bundle_ms).toBe(0);
  }, 240_000);
});
