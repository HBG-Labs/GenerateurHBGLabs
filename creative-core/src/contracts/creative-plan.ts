import { z } from 'zod';

import { StableIdSchema } from './common.ts';
import {
  AssetIntentSchema,
  AudienceIntentSchema,
  AudioIntentSchema,
  CreativeIntentSchema,
  MotionIntentSchema,
  NarrativePlanSchema,
  PacingIntentSchema,
  SceneContentSchema,
  SubtitleIntentSchema,
  TargetIntentSchema,
  TransitionIntentSchema,
  TypographyIntentSchema,
  VisualIntentSchema,
} from './intents.ts';

export const CREATIVE_PLAN_VERSION = '0.1.0' as const;

export const SceneIntentSchema = z.strictObject({
  id: StableIdSchema,
  narrative_role: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  semantic_purpose: z.string().min(1).max(4_000),
  content: SceneContentSchema,
  visual: VisualIntentSchema.optional(),
  motion: MotionIntentSchema.optional(),
  typography: TypographyIntentSchema.optional(),
  audio: AudioIntentSchema.optional(),
  subtitles: SubtitleIntentSchema.optional(),
  transition_out: TransitionIntentSchema.optional(),
  pacing: PacingIntentSchema.optional(),
  asset_slots: z.array(StableIdSchema).max(2_048),
});
export type SceneIntent = z.infer<typeof SceneIntentSchema>;

export const GlobalIntentSchema = z.strictObject({
  visual: VisualIntentSchema.optional(),
  motion: MotionIntentSchema.optional(),
  typography: TypographyIntentSchema.optional(),
  audio: AudioIntentSchema.optional(),
  subtitles: SubtitleIntentSchema.optional(),
  transitions: TransitionIntentSchema.optional(),
  pacing: PacingIntentSchema.optional(),
});
export type GlobalIntent = z.infer<typeof GlobalIntentSchema>;

export const CreativePlanSchema = z.strictObject({
  schema: z.literal('creative-plan'),
  schema_version: z.literal(CREATIVE_PLAN_VERSION),
  plan_id: StableIdSchema,
  revision: z.number().int().positive().max(1_000_000),
  creative_intent: CreativeIntentSchema,
  audience: AudienceIntentSchema,
  target: TargetIntentSchema,
  narrative: NarrativePlanSchema,
  global_intents: GlobalIntentSchema,
  asset_intents: z.array(AssetIntentSchema).max(2_048),
  scenes: z.array(SceneIntentSchema).min(1).max(2_048),
});
export type CreativePlan = z.infer<typeof CreativePlanSchema>;
