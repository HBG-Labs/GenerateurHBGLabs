import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';

import { hashDocument, validateRenderPlan } from '@motion-engine/core';
import type { PlanNode } from '@motion-engine/core';

import { buildP14Pipeline } from './p1.4-support.ts';
import { comparePngBuffers } from './visual-regression.ts';

function nodes(plan: ReturnType<typeof buildP14Pipeline>['signalPlan']): PlanNode[] {
  const result: PlanNode[] = [];
  const visit = (node: PlanNode): void => {
    result.push(node);
    if (node.type === 'group' || node.type === 'mask') node.children.forEach(visit);
  };
  plan.scenes.forEach((scene) => scene.nodes.forEach(visit));
  return result;
}

describe('pipeline visuel P1.4', () => {
  it('compile la même spec vers Image, Path, Mask et typographie mesurée', () => {
    const pipeline = buildP14Pipeline();
    for (const plan of [pipeline.signalPlan, pipeline.nocturnePlan]) {
      expect(validateRenderPlan(plan).ok).toBe(true);
      expect(nodes(plan).map((node) => node.type)).toEqual(expect.arrayContaining(['image', 'path', 'mask', 'text']));
      const text = nodes(plan).find((node) => node.type === 'text');
      expect(text?.type === 'text' && text.lines.every((line) => line.measured_width !== null && line.runs.every((run) => run.glyphs.length > 0))).toBe(true);
      const renderedText = text?.type === 'text' ? text.lines.map((line) => line.runs.map((run) => run.text).join('').trimEnd()).join(' ') : '';
      expect(renderedText.toLocaleLowerCase('fr-FR')).toContain('change');
      expect(plan.assets[0]).toMatchObject({ ref: 'neutral_landscape', mime: 'image/png', provenance: { commercial_use: 'allowed' } });
      expect(plan.preflight.status).toBe('warn');
      expect(plan.preflight.issues.map((issue) => issue.code)).toContain('contrast.unknown_on_image');
      expect(plan.preflight.checks.safe_nodes).toBeGreaterThan(0);
      expect(plan.preflight.issues.map((issue) => issue.code)).not.toContain('placement.unsafe');
    }
  });

  it('préserve la spec et l’asset, mais différencie composition, typographie et mouvement par le style', () => {
    const { signalPlan, nocturnePlan } = buildP14Pipeline();
    expect(signalPlan.spec.sha256).toBe(nocturnePlan.spec.sha256);
    expect(signalPlan.assets[0]?.sha256).toBe(nocturnePlan.assets[0]?.sha256);
    expect(signalPlan.fonts[0]?.sha256).not.toBe(nocturnePlan.fonts[0]?.sha256);
    expect(signalPlan.fonts[0]?.supported_axes).toMatchObject({ wght: { min: 100, max: 900 }, wdth: { min: 62.5, max: 100 } });
    expect(hashDocument(signalPlan)).not.toBe(hashDocument(nocturnePlan));
  });

  it('est strictement déterministe', () => {
    const first = buildP14Pipeline();
    const second = buildP14Pipeline();
    expect(hashDocument(first.signalPlan)).toBe(hashDocument(second.signalPlan));
    expect(hashDocument(first.nocturnePlan)).toBe(hashDocument(second.nocturnePlan));
  });

  it('compile chaque behavior visuel en géométrie ou tracks concrets, avec un spring portable', () => {
    const { signalPlan } = buildP14Pipeline();
    const bySource = new Map(nodes(signalPlan).flatMap((node) => node.tracks).map((track) => [track.source, track]));
    expect(bySource.get('hero_wipe')?.property).toBe('clip_right');
    expect(bySource.get('camera_push')?.property).toBe('scale');
    expect(nodes(signalPlan).flatMap((node) => node.tracks).filter((track) => track.source === 'focus_subject').map((track) => track.property)).toEqual(['scale', 'translate_x', 'translate_y']);
    const focusTranslations = nodes(signalPlan).flatMap((node) => node.tracks).filter((track) => track.source === 'focus_subject' && track.property.startsWith('translate'));
    expect(focusTranslations.every((track) => Math.abs(Number(track.keys.at(-1)?.value)) < 30)).toBe(true);
    expect(nodes(signalPlan).flatMap((node) => node.tracks).filter((track) => track.source === 'highlight_subject').map((track) => track.property)).toEqual(['opacity', 'scale']);
    expect(bySource.get('match_line')?.property).toBe('path_progress');
    const highlight = nodes(signalPlan).find((node) => node.id === 'highlight');
    const hero = nodes(signalPlan).find((node) => node.id === 'hero_mask');
    expect(highlight?.box.w).toBeLessThan(hero?.box.w ?? 0);
    expect(highlight?.box.x).toBeGreaterThan(0);
    const spring = nodes(signalPlan).flatMap((node) => node.tracks).flatMap((track) => track.keys).map((key) => key.ease).find((ease) => ease?.type === 'spring');
    expect(spring).toMatchObject({ type: 'spring', mass: expect.any(Number), stiffness: expect.any(Number), damping: expect.any(Number), initial_velocity: 0 });
    expect(JSON.stringify(spring)).not.toMatch(/remotion/i);
  });

  it('dispose d’une comparaison perceptuelle tolérante pour les écarts inter-environnements', () => {
    const reference = new PNG({ width: 2, height: 1 });
    reference.data.set([10, 20, 30, 255, 40, 50, 60, 255]);
    const identical = PNG.sync.write(reference);
    expect(comparePngBuffers(identical, identical)).toMatchObject({ exact_sha256_match: true, within_tolerance: true });
    const changed = new PNG({ width: 2, height: 1 });
    changed.data.set([255, 255, 255, 255, 255, 255, 255, 255]);
    expect(comparePngBuffers(identical, PNG.sync.write(changed))).toMatchObject({ exact_sha256_match: false, within_tolerance: false });
  });
});
