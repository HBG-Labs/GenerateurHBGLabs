import { describe, expect, it } from 'vitest';

import { buildVisualPreflight, P32_MOTION_PHRASE_DEFINITIONS, P32_VISUAL_GRAMMAR } from '@motion-engine/visual-core';

import { buildP32Pipeline, p32VisualPlan } from './p3.2-support.ts';

function trackProperties(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(trackProperties);
  if (value === null || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return [typeof record['property'] === 'string' ? record['property'] : null, ...Object.values(record).flatMap(trackProperties)].filter((entry): entry is string => entry !== null);
}

describe('P3.2 — Premium Motion Vocabulary', () => {
  it('compile Blue Sky 0.2.0 avec P1.7 et 0 ERROR', () => {
    const result = buildP32Pipeline();
    expect(result.visual_plan).toMatchObject({ schema_version: '0.2.0', grammar: { version: '0.2.0' } });
    expect(result.visual_plan.grammar.fingerprints.grammar).toBe(P32_VISUAL_GRAMMAR.fingerprint);
    expect(result.visual_compile.preflight.summary.errors).toBe(0);
    expect(result.p1.preflight.summary?.errors ?? 0).toBe(0);
    expect(result.p1.render_plan.canvas).toMatchObject({ width: 540, height: 960, fps: 30, duration_frames: 900 });
    expect(result.p1.render_plan.requirements.capabilities).toContain('DYNAMIC_TYPOGRAPHY');
  });

  it('rend réellement tracking, wght et wdth sans choreography naïve par caractère', () => {
    const result = buildP32Pipeline();
    const properties = trackProperties(result.p1.render_plan);
    expect(properties).toEqual(expect.arrayContaining(['tracking_px', 'font_axis.wght', 'font_axis.wdth']));
    const spec = JSON.stringify(result.visual_compile.motion_spec);
    expect(spec).toContain('POURQUOI');
    expect(spec).toContain('BLEU');
    expect(spec).not.toContain('text.split');
  });

  it('porte trois WOW moments dans une seule séquence cohérente', () => {
    const plan = p32VisualPlan();
    const patterns = new Set(plan.scenes.flatMap((scene) => scene.patterns.map((entry) => entry.pattern_id)));
    const phrases = new Set(plan.scenes.flatMap((scene) => scene.motion_phrases.map((entry) => entry.phrase_id)));
    expect(patterns.size).toBeGreaterThanOrEqual(8);
    expect(patterns.has('TYPE_TRACKING_BURST')).toBe(true);
    expect(patterns.has('SHAPE_TO_MASK')).toBe(true);
    expect(patterns.has('CIRCLE_TO_PORTAL')).toBe(true);
    expect(phrases.has('TYPE_TRACKING_IMPACT')).toBe(true);
    expect(phrases.has('CAUSAL_PATH_IMPACT')).toBe(true);
    expect(phrases.has('CAMERA_DEPTH_SURGE')).toBe(true);
    expect(plan.scenes.some((scene) => (scene.morph_chains?.length ?? 0) > 0)).toBe(true);
    expect(plan.scenes.some((scene) => (scene.causal_relations?.length ?? 0) >= 2)).toBe(true);
    expect(plan.camera_continuities).toHaveLength(2);
    expect(new Set(plan.bridges.map((entry) => entry.bridge_id)).size).toBeGreaterThanOrEqual(3);
    expect(P32_MOTION_PHRASE_DEFINITIONS.length).toBeGreaterThanOrEqual(15);
  });

  it('rejette un morph paramétrique incompatible et une continuité caméra cassée', () => {
    const plan = structuredClone(p32VisualPlan());
    plan.scenes[0]!.morph_chains = [{ id: 'invalid_parametric_morph', entity_id: 'hook_light_path', kind: 'parametric', steps: [
      { id: 'invalid_morph_type', representation: 'type', phase: 'ENTER', scale: 1 },
      { id: 'invalid_morph_portal', representation: 'portal', phase: 'EXIT', scale: 2 },
    ] }];
    plan.camera_continuities![0]!.destination_camera_id = 'missing_camera';
    const codes = buildVisualPreflight(plan).diagnostics.map((entry) => entry.code);
    expect(codes).toEqual(expect.arrayContaining(['visual.morph.incompatible', 'visual.camera_continuity.move_missing']));
  });

  it('rejette les cycles causaux sans inventer une résolution', () => {
    const plan = structuredClone(p32VisualPlan());
    const scene = plan.scenes.find((entry) => (entry.motion_events?.length ?? 0) >= 2)!;
    const [first, second] = scene.motion_events!;
    scene.causal_relations = [
      { id: 'causal_forward', source_event_id: first!.id, destination_event_id: second!.id, relation: 'TRIGGERS' },
      { id: 'causal_backward', source_event_id: second!.id, destination_event_id: first!.id, relation: 'FOLLOWS' },
    ];
    expect(buildVisualPreflight(plan).diagnostics.map((entry) => entry.code)).toContain('visual.causality.cycle');
  });

  it('préserve le corpus français et laisse HarfBuzz valider les runs dynamiques', () => {
    const result = buildP32Pipeline();
    const serialized = JSON.stringify(result.visual_compile.motion_spec);
    expect(serialized).toContain('POURQUOI');
    expect(serialized).toMatch(/[éèàç’]/u);
    expect(result.p1.preflight.issues.map((entry) => entry.code)).not.toContain('font.missing_glyph');
    expect(result.p1.preflight.issues.map((entry) => entry.code)).not.toContain('text.dynamic_overflow');
  });

  it('conserve le Full VisualPreflight après construction et refuse les effets non certifiés', () => {
    const valid = p32VisualPlan();
    expect(buildVisualPreflight(valid).eligible_for_compilation).toBe(true);
    const invalid = structuredClone(valid);
    invalid.scenes[0]!.effects = [{ id: 'unsupported_glow', effect_id: 'SOFT_GLOW', target_id: 'hook_question', intensity: 0.5, render_cost: 'MEDIUM' }];
    expect(buildVisualPreflight(invalid).diagnostics.map((entry) => entry.code)).toContain('visual.effect.future');
  });

  it('est déterministe dans le même processus', () => {
    const first = buildP32Pipeline();
    const second = buildP32Pipeline();
    expect(first.visual_plan).toEqual(second.visual_plan);
    expect(first.visual_compile.hashes).toEqual(second.visual_compile.hashes);
    expect(first.p1.hashes.render_plan).toBe(second.p1.hashes.render_plan);
  });
});
