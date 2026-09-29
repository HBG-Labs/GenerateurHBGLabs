import { describe, expect, it } from 'vitest';

import { VisualDirectionPlanSchema } from './contracts.ts';
import { buildVisualDirectorPlanningContext, CANONICAL_IMMUTABLE_FIELDS, PROVIDER_MUTABLE_FIELDS } from './provider-context.ts';
import { buildVisualDirectionPreflight } from './preflight.ts';
import {
  DIRECTOR_REGISTRY_FINGERPRINTS,
  MOTION_IDENTITY_DEFINITIONS,
  SEQUENCE_STRATEGY_DEFINITIONS,
  TECHNIQUE_COMPOSITION_DEFINITIONS,
  VISUAL_DIRECTOR_FINGERPRINT,
} from './registry.ts';
import { compileVisualDirectionPlan } from './resolver.ts';
import { testDirectionPlan, testSpecification } from './test-support.ts';
import { DeterministicFixtureDirector } from './fixture-director.ts';
import { readVisualDirectionPlanVersioned } from './versioning.ts';

const clone = <T>(value: T): T => structuredClone(value);

describe('P3.3A — Visual Director Core', () => {
  it('valide un VisualDirectionPlan strict et versionné', () => {
    const fixture = testDirectionPlan();
    expect(VisualDirectionPlanSchema.safeParse(fixture.direction).success).toBe(true);
    expect(readVisualDirectionPlanVersioned(fixture.direction)).toEqual(fixture.direction);
  });

  it('ferme et fingerprint les trois registres', () => {
    expect(SEQUENCE_STRATEGY_DEFINITIONS.length).toBeGreaterThanOrEqual(4);
    expect(MOTION_IDENTITY_DEFINITIONS.length).toBeGreaterThanOrEqual(4);
    expect(TECHNIQUE_COMPOSITION_DEFINITIONS.filter((entry) => entry.provenance === 'P3.2.5_NORMALIZED_LANGUAGE_INDEX').length).toBe(12);
    expect(Object.values(DIRECTOR_REGISTRY_FINGERPRINTS).every((hash) => /^[a-f0-9]{64}$/u.test(hash))).toBe(true);
    expect(VISUAL_DIRECTOR_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('résout strictement et déterministiquement vers VisualPlan', () => {
    const fixture = testDirectionPlan();
    const first = compileVisualDirectionPlan(fixture.direction, fixture.plan, fixture.context);
    const second = compileVisualDirectionPlan(fixture.direction, fixture.plan, fixture.context);
    expect(first.ok).toBe(true);
    expect(first.hashes).toEqual(second.hashes);
    expect(first.visual_plan).toEqual(second.visual_plan);
    expect(first.decision_trace).toEqual(second.decision_trace);
  });

  it('agrège plusieurs diagnostics sémantiques indépendants', () => {
    const fixture = testDirectionPlan();
    const invalid = clone(fixture.direction);
    invalid.scenes[0]!.technique_composition_id = 'TRUE_3D_PRODUCT_REVEAL';
    invalid.scenes[0]!.semantic_role = 'PRODUCT';
    invalid.scenes[0]!.asset_intents[0]!.type = 'THREE_D_OBJECT';
    invalid.scenes[0]!.asset_intents[0]!.availability = 'AVAILABLE';
    invalid.scenes[0]!.motif_state = 'CARRY';
    const report = buildVisualDirectionPreflight(invalid, fixture.plan, fixture.context);
    expect(report.diagnostics.map((entry) => entry.code)).toEqual(expect.arrayContaining(['visual_direction.technique.future', 'visual_direction.asset.unavailable', 'visual_direction.motif.unresolved']));
  });

  it('préserve les IDs et l’ordre canonique des scènes', () => {
    const fixture = testDirectionPlan();
    const invalid = clone(fixture.direction);
    invalid.scenes.reverse();
    expect(buildVisualDirectionPreflight(invalid, fixture.plan, fixture.context).diagnostics.some((entry) => entry.code === 'visual_direction.scene.order_changed')).toBe(true);
  });

  it('rejette les IDs de registre et versions inconnus', () => {
    const fixture = testDirectionPlan();
    const invalid = clone(fixture.direction);
    invalid.sequence_strategy.id = 'UNKNOWN_STRATEGY';
    invalid.motion_identity.version = '9.0.0';
    const report = buildVisualDirectionPreflight(invalid, fixture.plan, fixture.context);
    expect(report.diagnostics.map((entry) => entry.code)).toEqual(expect.arrayContaining(['visual_direction.strategy.unknown', 'visual_direction.identity.unknown']));
  });

  it('rejette un asset ou une matière indisponible sans fallback silencieux', () => {
    const fixture = testDirectionPlan();
    const invalid = clone(fixture.direction);
    invalid.scenes[0]!.asset_intents[0]!.type = 'IMAGE';
    invalid.scenes[0]!.asset_intents[0]!.material = 'METALLIC_LIKE';
    const report = buildVisualDirectionPreflight(invalid, fixture.plan, fixture.context);
    expect(report.diagnostics.map((entry) => entry.code)).toEqual(expect.arrayContaining(['visual_direction.asset.unavailable', 'visual_direction.material.unsupported']));
  });

  it('rejette une continuité caméra avec override STATIC', () => {
    const fixture = testDirectionPlan();
    const invalid = clone(fixture.direction);
    invalid.bridges[0]!.camera_continuity = true;
    const report = buildVisualDirectionPreflight(invalid, fixture.plan, fixture.context);
    expect(report.diagnostics.some((entry) => entry.code === 'visual_direction.camera.continuity_mismatch')).toBe(true);
  });

  it('rend un override STATIC explicite et traçable face à une recipe dynamique', () => {
    const fixture = testDirectionPlan();
    const result = compileVisualDirectionPlan(fixture.direction, fixture.plan, fixture.context);
    expect(result.ok).toBe(true);
    expect(result.decision_trace?.entries.some((entry) => entry.source === 'EXPLICIT_SCENE_DIRECTION' && entry.selected.includes('STATIC') && entry.override)).toBe(true);
  });

  it('vérifie les limites exactes des AssetIntents', () => {
    const fixture = testDirectionPlan();
    const exact = clone(fixture.direction);
    const source = exact.scenes[0]!.asset_intents[0]!;
    exact.scenes[0]!.asset_intents = Array.from({ length: 6 }, (_, index) => ({ ...source, id: `asset_limit_${index}` }));
    expect(VisualDirectionPlanSchema.safeParse(exact).success).toBe(true);
    exact.scenes[0]!.asset_intents.push({ ...source, id: 'asset_limit_6' });
    expect(VisualDirectionPlanSchema.safeParse(exact).success).toBe(false);
  });

  it('rejette unknown fields, NaN, oversized et structures cycliques', () => {
    const fixture = testDirectionPlan();
    expect(buildVisualDirectionPreflight({ ...fixture.direction, javascript: 'eval(1)' }, fixture.plan, fixture.context).summary.errors).toBeGreaterThan(0);
    const nan = {
      ...fixture.direction,
      scenes: fixture.direction.scenes.map((scene, index) => index === 0
        ? { ...scene, motion_intensity: Number.NaN }
        : scene),
    };
    expect(buildVisualDirectionPreflight(nan, fixture.plan, fixture.context).summary.errors).toBeGreaterThan(0);
    expect(buildVisualDirectionPreflight({ value: 'x'.repeat(300_000) }, fixture.plan, fixture.context).diagnostics.some((entry) => entry.code === 'visual_direction.payload.oversized')).toBe(true);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(buildVisualDirectionPreflight(cyclic, fixture.plan, fixture.context).diagnostics.some((entry) => entry.code === 'visual_direction.payload.cyclic')).toBe(true);
  });

  it('rejette les clés de prototype dangereuses', () => {
    const fixture = testDirectionPlan();
    const hostile = JSON.parse('{"constructor":{"prototype":{"polluted":true}}}') as unknown;
    expect(buildVisualDirectionPreflight(hostile, fixture.plan, fixture.context).diagnostics.some((entry) => entry.code === 'visual_direction.payload.prototype_key')).toBe(true);
  });

  it('applique une MotionIdentity différente à plusieurs décisions résolues', () => {
    const fixture = testDirectionPlan();
    const specification = testSpecification();
    const alternative = { ...specification, motion_identity_id: 'PUNCHY_SOCIAL' };
    const directionB = new DeterministicFixtureDirector().direct(fixture.plan, fixture.context, alternative);
    const first = compileVisualDirectionPlan(fixture.direction, fixture.plan, fixture.context).visual_plan!;
    const second = compileVisualDirectionPlan(directionB, fixture.plan, fixture.context).visual_plan!;
    expect(first.plan_id).not.toBe(second.plan_id);
    expect(first.scenes.flatMap((scene) => scene.camera_moves.map((entry) => entry.camera_id))).not.toEqual(second.scenes.flatMap((scene) => scene.camera_moves.map((entry) => entry.camera_id)));
    expect(first.scenes.flatMap((scene) => scene.motion_phrases.map((entry) => entry.phrase_id))).not.toEqual(second.scenes.flatMap((scene) => scene.motion_phrases.map((entry) => entry.phrase_id)));
  });

  it('applique une SequenceStrategy différente aux layouts hérités', () => {
    const fixture = testDirectionPlan();
    const specification = testSpecification();
    const alternative = { ...specification, sequence_strategy_id: 'QUESTION_DISCOVERY_EXPLANATION_REVEAL' };
    const directionB = new DeterministicFixtureDirector().direct(fixture.plan, fixture.context, alternative);
    const first = compileVisualDirectionPlan(fixture.direction, fixture.plan, fixture.context).visual_plan!;
    const second = compileVisualDirectionPlan(directionB, fixture.plan, fixture.context).visual_plan!;
    expect(first.scenes.map((scene) => scene.layout)).not.toEqual(second.scenes.map((scene) => scene.layout));
  });

  it('expose un contexte compact et une surface provider de moindre autorité', () => {
    const fixture = testDirectionPlan();
    const context = buildVisualDirectorPlanningContext(fixture.plan, fixture.context);
    expect(context.choices.sequence_strategies).not.toContain('PRODUCT_REVEAL_FEATURES_PAYOFF');
    expect(PROVIDER_MUTABLE_FIELDS).toContain('scenes.technique_composition_id');
    expect(CANONICAL_IMMUTABLE_FIELDS).toEqual(expect.arrayContaining(['scene_ids', 'factual_requirements', 'asset_availability']));
    expect(JSON.stringify(context)).not.toContain('gpt-6-astra');
  });

  it('maintient un registre de migrations vide, déterministe et sans fausse histoire', () => {
    const fixture = testDirectionPlan();
    const unknown = { ...fixture.direction, schema_version: '9.0.0' };
    expect(() => readVisualDirectionPlanVersioned(unknown)).toThrow(/path_missing/u);
    expect(() => readVisualDirectionPlanVersioned(unknown, [{ from: '9.0.0', to: '9.0.0', migrate: (value) => value }])).toThrow(/cycle/u);
  });
});
