import { z } from 'zod';

import { ARCHETYPE_IDS, ArchetypeIdSchema, StableIdSchema } from '@motion-engine/creative-core';
import {
  PlanningGenerationOutputSchema,
  ResolutionContentSchema,
  ResolutionGenerationOutputSchema,
  ResolutionRepairPatchSchema,
  type PlanningGenerationOutput,
  type ResolutionGenerationOutput,
  type ResolutionRepairPatch,
  type ResolutionRepairRequest,
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

export function createOpenAIResolutionRepairPatchSchema(request: ResolutionRepairRequest) {
  const slotIds = [...new Set(request.targets.map((target) => target.target.slot_id))];
  const sceneIds = [...new Set(request.targets.flatMap((target) => [
    ...target.allowed_scene_ids,
    ...(target.target.scene_id === null ? [] : [target.target.scene_id]),
  ]))];
  const slotSchema = z.enum(slotIds as [string, ...string[]]);
  const sceneSchema = sceneIds.length === 0
    ? StableIdSchema.nullable()
    : z.enum(sceneIds as [string, ...string[]]).nullable();
  const itemSchema = ResolutionRepairPatchSchema.shape.items.element.extend({
    target: ResolutionRepairPatchSchema.shape.items.element.shape.target.extend({
      slot_id: slotSchema,
      scene_id: sceneSchema,
    }).strict(),
    replacement: ResolutionRepairPatchSchema.shape.items.element.shape.replacement.extend({
      scene_id: sceneSchema,
      provenance: z.literal('provider_generated'),
    }).strict(),
  }).strict();
  return ResolutionRepairPatchSchema.extend({ items: z.array(itemSchema).min(1).max(request.targets.length) }).strict();
}

export type OpenAIResolutionRepairPatch = z.infer<ReturnType<typeof createOpenAIResolutionRepairPatchSchema>>;

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

export function resolutionRepairWireToGateway(output: OpenAIResolutionRepairPatch): ResolutionRepairPatch {
  return ResolutionRepairPatchSchema.parse(output);
}
