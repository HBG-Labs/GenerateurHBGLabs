import { z } from 'zod';

export const PlannerLimitsSchema = z.strictObject({
  max_input_json_bytes: z.number().int().positive(),
  max_depth: z.number().int().positive(),
  max_nodes: z.number().int().positive(),
  max_string_characters: z.number().int().positive(),
  min_duration_ms: z.number().int().positive(),
  max_duration_ms: z.number().int().positive(),
  max_constraints: z.number().int().nonnegative(),
  max_provided_content: z.number().int().nonnegative(),
  max_provided_content_characters: z.number().int().nonnegative(),
  max_beats: z.number().int().positive(),
  max_scenes: z.number().int().positive(),
  max_content_slots: z.number().int().positive(),
  max_asset_intents: z.number().int().nonnegative(),
});
export type PlannerLimits = z.infer<typeof PlannerLimitsSchema>;

export const DEFAULT_PLANNER_LIMITS: Readonly<PlannerLimits> = Object.freeze({
  max_input_json_bytes: 262_144,
  max_depth: 16,
  max_nodes: 10_000,
  max_string_characters: 20_000,
  min_duration_ms: 3_000,
  max_duration_ms: 180_000,
  max_constraints: 64,
  max_provided_content: 64,
  max_provided_content_characters: 30_000,
  max_beats: 24,
  max_scenes: 24,
  max_content_slots: 128,
  max_asset_intents: 64,
});
