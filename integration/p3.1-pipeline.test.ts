import { describe, expect, it } from 'vitest';

import { hashDocument } from '@motion-engine/core';
import { buildVisualPreflight } from '@motion-engine/visual-core';

import { buildP23Pipeline } from './p2.3-support.ts';
import { buildP31Pipeline } from './p3.1-support.ts';

describe('P3.1 — Professional Visual Grammar', () => {
  it('compile le film Ciel bleu jusqu’au RenderPlan P1 sans erreur', () => {
    const result = buildP31Pipeline();
    expect(result.visual_compile.ok).toBe(true);
    expect(result.visual_compile.preflight.summary.errors).toBe(0);
    expect(result.p1.preflight.summary?.errors ?? 0).toBe(0);
    expect(result.p1.render_plan.canvas).toMatchObject({ width: 540, height: 960, fps: 30, duration_frames: 900 });
    expect(result.visual_compile.hashes.motion_spec).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.p1.hashes.render_plan).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('démontre le vocabulaire visuel minimal requis sans boucle slide', () => {
    const result = buildP31Pipeline();
    const layouts = new Set(result.visual_plan.scenes.map((scene) => scene.layout));
    const patterns = new Set(result.visual_plan.scenes.flatMap((scene) => scene.patterns.map((entry) => entry.pattern_id)));
    const phrases = new Set(result.visual_plan.scenes.flatMap((scene) => scene.motion_phrases.map((entry) => entry.phrase_id)));
    expect(layouts.size).toBeGreaterThanOrEqual(3);
    expect(patterns.size).toBeGreaterThanOrEqual(4);
    expect(phrases.size).toBeGreaterThanOrEqual(2);
    expect(result.visual_plan.scenes.some((scene) => scene.depth_layers.length >= 3)).toBe(true);
    expect(result.visual_plan.scenes.some((scene) => scene.camera_moves.length > 0)).toBe(true);
    expect(result.visual_plan.scenes.some((scene) => scene.entities.some((entity) => entity.kind === 'path'))).toBe(true);
    expect(patterns.has('KINETIC_WORD_IMPACT')).toBe(true);
    expect(patterns.has('MASK_TO_NEXT_SCENE')).toBe(true);
    expect(result.visual_plan.bridges.some((bridge) => bridge.bridge_id === 'MASK_EXPANSION')).toBe(true);
    expect(result.visual_plan.scenes.flatMap((scene) => scene.entities).some((entity) => entity.persistent)).toBe(true);
    expect(result.visual_compile.motion_spec?.scenes.some((scene) => scene.transition_out?.behavior === 'MASK_WIPE')).toBe(true);
  });

  it('conserve provenance et identité visuelle inspectables', () => {
    const result = buildP31Pipeline();
    expect(result.visual_compile.provenance.length).toBeGreaterThan(10);
    expect(new Set(result.visual_compile.provenance.map((entry) => entry.visual_scene_id))).toEqual(new Set(result.visual_plan.scenes.map((scene) => scene.id)));
    expect(result.visual_compile.provenance.every((entry) => entry.creative_scene_id && entry.motion_layer_id)).toBe(true);
    expect(hashDocument(result.visual_compile.motion_spec)).toBe(result.visual_compile.hashes.motion_spec);
  });

  it('maintient le chemin P2 certifié sans VisualPlan', () => {
    const legacy = buildP23Pipeline('explainer-30s', 'signal');
    expect(legacy.creative_compile.ok).toBe(true);
    expect(legacy.p1.preflight.summary?.errors ?? 0).toBe(0);
    expect(legacy.creative_compile.motion_spec).not.toBeNull();
    expect(legacy.creative_compile.provenance?.scenes).toHaveLength(legacy.creative.planning.creative_plan!.scenes.length);
  });

  it('réexécute le VisualPreflight complet avant compilation', () => {
    const result = buildP31Pipeline();
    const report = buildVisualPreflight(result.visual_plan);
    expect(report).toEqual(result.visual_compile.preflight);
    expect(report.eligible_for_compilation).toBe(true);
  });
});
