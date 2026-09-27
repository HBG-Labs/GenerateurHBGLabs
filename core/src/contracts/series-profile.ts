import { z } from 'zod';

import {
  CueIdSchema,
  DocumentRefSchema,
  DottedIdSchema,
  IdSchema,
  ResourceRefSchema,
  SemVerSchema,
} from './common.ts';
import { LexiconEntrySchema, StylePathSchema } from './brand-profile.ts';
import { VariationSchema } from './motion-spec.ts';
import { TokenKeySchema } from './style-profile.ts';

export const SERIES_PROFILE_SCHEMA = 'series-motion-profile';
export const SERIES_PROFILE_VERSION = '0.1.0';

/** Appel d'un pattern existant : une série n'apporte jamais de code. */
export const PatternCallSchema = z.strictObject({
  pattern: DottedIdSchema,
  version: SemVerSchema,
  variation: VariationSchema.optional(),
});

/**
 * Format récurrent. La série désigne un style (et éventuellement une marque),
 * le surcharge dans les sections autorisées et ajoute une signature :
 * ouverture, fermeture, règles de hook, motifs et son récurrents.
 */
export const SeriesMotionProfileSchema = z.strictObject({
  schema: z.literal(SERIES_PROFILE_SCHEMA),
  schema_version: SemVerSchema,
  id: IdSchema,
  version: SemVerSchema,
  name: z.string().min(1).max(80),
  style: z.strictObject({ ref: DocumentRefSchema, src: ResourceRefSchema }),
  brand: z.strictObject({ ref: DocumentRefSchema, src: ResourceRefSchema }).nullable(),
  /** Surcharges du style, section par section ; fusion profonde. */
  overrides: z.record(z.string(), z.unknown()),
  signature: z.strictObject({
    intro: PatternCallSchema.nullable(),
    outro: PatternCallSchema.nullable(),
    end_card: PatternCallSchema.nullable(),
    /** Gabarits de hook ; `{placeholder}` est rempli par le Creative Director. */
    hook_templates: z.array(z.string().min(1).max(120)).max(16),
    recurring_motifs: z.array(TokenKeySchema).max(8),
    sound_signature: CueIdSchema.nullable(),
  }),
  lexicon: z.array(LexiconEntrySchema).max(128),
  variation_budget: z.strictObject({
    /** Chemins de style figés d'un épisode à l'autre. */
    fixed: z.array(StylePathSchema).max(64),
    free_axes: z.array(z.enum(['layout_variant', 'motion_variant', 'energy', 'hierarchy_variant'])).max(4),
  }),
  extra_forbidden_tags: z.array(IdSchema).max(32),
});
export type SeriesMotionProfile = z.infer<typeof SeriesMotionProfileSchema>;
