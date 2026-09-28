import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { RemotionMotionRenderer } from '@motion-engine/renderer-remotion';

import { buildP14Pipeline } from './p1.4-support.ts';
import { WORKSPACE } from './support.ts';

describe('P1.6 — injection d’échecs renderer', () => {
  it('refuse un RenderPlan invalide avant de produire un output', async () => {
    const plan = structuredClone(buildP14Pipeline().signalPlan) as any;
    plan.schema_version = '999.0.0';
    const output = path.join(WORKSPACE, 'out', 'p1.6', 'failures', 'invalid-plan.mp4');
    rmSync(output, { force: true });
    const renderer = new RemotionMotionRenderer();
    try {
      await expect(renderer.renderVideo({ plan, output_file: output, resource_root: WORKSPACE })).rejects.toThrow();
      expect(existsSync(output)).toBe(false);
    } finally { renderer.dispose(); }
  });

  it('refuse un hash asset incohérent avant bundling', async () => {
    const plan = structuredClone(buildP14Pipeline().signalPlan);
    plan.assets[0]!.sha256 = '0'.repeat(64);
    const output = path.join(WORKSPACE, 'out', 'p1.6', 'failures', 'hash-mismatch.mp4');
    rmSync(output, { force: true });
    const renderer = new RemotionMotionRenderer();
    try {
      await expect(renderer.renderVideo({ plan, output_file: output, resource_root: WORKSPACE })).rejects.toThrow(/Empreinte invalide/u);
      expect(existsSync(output)).toBe(false);
    } finally { renderer.dispose(); }
  });

  it('échoue proprement sur destination non écrivable structurellement', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'motion-p16-destination-'));
    const blocker = path.join(directory, 'not-a-directory');
    writeFileSync(blocker, 'fichier');
    const output = path.join(blocker, 'video.mp4');
    const renderer = new RemotionMotionRenderer();
    try {
      await expect(renderer.renderVideo({ plan: buildP14Pipeline().signalPlan, output_file: output, resource_root: WORKSPACE })).rejects.toThrow();
      expect(existsSync(output)).toBe(false);
    } finally {
      renderer.dispose();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('ne publie aucun output si Chromium est explicitement indisponible', async () => {
    const output = path.join(WORKSPACE, 'out', 'p1.6', 'failures', 'chromium-unavailable.png');
    rmSync(output, { force: true });
    const renderer = new RemotionMotionRenderer({ browserExecutable: path.join(WORKSPACE, 'missing-chromium-binary') });
    try {
      await expect(renderer.renderFrame({ plan: buildP14Pipeline().signalPlan, output_file: output, frame: 10, resource_root: WORKSPACE })).rejects.toThrow(/indisponible/iu);
      expect(existsSync(output)).toBe(false);
    } finally { renderer.dispose(); }
  }, 60_000);
});
