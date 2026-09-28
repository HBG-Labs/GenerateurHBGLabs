import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { canonicalJson } from '@motion-engine/core';
import { RemotionMotionRenderer } from '@motion-engine/renderer-remotion';

import { browserExecutable, buildCertificationPair, controlFrames } from './p1.6-support.ts';
import { WORKSPACE } from './support.ts';
import { CROSS_ENVIRONMENT_TOLERANCE } from './visual-regression.ts';

const sha256 = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');

describe('mise à jour explicite des goldens visuels P1.6', () => {
  it('rend et remplace les dix frames uniquement via la commande golden:update:visual:p1.6', async () => {
    const pair = buildCertificationPair();
    const browser = browserExecutable();
    const renderer = new RemotionMotionRenderer(browser ? { browserExecutable: browser } : {});
    const temporary = path.join(WORKSPACE, 'out', 'p1.6', 'golden-update');
    const destination = path.join(WORKSPACE, 'certification', 'goldens', 'visual');
    mkdirSync(temporary, { recursive: true });
    mkdirSync(destination, { recursive: true });
    const hashes: Record<string, string> = {};
    try {
      for (const [style, compiled] of [['signal', pair.signal], ['nocturne', pair.nocturne]] as const) {
        for (const point of controlFrames(compiled.render_plan.canvas.duration_frames)) {
          const name = `${style}-${point.phase.toLowerCase()}.png`;
          const candidate = path.join(temporary, name);
          await renderer.renderFrame({ plan: compiled.render_plan, output_file: candidate, frame: point.frame, resource_root: WORKSPACE });
          const golden = path.join(destination, name);
          copyFileSync(candidate, golden);
          hashes[name] = sha256(golden);
        }
      }
    } finally { renderer.dispose(); }
    const policy = {
      schema: 'p1.6-visual-golden-policy', schema_version: '0.1.0',
      control_points: controlFrames(pair.signal.render_plan.canvas.duration_frames),
      tolerance: CROSS_ENVIRONMENT_TOLERANCE,
      metric: 'RGB normalisé : MAE + RMSE + ratio de pixels au-dessus du delta par canal',
      approval: 'Mise à jour uniquement via npm run golden:update:visual:p1.6 ; revue humaine obligatoire.',
      limitations: ['Différences de rasterisation Chromium possibles entre OS.', 'La métrique ne juge ni intention ni qualité artistique.'],
      hashes,
    };
    writeFileSync(path.join(WORKSPACE, 'certification', 'goldens', 'visual-policy.json'), `${canonicalJson(policy)}\n`, 'utf8');
    expect(Object.keys(hashes)).toHaveLength(10);
  }, 120_000);
});
