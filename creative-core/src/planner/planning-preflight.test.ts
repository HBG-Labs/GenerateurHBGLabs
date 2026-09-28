import { describe, expect, it } from 'vitest';

import { DEFAULT_ARCHETYPE_REGISTRY } from './archetypes.ts';
import { DEFAULT_PLANNER_LIMITS } from './limits.ts';
import { planCreativeStory } from './plan.ts';
import { runPlanningPreflight } from './preflight.ts';
import { loadValidPlannerFixture } from '../test-support.ts';

describe('PlanningPreflight', () => {
  it('valide la conservation des rôles, les références et le budget exact', () => {
    const input = loadValidPlannerFixture('hypothetical-30s');
    const result = planCreativeStory(input);
    const archetype = DEFAULT_ARCHETYPE_REGISTRY.get('HYPOTHETICAL')!;
    expect(
      runPlanningPreflight({
        planner_input: input,
        archetype,
        beats: result.report!.beats,
        scenes: result.report!.scenes,
        content_slots: result.content_slots,
        asset_intent_count: result.report!.asset_intents.length,
        limits: DEFAULT_PLANNER_LIMITS,
      }),
    ).toEqual([]);
  });

  it('détecte durée inexacte, scène trop courte, beat absent et référence invalide', () => {
    const input = loadValidPlannerFixture('minimal-5s');
    const result = planCreativeStory(input);
    const archetype = DEFAULT_ARCHETYPE_REGISTRY.get('HYPOTHETICAL')!;
    const beats = result.report!.beats.slice(1);
    const scenes = structuredClone(result.report!.scenes);
    scenes[0]!.duration_ms = 1;
    scenes[0]!.beat_ids = ['missing_beat'];
    const diagnostics = runPlanningPreflight({
      planner_input: input,
      archetype,
      beats,
      scenes,
      content_slots: result.content_slots,
      asset_intent_count: 0,
      limits: DEFAULT_PLANNER_LIMITS,
    });
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        'planner.duration_not_exact',
        'planner.scene_too_short',
        'planner.reference.beat_missing',
        'planner.required_role_missing',
      ]),
    );
  });
});
