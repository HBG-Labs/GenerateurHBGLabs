import { describe, expect, it } from 'vitest';

import {
  ArchetypeRegistry,
  DEFAULT_ARCHETYPES,
  DEFAULT_ARCHETYPE_REGISTRY,
  NarrativeArchetypeSchema,
} from './archetypes.ts';
import { loadValidPlannerFixture } from '../test-support.ts';

describe('registre d’archétypes narratifs', () => {
  it('enregistre les sept archétypes requis avec un fingerprint stable', () => {
    expect(DEFAULT_ARCHETYPE_REGISTRY.definitions().map((definition) => definition.id)).toEqual([
      'COMPARISON',
      'DEMONSTRATION',
      'EXPLAINER',
      'HYPOTHETICAL',
      'LIST',
      'PROBLEM_SOLUTION',
      'REVEAL',
    ]);
    expect(DEFAULT_ARCHETYPE_REGISTRY.fingerprint()).toMatch(/^[0-9a-f]{64}$/);
    expect(DEFAULT_ARCHETYPE_REGISTRY.fingerprint()).toBe(DEFAULT_ARCHETYPE_REGISTRY.fingerprint());
  });

  it('déclare rôles, ordre, durée, pacing et validation pour chaque archétype', () => {
    for (const definition of DEFAULT_ARCHETYPES) {
      expect(NarrativeArchetypeSchema.safeParse(definition).success).toBe(true);
      expect(definition.required_roles.length).toBeGreaterThan(0);
      expect(definition.ordering_constraints.length).toBeGreaterThan(0);
      expect(definition.duration_strategy.scene_count_bands.length).toBeGreaterThan(2);
      expect(definition.pacing_strategy.default).toBeTruthy();
      expect(definition.validation_rules.max_repeated_role_scenes).toBeGreaterThan(0);
    }
  });

  it('sélectionne explicitement ou par goal sans lire sémantiquement le topic', () => {
    const explicit = loadValidPlannerFixture('hypothetical-30s');
    expect(DEFAULT_ARCHETYPE_REGISTRY.select(explicit)).toEqual(
      expect.objectContaining({ definition: expect.objectContaining({ id: 'HYPOTHETICAL' }), selection: 'received' }),
    );
    const inferred = structuredClone(explicit);
    delete inferred.narrative_archetype;
    inferred.creative_goal = 'educate';
    expect(DEFAULT_ARCHETYPE_REGISTRY.select(inferred)).toEqual(
      expect.objectContaining({ definition: expect.objectContaining({ id: 'EXPLAINER' }), selection: 'goal_match' }),
    );
    inferred.creative_goal = 'unknown_goal';
    expect(DEFAULT_ARCHETYPE_REGISTRY.select(inferred)).toEqual(
      expect.objectContaining({ definition: expect.objectContaining({ id: 'EXPLAINER' }), selection: 'defaulted' }),
    );
  });

  it('accepte un archétype externe sans modifier le Planner Core', () => {
    const custom = NarrativeArchetypeSchema.parse({
      ...DEFAULT_ARCHETYPES[0],
      id: 'CUSTOM_ARC',
      selection_goals: ['custom_goal'],
    });
    const registry = new ArchetypeRegistry([...DEFAULT_ARCHETYPES, custom]);
    expect(registry.get('CUSTOM_ARC')).toEqual(custom);
  });

  it('refuse les IDs d’archétype dupliqués', () => {
    expect(() => new ArchetypeRegistry([DEFAULT_ARCHETYPES[0]!, DEFAULT_ARCHETYPES[0]!])).toThrow(/dupliqué/u);
  });
});
