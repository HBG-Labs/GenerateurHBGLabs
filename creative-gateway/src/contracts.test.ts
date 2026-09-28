import { describe, expect, it } from 'vitest';

import { PlannerInputSchema } from '@motion-engine/creative-core';

import { PlanningGenerationOutputSchema } from './contracts.ts';
import { planningOutputToPlannerInput } from './mapping.ts';
import { dinosaurRequest } from './test-support.ts';

function validPlanningOutput() {
  const request = dinosaurRequest();
  return {
    schema: 'creative-generation-output' as const,
    schema_version: '0.1.0' as const,
    stage: 'planning' as const,
    request_id: request.request_id,
    provenance: 'fixture' as const,
    normalized_topic: request.idea,
    creative_goal: request.creative_goal,
    audience: request.audience,
    language: request.language,
    locale: request.locale,
    target_duration_ms: request.target_duration_ms,
    target_format: request.target_format,
    tone: [...request.tone],
    pacing: 'fast' as const,
    information_density: 'medium' as const,
    narrative_archetype: 'HYPOTHETICAL',
    desired_reaction: request.desired_reaction,
    factual_mode: request.factual_mode,
    cta: request.cta,
    suggested_constraints: [],
  };
}

describe('P2.4 — compatibilité contractuelle Gateway → PlannerInput', () => {
  it.each(['high-impact', 'high.impact'])(
    'refuse creative_goal=%s avant le Planner',
    (creativeGoal) => {
      const parsed = PlanningGenerationOutputSchema.safeParse({
        ...validPlanningOutput(),
        creative_goal: creativeGoal,
      });
      expect(parsed.success).toBe(false);
    },
  );

  it('accepte creative_goal=high_impact et produit un PlannerInput valide', () => {
    const request = dinosaurRequest();
    const output = PlanningGenerationOutputSchema.parse({
      ...validPlanningOutput(),
      creative_goal: 'high_impact',
    });
    const plannerInput = planningOutputToPlannerInput(request, output);
    expect(PlannerInputSchema.safeParse(plannerInput).success).toBe(true);
    expect(plannerInput.creative_goal).toBe('high_impact');
  });

  it.each(['high-impact', 'high.impact'])(
    'refuse tone=%s avant le Planner',
    (tone) => {
      const parsed = PlanningGenerationOutputSchema.safeParse({
        ...validPlanningOutput(),
        tone: [tone],
      });
      expect(parsed.success).toBe(false);
    },
  );

  it('garantit la compatibilité de tous les champs partagés sur une sortie valide', () => {
    const request = dinosaurRequest();
    const output = PlanningGenerationOutputSchema.parse({
      ...validPlanningOutput(),
      creative_goal: 'high_impact',
      tone: ['high_impact', 'dramatic'],
    });
    const plannerInput = planningOutputToPlannerInput(request, output);
    expect(() => PlannerInputSchema.parse(plannerInput)).not.toThrow();
  });
});
