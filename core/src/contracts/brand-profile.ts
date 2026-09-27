import { z } from 'zod';

import {
  AssetKindSchema,
  ColorTokenSchema,
  DocumentRefSchema,
  IdSchema,
  LocaleSchema,
  ResourceRefSchema,
  SemVerSchema,
  Sha256Schema,
  TypeTokenSchema,
} from './common.ts';
import { TokenKeySchema } from './style-profile.ts';

export const BRAND_PROFILE_SCHEMA = 'brand-motion-profile';
export const BRAND_PROFILE_VERSION = '0.1.0';

const Px = z.number().finite().min(0).max(16384);

export const AssetEntrySchema = z.strictObject({
  ref: IdSchema,
  kind: AssetKindSchema,
  src: ResourceRefSchema,
  sha256: Sha256Schema,
  width: z.number().int().min(1).max(16384),
  height: z.number().int().min(1).max(16384),
  rights: z.string().min(1).max(300),
  description: z.string().max(300).optional(),
  focal_point: z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
  regions: z.record(z.string(), z.strictObject({ x: Px, y: Px, w: Px, h: Px })).optional(),
});
export type AssetEntry = z.infer<typeof AssetEntrySchema>;

export const LexiconEntrySchema = z.strictObject({
  term: z.string().min(1).max(60),
  say: z.string().min(1).max(120),
  locale: LocaleSchema.optional(),
});
export type LexiconEntry = z.infer<typeof LexiconEntrySchema>;

export const LogoSchema = z.strictObject({
  runs: z.array(z.strictObject({ text: z.string().min(1).max(40), color: ColorTokenSchema })).min(1).max(4),
  type: TypeTokenSchema,
});

/** Chemin verrouillable d'un style : `palette`, `palette.accent`, `typography.families`. */
export const StylePathSchema = z.string().regex(/^[a-z_]+(\.[a-z0-9_]+)*$/, 'chemin de style attendu');

/**
 * Identité et gouvernance d'une marque. Aucune valeur visuelle ici : la
 * marque désigne son style (par empreinte) et en verrouille les parties
 * intouchables.
 */
export const BrandMotionProfileSchema = z.strictObject({
  schema: z.literal(BRAND_PROFILE_SCHEMA),
  schema_version: SemVerSchema,
  id: IdSchema,
  version: SemVerSchema,
  name: z.string().min(1).max(80),
  style: z.strictObject({ ref: DocumentRefSchema, src: ResourceRefSchema }),
  locks: z.array(StylePathSchema).max(64),
  logos: z.record(TokenKeySchema, LogoSchema),
  assets: z.strictObject({
    approved: z.array(AssetEntrySchema).max(512),
    /** Ordre de préférence des natures d'assets pour cette marque. */
    priority: z.array(AssetKindSchema).max(10),
    allow_generated_images: z.boolean(),
  }),
  lexicon: z.array(LexiconEntrySchema).max(128),
  claims_policy: z.strictObject({
    forbid: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)).max(32),
    disclaimer: z.string().max(300).nullable(),
  }),
  mandatory: z.strictObject({
    end_card_logo: TokenKeySchema.nullable(),
  }),
});
export type BrandMotionProfile = z.infer<typeof BrandMotionProfileSchema>;
