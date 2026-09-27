import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { RemotionMotionRenderer } from '@motion-engine/renderer-remotion';

import { buildP13Pipeline } from './p1.3-support.ts';
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

describe('smoke frame animée P1.3', () => {
  it('rend une frame pendant REVEAL_TEXT depuis les tracks compilés', async () => {
    const pipeline = buildP13Pipeline();
    const executable = browserExecutable();
    const renderer = new RemotionMotionRenderer(executable ? { browserExecutable: executable } : {});
    const result = await renderer.renderFrame({
      plan: pipeline.signalPlan,
      output_file: path.join(WORKSPACE, 'out', 'p1.3', 'signal-frame-15.png'),
      frame: 15,
      resource_root: WORKSPACE,
    });
    expect(result.bytes).toBeGreaterThan(1_000);
  }, 180_000);
});
