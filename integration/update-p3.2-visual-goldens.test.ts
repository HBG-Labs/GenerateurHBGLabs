import { ensureBrowser } from '@remotion/renderer';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { RemotionMotionRenderer } from '@motion-engine/renderer-remotion';

import { browserExecutable, controlFrames } from './p1.6-support.ts';
import { buildP32Pipeline } from './p3.2-support.ts';
import { WORKSPACE } from './support.ts';

async function availableBrowser(): Promise<string> {
  const existing = browserExecutable();
  if (existing) return existing;
  const status = await ensureBrowser({ chromeMode: 'chrome-for-testing', logLevel: 'warn' });
  if (status.type === 'user-defined-path' || status.type === 'local-puppeteer-browser') return status.path;
  throw new Error(`Chromium indisponible (${status.type}).`);
}

describe('mise à jour explicite des goldens visuels P3.2', () => {
  it('rend uniquement les cinq points de contrôle P3.2', async () => {
    const pipeline = buildP32Pipeline(1);
    const destination = path.join(WORKSPACE, 'visual-compiler', 'goldens', 'p3.2', 'visual');
    mkdirSync(destination, { recursive: true });
    const renderer = new RemotionMotionRenderer({ browserExecutable: await availableBrowser(), dynamicTypography: true });
    const outputs: string[] = [];
    try {
      for (const point of controlFrames(900)) {
        const output = path.join(destination, `${point.phase.toLowerCase()}.png`);
        await renderer.renderFrame({ plan: pipeline.p1.render_plan, output_file: output, frame: point.frame, resource_root: WORKSPACE });
        outputs.push(output);
      }
    } finally { renderer.dispose(); }
    expect(outputs).toHaveLength(5);
  }, 240_000);
});
