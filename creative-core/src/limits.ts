import { z } from 'zod';

export const CreativeLimitsSchema = z.strictObject({
  max_json_bytes: z.number().int().positive(),
  max_depth: z.number().int().positive(),
  max_nodes: z.number().int().positive(),
  max_string_characters: z.number().int().positive(),
  max_scenes: z.number().int().positive(),
  max_duration_seconds: z.number().finite().positive(),
  max_script_characters: z.number().int().positive(),
  max_on_screen_characters_per_scene: z.number().int().positive(),
  max_asset_intents: z.number().int().nonnegative(),
  max_elements_per_scene: z.number().int().nonnegative(),
  max_content_items_per_scene: z.number().int().nonnegative(),
  max_narrative_sections: z.number().int().positive(),
});
export type CreativeLimits = z.infer<typeof CreativeLimitsSchema>;

/**
 * Limites d'un document de direction créative, pas d'un RenderPlan P1.
 * Elles couvrent confortablement un short-form de 10 à 180 secondes tout en
 * refusant avant validation les charges JSON susceptibles d'épuiser le moteur.
 */
export const DEFAULT_CREATIVE_LIMITS: Readonly<CreativeLimits> = Object.freeze({
  max_json_bytes: 1_048_576,
  max_depth: 24,
  max_nodes: 50_000,
  max_string_characters: 100_000,
  max_scenes: 48,
  max_duration_seconds: 180,
  max_script_characters: 30_000,
  max_on_screen_characters_per_scene: 1_000,
  max_asset_intents: 128,
  max_elements_per_scene: 32,
  max_content_items_per_scene: 128,
  max_narrative_sections: 64,
});
