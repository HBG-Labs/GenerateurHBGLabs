import { describe, expect, it } from 'vitest';

import { assertRenderGate, RenderGateError, hashDocument } from '@motion-engine/core';
import { planCreativeStory } from '@motion-engine/creative-core';
import { REMOTION_CAPABILITIES, REMOTION_RENDERER_VERSION } from '@motion-engine/renderer-remotion';

import { buildP23Pipeline, type P23FixtureName } from './p2.3-support.ts';
import { readJson } from './support.ts';

describe('P2.3 — CreativePlan vers pipeline P1', () => {
  it.each(['hypothetical-30s', 'explainer-30s', 'product-demo-20s', 'minimal-5s', 'long-60s'] as const)(
    'compile %s jusqu’au RenderPlan P1',
    (name: P23FixtureName) => {
      const result = buildP23Pipeline(name, 'signal');
      expect(result.creative_compile.ok).toBe(true);
      expect(result.p1.preflight.summary?.errors ?? 0).toBe(0);
      expect(result.p1.render_plan.canvas.duration_frames).toBe(
        Math.round(result.creative.planning.creative_plan!.target.duration.preferred_seconds * 30),
      );
      expect(result.p1.hashes.render_plan).toMatch(/^[0-9a-f]{64}$/);
      expect(result.p1.audio_plan.timing_source).toBe('estimated');
    },
  );

  it('compile la même structure créative avec Signal et Nocturne', () => {
    const signal = buildP23Pipeline('hypothetical-30s', 'signal');
    const nocturne = buildP23Pipeline('hypothetical-30s', 'nocturne');
    expect(signal.creative_compile.report.hashes.creative_plan).toBe(nocturne.creative_compile.report.hashes.creative_plan);
    expect(signal.creative_compile.motion_spec?.scenes.map((scene) => scene.id)).toEqual(
      nocturne.creative_compile.motion_spec?.scenes.map((scene) => scene.id),
    );
    expect(signal.p1.hashes.render_plan).not.toBe(nocturne.p1.hashes.render_plan);
    expect(signal.p1.render_plan.canvas.duration_frames).toBe(nocturne.p1.render_plan.canvas.duration_frames);
    expect(signal.p1.subtitle_plan.segments.length).toBeGreaterThan(0);
    expect(nocturne.p1.subtitle_plan.segments.length).toBeGreaterThan(0);
  });

  it('préserve une provenance stable des scènes et layers', () => {
    const result = buildP23Pipeline('hypothetical-30s', 'signal');
    const provenance = result.creative_compile.provenance!;
    expect(provenance.scenes).toHaveLength(result.creative.planning.creative_plan!.scenes.length);
    expect(new Set(provenance.layers.map((entry) => entry.motion_layer_id)).size).toBeGreaterThan(0);
    expect(hashDocument(provenance)).toBe(result.creative_compile.report.hashes.provenance);
  });

  it('refuse avant rendu un renderer auquel IMAGE manque', () => {
    const result = buildP23Pipeline('hypothetical-30s', 'signal');
    expect(() => assertRenderGate(result.p1.render_plan, {
      name: '@motion-engine/renderer-remotion-without-image',
      version: REMOTION_RENDERER_VERSION,
      capabilities: REMOTION_CAPABILITIES.filter((capability) => capability !== 'IMAGE'),
    })).toThrow(RenderGateError);
  });

  it('arrête la fixture invalide avant CreativePlan et MotionSpec', () => {
    const planning = planCreativeStory(readJson('creative-core/fixtures/planner/invalid.planner-input.json'));
    expect(planning.ok).toBe(false);
    expect(planning.creative_plan).toBeNull();
    const diagnostics = planning.report?.diagnostics ?? planning.input_validation.diagnostics;
    expect(diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(true);
  });
});
