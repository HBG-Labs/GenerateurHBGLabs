import { describe, expect, it } from 'vitest';

import { hashDocument, validateRenderPlan, validateSpec, verifyManifest } from '@motion-engine/core';

import { buildP12Pipeline } from './p1.2-support.ts';

describe('verticale P1.2', () => {
  const pipeline = buildP12Pipeline();

  it('produit une spec générique, valide et sans coordonnées de rendu', () => {
    expect(validateSpec(pipeline.spec, pipeline.signalStyle).ok).toBe(true);
    const json = JSON.stringify(pipeline.spec);
    expect(json).not.toMatch(/\b(px|pixels?|frames?|css|jsx|remotion)\b/i);
  });

  it('compile Group, Text et Shape vers un RenderPlan concret', () => {
    expect(validateRenderPlan(pipeline.signalPlan).ok).toBe(true);
    const group = pipeline.signalPlan.scenes[0]?.nodes[0];
    expect(group?.type).toBe('group');
    expect(group?.box).toMatchObject({ x: expect.any(Number), y: expect.any(Number), w: expect.any(Number), h: expect.any(Number) });
    if (group?.type !== 'group') throw new Error('Group attendu.');
    expect(group.children.map((node) => node.type)).toEqual(['shape', 'text']);
    const text = group.children.find((node) => node.type === 'text');
    expect(text?.type === 'text' && text.lines.every((line) =>
      line.measured_width >= 0 && line.runs.every((run) => run.measured_width >= 0 && run.glyphs.length > 0),
    )).toBe(true);
  });

  it('produit deux plans différents depuis exactement la même spec', () => {
    expect(pipeline.signalPlan.spec.sha256).toBe(hashDocument(pipeline.spec));
    expect(pipeline.nocturnePlan.spec.sha256).toBe(hashDocument(pipeline.spec));
    expect(hashDocument(pipeline.signalPlan)).not.toBe(hashDocument(pipeline.nocturnePlan));
    expect(pipeline.signalPlan.scenes[0]?.background).toBe('#FFE14D');
    expect(pipeline.nocturnePlan.scenes[0]?.background).toBe('#0B1026');
    expect(pipeline.signalPlan.fonts[0]?.css_name).toBe('fixture-signal-mono');
    expect(pipeline.nocturnePlan.fonts[0]?.css_name).toBe('nocturne-serif');
  });

  it('produit des manifestes valides', () => {
    expect(verifyManifest(pipeline.signalManifest)).toBe(true);
    expect(verifyManifest(pipeline.nocturneManifest)).toBe(true);
  });
});
