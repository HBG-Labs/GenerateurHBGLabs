import { z } from 'zod';

import { ARCHETYPE_IDS, ArchetypeIdSchema, StableIdSchema } from '@motion-engine/creative-core';
import {
  PlanningGenerationOutputSchema,
  ResolutionContentSchema,
  ResolutionGenerationOutputSchema,
  type PlanningGenerationOutput,
  type ResolutionGenerationOutput,
} from '@motion-engine/creative-gateway';

/** Structured Outputs exige que chaque propriété soit requise. `null` représente ici l'absence explicite. */
export function createOpenAIPlanningOutputSchema(allowedArchetypeIds: readonly string[]) {
  const parsedIds = [...new Set(allowedArchetypeIds.map((id) => ArchetypeIdSchema.parse(id)))];
  if (parsedIds.length === 0) throw new Error('Le registre actif doit exposer au moins un archétype.');
  const allowedArchetypeSchema = z.enum(parsedIds as [string, ...string[]]);
  return PlanningGenerationOutputSchema.extend({
    provenance: z.literal('provider_generated'),
    narrative_archetype: allowedArchetypeSchema.nullable(),
  }).strict();
}

export const OpenAIPlanningOutputSchema = createOpenAIPlanningOutputSchema(ARCHETYPE_IDS);
export type OpenAIPlanningOutput = z.infer<typeof OpenAIPlanningOutputSchema>;

export function createOpenAIResolutionOutputSchema(allowedSceneIds?: readonly string[]) {
  const sceneIdSchema = allowedSceneIds === undefined
    ? StableIdSchema
    : (() => {
        const parsedIds = [...new Set(allowedSceneIds.map((id) => StableIdSchema.parse(id)))];
        return parsedIds.length === 0
          ? StableIdSchema
          : z.enum(parsedIds as [string, ...string[]]);
      })();
  const contentSchema = ResolutionContentSchema.extend({
    scene_id: sceneIdSchema.nullable(),
    provenance: z.literal('provider_generated'),
  }).strict();
  return ResolutionGenerationOutputSchema.extend({
    provenance: z.literal('provider_generated'),
    content: z.array(contentSchema).max(128),
    asset_descriptions: ResolutionGenerationOutputSchema.shape.asset_descriptions,
  }).strict();
}

export const OpenAIResolutionOutputSchema = createOpenAIResolutionOutputSchema();
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
