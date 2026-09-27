import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { hashDocument, validateRenderPlan } from '@motion-engine/core';

import { buildP13Pipeline } from './p1.3-support.ts';
import { WORKSPACE } from './support.ts';

function allTracks(plan: ReturnType<typeof buildP13Pipeline>['signalPlan']) {
  const tracks: typeof plan.scenes[number]['nodes'][number]['tracks'] = [];
  const visit = (node: typeof plan.scenes[number]['nodes'][number]): void => {
    tracks.push(...node.tracks);
    if (node.type === 'group' || node.type === 'mask') node.children.forEach(visit);
  };
  plan.scenes.forEach((scene) => scene.nodes.forEach(visit));
  return tracks;
}

describe('verticale animée P1.3', () => {
  const pipeline = buildP13Pipeline();

  it('compile la même spec en deux plans valides de 7 secondes à 540×960', () => {
    expect(validateRenderPlan(pipeline.signalPlan).ok).toBe(true);
    expect(validateRenderPlan(pipeline.nocturnePlan).ok).toBe(true);
    expect(pipeline.signalPlan.canvas).toEqual({ width: 540, height: 960, fps: 30, duration_frames: 210 });
    expect(pipeline.nocturnePlan.canvas).toEqual(pipeline.signalPlan.canvas);
    expect(pipeline.signalPlan.spec.sha256).toBe(pipeline.specHash);
    expect(pipeline.nocturnePlan.spec.sha256).toBe(pipeline.specHash);
    expect(pipeline.spec.scenes[0]?.transition_out).toMatchObject({ behavior: 'CUT', version: '1.0.0', to: 'scene_motion' });
    expect(pipeline.signalPlan.scenes[0]?.to).toBe(pipeline.signalPlan.scenes[1]?.from);
  });

  it('laisse le style modifier timing, easing, stagger et tracks sans modifier la spec', () => {
    expect(hashDocument(pipeline.signalPlan)).not.toBe(hashDocument(pipeline.nocturnePlan));
    expect(pipeline.signalTemporal.scenes[0]?.beat_ms).toBe(300);
    expect(pipeline.nocturneTemporal.scenes[0]?.beat_ms).toBe(700);
    expect(pipeline.signalTemporal.scenes[0]?.behaviors[0]?.stagger_ms).not.toBe(
      pipeline.nocturneTemporal.scenes[0]?.behaviors[0]?.stagger_ms,
    );
    expect(allTracks(pipeline.signalPlan).map((track) => track.property)).toEqual(
      expect.arrayContaining(['opacity', 'translate_y', 'scale']),
    );
    expect(JSON.stringify(allTracks(pipeline.signalPlan))).not.toBe(JSON.stringify(allTracks(pipeline.nocturnePlan)));
  });

  it('reste déterministe', () => {
    const again = buildP13Pipeline();
    expect(hashDocument(again.signalPlan)).toBe(hashDocument(pipeline.signalPlan));
    expect(hashDocument(again.nocturnePlan)).toBe(hashDocument(pipeline.nocturnePlan));
  });

  it('le renderer générique ne contient aucun nom de behavior', () => {
    const source = readFileSync(path.join(WORKSPACE, 'renderer-remotion', 'src', 'interpreter.tsx'), 'utf8');
    for (const behavior of ['REVEAL_TEXT', 'ACCENT_WORD', 'SETTLE', 'EXIT_CLEAR', 'CUT']) {
      expect(source).not.toContain(behavior);
    }
  });
});
