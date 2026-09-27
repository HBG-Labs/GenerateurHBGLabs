import { z } from 'zod';

import { DottedIdSchema, EnergySchema, IdSchema, LocaleSchema, PlatformSchema, SemVerSchema } from './common.ts';

export const CREATIVE_INTENT_SCHEMA = 'creative-intent';
export const CREATIVE_INTENT_VERSION = '0.1.0';

export const BEAT_ROLES = [
  'setup',
  'tension',
  'interruption',
  'turn',
  'explanation',
  'proof',
  'resolution',
  'signature',
  'cta',
] as const;

/**
 * Contraintes génériques. Leur contrôle effectif (vérification factuelle,
 * par exemple) appartient à des étapes ultérieures, pas au contrat.
 */
export const INTENT_CONSTRAINTS = [
  'no_invented_numbers',
  'factual_accuracy_required',
  'real_assets_only',
  'no_testimonials',
  'no_prices',
] as const;

/**
 * Un temps narratif : ce qui est dit et montré, et pourquoi. Jamais comment
 * c'est disposé ou animé, ni à quel instant.
 */
export const IntentBeatSchema = z.strictObject({
  id: IdSchema,
  role: z.enum(BEAT_ROLES),
  voice: z.string().min(1).max(400),
  on_screen: z
    .strictObject({
      lines: z.array(z.string().min(1).max(80)).min(1).max(6),
      accent: z.string().min(1).max(80).optional(),
    })
    .optional(),
  emphasis: z.array(z.string().min(1).max(64)).max(3).optional(),
  pause_after: z.enum(['none', 'breath', 'beat', 'hold']).optional(),
  asset: IdSchema.optional(),
});
export type IntentBeat = z.infer<typeof IntentBeatSchema>;

export const CreativeIntentSchema = z.strictObject({
  schema: z.literal(CREATIVE_INTENT_SCHEMA),
  schema_version: SemVerSchema,
  intent_id: IdSchema,
  locale: LocaleSchema,
  message: z.string().min(1).max(600),
  objective: z.string().min(1).max(200).optional(),
  audience: z.string().min(1).max(200).optional(),
  platforms: z.array(PlatformSchema).min(1).max(3),
  target_duration_s: z
    .strictObject({ min: z.number().min(1).max(90), max: z.number().min(1).max(90) })
    .optional(),
  system: DottedIdSchema.optional(),
  tension_curve: DottedIdSchema,
  energy: EnergySchema.optional(),
  beats: z.array(IntentBeatSchema).min(1).max(12),
  constraints: z.array(z.enum(INTENT_CONSTRAINTS)).max(INTENT_CONSTRAINTS.length),
});
export type CreativeIntent = z.infer<typeof CreativeIntentSchema>;
