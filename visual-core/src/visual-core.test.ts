import { describe, expect, it } from 'vitest';

import { canonicalVisualJson, hashVisualDocument } from './canonical.ts';
import { buildVisualDiversityReport } from './diversity.ts';
import { DEFAULT_VISUAL_LIMITS } from './limits.ts';
import { buildVisualPreflight } from './preflight.ts';
import {
  ACTIVE_VISUAL_GRAMMAR,
  CAMERA_DEFINITIONS,
  MOTION_PHRASE_DEFINITIONS,
  P32_CAMERA_DEFINITIONS,
  P32_MOTION_PHRASE_DEFINITIONS,
  P32_SCENE_BRIDGE_DEFINITIONS,
  P32_VISUAL_GRAMMAR,
  P32_VISUAL_PATTERN_DEFINITIONS,
  SCENE_BRIDGE_DEFINITIONS,
  VISUAL_PATTERN_DEFINITIONS,
  assertRegistryVersionPolicy,
} from './registry.ts';
import { minimalVisualPlan } from './test-support.ts';
import { validateVisualPlan } from './validation.ts';
import { readVisualPlanVersioned } from './versioning.ts';

const clone = <T>(value: T): T => structuredClone(value);
const codes = (value: unknown): string[] => buildVisualPreflight(value).diagnostics.map((entry) => entry.code);

describe('Visual Grammar 0.1.0', () => {
  it('valide un VisualPlan strict, fermé et versionné', () => {
    const plan = minimalVisualPlan();
    expect(validateVisualPlan(plan).ok).toBe(true);
    expect(buildVisualPreflight(plan)).toMatchObject({ eligible_for_compilation: true, summary: { errors: 0 } });
    expect(() => readVisualPlanVersioned(plan)).not.toThrow();
  });

  it('canonise les clés, préserve Unicode et refuse les nombres non finis', () => {
    expect(canonicalVisualJson({ z: 'Élan', a: 1, omitted: undefined })).toBe('{"a":1,"z":"Élan"}');
    expect(hashVisualDocument({ b: 2, a: 1 })).toBe(hashVisualDocument({ a: 1, b: 2 }));
    expect(() => canonicalVisualJson({ value: Number.NaN })).toThrow(/non fini/u);
  });

  it('produit des fingerprints fermés et vérifie la politique id + version', () => {
    expect(ACTIVE_VISUAL_GRAMMAR.fingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(new Set(VISUAL_PATTERN_DEFINITIONS.map((entry) => entry.id)).size).toBe(VISUAL_PATTERN_DEFINITIONS.length);
    expect(new Set(MOTION_PHRASE_DEFINITIONS.map((entry) => entry.id)).size).toBe(MOTION_PHRASE_DEFINITIONS.length);
    expect(new Set(CAMERA_DEFINITIONS.map((entry) => entry.id)).size).toBe(CAMERA_DEFINITIONS.length);
    expect(new Set(SCENE_BRIDGE_DEFINITIONS.map((entry) => entry.id)).size).toBe(SCENE_BRIDGE_DEFINITIONS.length);
    const entry = VISUAL_PATTERN_DEFINITIONS[0]!;
    expect(() => assertRegistryVersionPolicy([entry], [{ id: entry.id, version: entry.version, sha256: hashVisualDocument(entry) }])).not.toThrow();
    expect(() => assertRegistryVersionPolicy([{ ...entry, resolver: 'changed' }], [{ id: entry.id, version: entry.version, sha256: hashVisualDocument(entry) }])).toThrow(/version_not_bumped/u);
  });

  it('versionne P3.2 sans altérer les registres P3.1', () => {
    expect(P32_VISUAL_GRAMMAR).toMatchObject({ version: '0.2.0' });
    expect(P32_VISUAL_GRAMMAR.fingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(P32_VISUAL_PATTERN_DEFINITIONS.length).toBeGreaterThan(VISUAL_PATTERN_DEFINITIONS.length);
    expect(P32_MOTION_PHRASE_DEFINITIONS.length).toBeGreaterThanOrEqual(15);
    expect(P32_SCENE_BRIDGE_DEFINITIONS.length).toBeGreaterThan(SCENE_BRIDGE_DEFINITIONS.length);
    expect(P32_CAMERA_DEFINITIONS.length).toBeGreaterThan(CAMERA_DEFINITIONS.length);
    expect(ACTIVE_VISUAL_GRAMMAR.version).toBe('0.1.0');
  });

  it('rejette un pattern, une phrase, une caméra et un bridge inconnus', () => {
    const plan = clone(minimalVisualPlan());
    plan.scenes[0]!.patterns[0]!.pattern_id = 'UNKNOWN_PATTERN';
    plan.scenes[0]!.motion_phrases[0]!.phrase_id = 'UNKNOWN_PHRASE';
    plan.scenes[0]!.camera_moves.push({ id: 'camera_unknown', camera_id: 'UNKNOWN_CAMERA', version: '1.0.0', target_id: 'visual_text_one', intensity: 0.5, phase: 'ENTER' });
    plan.bridges[0]!.bridge_id = 'UNKNOWN_BRIDGE';
    expect(codes(plan)).toEqual(expect.arrayContaining(['visual.pattern.unknown', 'visual.phrase.unknown', 'visual.camera.unknown', 'visual.bridge.unknown']));
  });

  it('déclare les capabilities futures comme non supportées', () => {
    const plan = clone(minimalVisualPlan());
    plan.scenes[0]!.patterns[0]!.pattern_id = 'PATH_FOLLOW_ELEMENT';
    expect(codes(plan)).toContain('visual.capability.unsupported');
  });

  it('détecte une target absente et une target de type incompatible', () => {
    const absent = clone(minimalVisualPlan());
    absent.scenes[0]!.patterns[0]!.target_ids = ['missing_target'];
    expect(codes(absent)).toContain('visual.pattern.target_missing');
    const wrong = clone(minimalVisualPlan());
    wrong.scenes[0]!.patterns[0]!.pattern_id = 'PATH_DRAW_EXPLANATION';
    expect(codes(wrong)).toContain('visual.pattern.target_incompatible');
  });

  it('valide les targets de MotionPhrase et de caméra contre leurs registres', () => {
    const plan = clone(minimalVisualPlan());
    plan.scenes[0]!.motion_phrases[0]!.target_ids = ['missing_target'];
    plan.scenes[0]!.camera_moves.push({ id: 'camera_text', camera_id: 'CAMERA_PUSH_IN', version: '1.0.0', target_id: 'visual_text_one', intensity: 0.5, phase: 'ENTER' });
    expect(codes(plan)).toEqual(expect.arrayContaining(['visual.phrase.target_missing', 'visual.camera.target_incompatible']));
    plan.scenes[0]!.motion_phrases[0]!.target_ids = ['visual_text_one'];
    plan.scenes[0]!.motion_phrases[0]!.phrase_id = 'PATH_CAUSAL_REVEAL';
    expect(codes(plan)).toContain('visual.phrase.target_incompatible');
  });

  it('valide les chaînes chorégraphiques causales sans inventer d’action', () => {
    const plan = clone(minimalVisualPlan());
    const event = plan.scenes[0]!.choreography[0]!;
    event.target_id = 'missing_target';
    event.action_id = 'UNKNOWN_ACTION';
    event.trigger = { relation: 'after', event_id: 'missing_event' };
    expect(codes(plan)).toEqual(expect.arrayContaining(['visual.choreography.target_missing', 'visual.choreography.action_unknown', 'visual.choreography.trigger_missing']));
    event.target_id = 'visual_text_one';
    event.action_id = 'HERO_WORD_IMPACT';
    event.trigger = { relation: 'after', event_id: event.id };
    expect(codes(plan)).toContain('visual.choreography.cycle');
  });

  it('borne aussi le total des ContinuityAnchors du plan', () => {
    const plan = clone(minimalVisualPlan());
    plan.scenes.forEach((scene, sceneIndex) => {
      scene.anchors = Array.from({ length: 33 }, (_, index) => ({ id: `anchor_${sceneIndex}_${index}`, entity_id: scene.entities[0]!.id, visual_entity_id: 'entity_shared', property: 'scale' as const, visible_ms: 400 }));
      scene.entry_anchor_id = scene.anchors[0]!.id;
      scene.exit_anchor_id = scene.anchors[0]!.id;
    });
    expect(codes(plan)).toContain('visual.limit.anchors');
  });

  it('détecte les conflits de contrôle exclusif', () => {
    const plan = clone(minimalVisualPlan());
    plan.scenes[0]!.patterns.push({ id: 'second_kinetic', pattern_id: 'KINETIC_WORD_IMPACT', version: '1.0.0', target_ids: ['visual_text_one'], parameters: {} });
    expect(codes(plan)).toContain('visual.pattern.conflict');
  });

  it('valide le graphe de profondeur et rejette cycle, self-reference et cible absente', () => {
    const plan = clone(minimalVisualPlan());
    plan.scenes[0]!.depth_layers = [{ entity_id: 'visual_text_one', plane: 'FOREGROUND', parallax_factor: 1.2, occludes: ['visual_text_one', 'missing_target'] }];
    expect(codes(plan)).toEqual(expect.arrayContaining(['visual.depth.self_reference', 'visual.depth.occlusion_target_missing', 'visual.depth.cycle']));
  });

  it('rejette les anchors, entités persistantes et scènes invalides d’un bridge', () => {
    const plan = clone(minimalVisualPlan());
    plan.bridges[0]!.destination_anchor_id = 'missing_anchor';
    plan.bridges[0]!.destination_scene_id = 'missing_scene';
    expect(codes(plan)).toEqual(expect.arrayContaining(['visual.bridge.scene_missing', 'visual.bridge.anchor_missing']));
  });

  it('rejette une identité persistante incohérente', () => {
    const plan = clone(minimalVisualPlan());
    plan.bridges[0]!.visual_entity_id = 'another_entity';
    expect(codes(plan)).toContain('visual.bridge.entity_mismatch');
  });

  it('applique les limites à la valeur exacte puis rejette limite + 1', () => {
    const exact = clone(minimalVisualPlan());
    exact.scenes[0]!.patterns = Array.from({ length: DEFAULT_VISUAL_LIMITS.max_patterns_per_scene }, (_, index) => ({ id: `pattern_limit_${index}`, pattern_id: 'MATCH_POSITION_BRIDGE', version: '1.0.0', target_ids: ['visual_text_one'], parameters: { index } }));
    expect(codes(exact)).not.toContain('visual.limit.patterns');
    exact.scenes[0]!.patterns.push({ id: 'pattern_limit_over', pattern_id: 'MATCH_POSITION_BRIDGE', version: '1.0.0', target_ids: ['visual_text_one'], parameters: {} });
    expect(codes(exact)).toContain('visual.limit.patterns');
  });

  it('sépare la complexité visuelle de l’intensité motion', () => {
    const plan = clone(minimalVisualPlan());
    plan.scenes[0]!.complexity = 'HIGH';
    plan.scenes[0]!.motion_intensity = 'LOW';
    expect(buildVisualPreflight(plan).eligible_for_compilation).toBe(true);
  });

  it('signale la répétition accidentelle mais ignore un motif déclaré', () => {
    const plan = clone(minimalVisualPlan());
    plan.motifs = [];
    expect(buildVisualDiversityReport(plan).consecutive_repetitions.map((entry) => entry.kind)).toContain('layout');
    expect(codes(plan)).toContain('visual.repetition.layout');
    plan.motifs = [{ id: 'declared_layout_motif', kind: 'visual_entity', entity_id: 'entity_shared', scene_ids: plan.scenes.map((scene) => scene.id) }];
    expect(codes(plan)).not.toContain('visual.repetition.layout');
  });

  it('rapporte layouts, patterns, phrases, bridges, caméra et profondeur sans score artistique', () => {
    const report = buildVisualDiversityReport(minimalVisualPlan());
    expect(report).toMatchObject({ schema: 'visual-diversity-report', layouts: ['CENTER_HERO'], patterns: ['KINETIC_WORD_IMPACT'], motion_phrases: ['HERO_WORD_IMPACT'], bridges: ['ELEMENT_CARRY'] });
    expect(report).not.toHaveProperty('professional_score');
  });

  it('rejette unknown fields, IDs dupliqués et focus décoratif', () => {
    const unknown = { ...minimalVisualPlan(), shellCommand: 'do-not-run' };
    expect(validateVisualPlan(unknown).ok).toBe(false);
    const plan = clone(minimalVisualPlan());
    plan.scenes[1]!.entities[0]!.id = 'visual_text_one';
    plan.scenes[0]!.entities[0]!.hierarchy = 'DECORATIVE';
    expect(codes(plan)).toEqual(expect.arrayContaining(['visual.id.duplicate', 'visual.focus.decorative']));
  });

  it('refuse prototype pollution, cycles et payload surdimensionné', () => {
    const hostile = JSON.parse('{"__proto__":{"polluted":true}}') as unknown;
    expect(validateVisualPlan(hostile).ok).toBe(false);
    const cyclic: Record<string, unknown> = {}; cyclic['self'] = cyclic;
    expect(validateVisualPlan(cyclic).ok).toBe(false);
    expect(validateVisualPlan({ value: 'x'.repeat(2_000) }, { ...DEFAULT_VISUAL_LIMITS, max_json_bytes: 1_024 }).ok).toBe(false);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('refuse version inconnue, chemin absent et cycle de migrations', () => {
    const unknown = { ...minimalVisualPlan(), schema_version: '9.0.0' };
    expect(() => readVisualPlanVersioned(unknown)).toThrow(/path_missing/u);
    expect(() => readVisualPlanVersioned(unknown, [{ from: '9.0.0', to: '9.0.0', migrate: (value) => value }])).toThrow(/cycle/u);
  });

  it('garantit le déterminisme du preflight et des hashes', () => {
    const plan = minimalVisualPlan();
    expect(buildVisualPreflight(plan)).toEqual(buildVisualPreflight(structuredClone(plan)));
    expect(hashVisualDocument(plan)).toBe(hashVisualDocument(structuredClone(plan)));
  });
});
