import { z } from 'zod';

import { AssetKindSchema, DocumentRefSchema, SemVerSchema, Sha256Schema } from './common.ts';
import { AssetEntrySchema, LexiconEntrySchema, LogoSchema, StylePathSchema } from './brand-profile.ts';
import { SeriesMotionProfileSchema } from './series-profile.ts';
import { CreativeStyleProfileSchema, TokenKeySchema } from './style-profile.ts';

export const RESOLVED_STYLE_SCHEMA = 'resolved-style';
export const RESOLVED_STYLE_VERSION = '0.1.0';

export const STYLE_MODES = ['creative', 'brand', 'series'] as const;
export type StyleMode = (typeof STYLE_MODES)[number];

/**
 * La SEULE représentation stylistique consommée par le moteur. Produite par
 * `resolveStyle()` ; le compilateur ne lit jamais un profil de marque ou de
 * série directement.
 */
export const ResolvedStyleSchema = z.strictObject({
  schema: z.literal(RESOLVED_STYLE_SCHEMA),
  schema_version: SemVerSchema,
  mode: z.enum(STYLE_MODES),
  sources: z.strictObject({
    style: DocumentRefSchema.extend({ origin: z.enum(['authored', 'generated']) }),
    brand: DocumentRefSchema.nullable(),
    series: DocumentRefSchema.nullable(),
  }),
  /** Style effectif, surcharges de série appliquées, interdits cumulés. */
  style: CreativeStyleProfileSchema,
  identity: z.strictObject({
    name: z.string().nullable(),
    logos: z.record(TokenKeySchema, LogoSchema),
    lexicon: z.array(LexiconEntrySchema),
    claims_forbid: z.array(z.string()),
    disclaimer: z.string().nullable(),
    end_card_logo: TokenKeySchema.nullable(),
    asset_priority: z.array(AssetKindSchema),
    allow_generated_images: z.boolean(),
    approved_assets: z.array(AssetEntrySchema),
  }),
  signature: SeriesMotionProfileSchema.shape.signature.nullable(),
  locks: z.array(StylePathSchema),
  applied_overrides: z.array(z.strictObject({ source: z.literal('series'), path: StylePathSchema })),
  /** Empreinte du style résolu, calculée sur tout le reste du document. */
  sha256: Sha256Schema,
});
export type ResolvedStyle = z.infer<typeof ResolvedStyleSchema>;
