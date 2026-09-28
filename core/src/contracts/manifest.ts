import { z } from 'zod';

import { DocumentRefSchema, IdSchema, SemVerSchema, Sha256Schema } from './common.ts';
import { StyleBindingSchema } from './motion-spec.ts';
import { AssetProvenanceSchema, SemanticRegionSchema } from './visual.ts';

export const MANIFEST_SCHEMA = 'reproducibility-manifest';
export const MANIFEST_VERSION = '0.4.0';

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
    git_dirty: z.boolean(),
    reference_eligible: z.boolean(),
    reference_ineligibility_reasons: z.array(z.string().min(1)),
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
  patterns: z.array(z.strictObject({ id: z.string(), version: SemVerSchema, sha256: Sha256Schema })),
  fonts: z.array(
    z.strictObject({
      file: z.string(),
      sha256: Sha256Schema,
      axes: z.record(z.string(), z.number().finite()),
      supported_axes: z.record(
        z.string(),
        z.strictObject({ min: z.number().finite(), default: z.number().finite(), max: z.number().finite() }),
      ),
      substituted_for: z.string().nullable(),
    }),
  ),
  assets: z.array(
    z.strictObject({
      ref: IdSchema,
      file: z.string(),
      sha256: Sha256Schema,
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      mime: z.enum(['image/png', 'image/jpeg']),
      provenance: AssetProvenanceSchema,
      semantic_regions: z.array(SemanticRegionSchema),
      transformations: z.array(z.string()),
    }),
  ),
  compilation: z.strictObject({
    timing_source: z.enum(['explicit_duration', 'voice_timestamps', 'fallback_frames']),
    behavior_registry_fingerprint: Sha256Schema,
    text_engine: z.strictObject({
      name: z.literal('harfbuzzjs'),
      package_version: SemVerSchema,
      native_version: z.string(),
      shaping_configuration: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    }),
    renderer: z.strictObject({ name: z.string(), version: SemVerSchema }).nullable(),
    renderer_capabilities_fingerprint: Sha256Schema.nullable(),
  }),
  render_plan_sha256: Sha256Schema,
  audio_plan_sha256: Sha256Schema.nullable(),
  subtitle_plan_sha256: Sha256Schema.nullable(),
  preflight_sha256: Sha256Schema,
  dependency_graph_sha256: Sha256Schema.nullable(),
  toolchain: z.strictObject({
    node: z.string(),
    package_manager: z.string(),
    lockfile_sha256: Sha256Schema,
    remotion: z.string().nullable(),
    chromium: z.string().nullable(),
    ffmpeg: z.string().nullable(),
    harfbuzzjs: z.string(),
    renderer_package: z.string().nullable(),
    os: z.string(),
    arch: z.string(),
  }),
  configuration: z.strictObject({
    engine_limits_sha256: Sha256Schema,
    network_required: z.literal(false),
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
