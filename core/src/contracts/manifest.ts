import { z } from 'zod';

import { DocumentRefSchema, IdSchema, SemVerSchema, Sha256Schema } from './common.ts';
import { StyleBindingSchema } from './motion-spec.ts';

export const MANIFEST_SCHEMA = 'reproducibility-manifest';
export const MANIFEST_VERSION = '0.1.0';

/**
 * Tout ce qui détermine le rendu. Deux manifestes d'empreinte égale doivent
 * produire le même rendu sur la même pile ; `created_at` est exclu de
 * l'empreinte parce qu'il ne change rien au résultat.
 */
export const ReproducibilityManifestSchema = z.strictObject({
  schema: z.literal(MANIFEST_SCHEMA),
  schema_version: SemVerSchema,
  created_at: z.iso.datetime({ offset: true }),
  engine: z.strictObject({
    name: z.string().min(1),
    version: SemVerSchema,
    git_commit: z.string().regex(/^[0-9a-f]{7,40}$/).nullable(),
  }),
  spec: z.strictObject({ spec_id: IdSchema, revision: z.number().int().min(1), sha256: Sha256Schema }),
  style: z.strictObject({
    /** Liaison déclarée par la spec. */
    binding: StyleBindingSchema,
    mode: z.enum(['creative', 'brand', 'series']),
    resolved_sha256: Sha256Schema,
    sources: z.strictObject({
      style: DocumentRefSchema,
      brand: DocumentRefSchema.nullable(),
      series: DocumentRefSchema.nullable(),
    }),
    /** Vrai si le style utilisé n'est pas celui de la liaison. */
    substituted: z.boolean(),
    substitution_reason: z.string().min(1).max(300).nullable(),
  }),
  platform_presets: z.strictObject({ version: SemVerSchema, sha256: Sha256Schema }).nullable(),
  fonts: z.array(z.strictObject({ file: z.string(), sha256: Sha256Schema })),
  assets: z.array(z.strictObject({ ref: IdSchema, sha256: Sha256Schema })),
  render_plan_sha256: Sha256Schema,
  toolchain: z.strictObject({
    node: z.string(),
    remotion: z.string().nullable(),
    chromium: z.string().nullable(),
    ffmpeg: z.string().nullable(),
  }),
  render_config: z.strictObject({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().int().positive(),
    codec: z.enum(['h264', 'png-still']),
    crf: z.number().int().min(0).max(51).nullable(),
    pixel_format: z.string().nullable(),
  }),
  manifest_sha256: Sha256Schema,
});
export type ReproducibilityManifest = z.infer<typeof ReproducibilityManifestSchema>;
