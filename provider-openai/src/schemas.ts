import { z } from 'zod';

import { ArchetypeIdSchema, StableIdSchema } from '@motion-engine/creative-core';
import {
  PlanningGenerationOutputSchema,
  ResolutionContentSchema,
  ResolutionGenerationOutputSchema,
  type PlanningGenerationOutput,
  type ResolutionGenerationOutput,
} from '@motion-engine/creative-gateway';

/** Structured Outputs exige que chaque propriété soit requise. `null` représente ici l'absence explicite. */
export const OpenAIPlanningOutputSchema = PlanningGenerationOutputSchema.extend({
  provenance: z.literal('provider_generated'),
  narrative_archetype: ArchetypeIdSchema.nullable(),
}).strict();
export type OpenAIPlanningOutput = z.infer<typeof OpenAIPlanningOutputSchema>;

const OpenAIResolutionContentSchema = ResolutionContentSchema.extend({
  scene_id: StableIdSchema.nullable(),
  provenance: z.literal('provider_generated'),
}).strict();

export const OpenAIResolutionOutputSchema = ResolutionGenerationOutputSchema.extend({
  provenance: z.literal('provider_generated'),
  content: z.array(OpenAIResolutionContentSchema).max(128),
  asset_descriptions: ResolutionGenerationOutputSchema.shape.asset_descriptions,
}).strict();
export type OpenAIResolutionOutput = z.infer<typeof OpenAIResolutionOutputSchema>;

export function planningWireToGateway(output: OpenAIPlanningOutput): PlanningGenerationOutput {
  const { narrative_archetype: archetype, ...rest } = output;
  return PlanningGenerationOutputSchema.parse({
    ...rest,
    ...(archetype === null ? {} : { narrative_archetype: archetype }),
  });
}

export function resolutionWireToGateway(output: OpenAIResolutionOutput): ResolutionGenerationOutput {
  return ResolutionGenerationOutputSchema.parse({
    ...output,
    content: output.content.map(({ scene_id: sceneId, ...entry }) => ({
      ...entry,
      ...(sceneId === null ? {} : { scene_id: sceneId }),
    })),
  });
}
