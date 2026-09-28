import { z } from 'zod';

import { HexColorSchema, IdSchema, ResourceRefSchema, Sha256Schema } from './common.ts';

export const NormalizedPointSchema = z.strictObject({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
});
export type NormalizedPoint = z.infer<typeof NormalizedPointSchema>;

export const NormalizedBoxSchema = z
  .strictObject({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    w: z.number().finite().positive().max(1),
    h: z.number().finite().positive().max(1),
  })
  .refine((box) => box.x + box.w <= 1 && box.y + box.h <= 1, 'la région doit rester dans les bornes normalisées');
export type NormalizedBox = z.infer<typeof NormalizedBoxSchema>;

export const SEMANTIC_REGION_KINDS = ['subject', 'face', 'product', 'screen', 'negative_space'] as const;
export const SemanticRegionSchema = z.strictObject({
  id: IdSchema,
  kind: z.enum(SEMANTIC_REGION_KINDS),
  box: NormalizedBoxSchema,
  /** P1.4 n'infère rien : la région vient toujours de métadonnées humaines ou de fixture. */
  source: z.enum(['authored', 'fixture']),
});
export type SemanticRegion = z.infer<typeof SemanticRegionSchema>;

export const AssetProvenanceSchema = z.strictObject({
  license: z.string().min(1).max(160),
  source: z.string().min(1).max(500),
  author: z.string().min(1).max(160),
  commercial_use: z.enum(['allowed', 'restricted', 'unknown']),
});
export type AssetProvenance = z.infer<typeof AssetProvenanceSchema>;

export const ImageAssetMetadataSchema = z.strictObject({
  ref: IdSchema,
  src: ResourceRefSchema,
  sha256: Sha256Schema,
  mime: z.enum(['image/png', 'image/jpeg']),
  width: z.number().int().positive().max(16_384),
  height: z.number().int().positive().max(16_384),
  focal_point: NormalizedPointSchema.optional(),
  regions: z.array(SemanticRegionSchema).max(32),
  provenance: AssetProvenanceSchema,
});
export type ImageAssetMetadata = z.infer<typeof ImageAssetMetadataSchema>;

export const QualityIssueSchema = z.strictObject({
  code: z.string().regex(/^[a-z][a-z0-9_.]*$/),
  severity: z.enum(['error', 'warning', 'info']),
  path: z.string().min(1),
  node_id: IdSchema.nullable().optional(),
  scene_id: IdSchema.nullable().optional(),
  message: z.string().min(1).max(500),
  context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  suggested_action: z.string().min(1).max(500).nullable().optional(),
  /** @deprecated P1.4 compatibility; new producers use `context`. */
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type QualityIssue = z.infer<typeof QualityIssueSchema>;

export const QualityPreflightReportSchema = z.strictObject({
  schema: z.literal('quality-preflight-report').optional(),
  schema_version: z.literal('0.2.0').optional(),
  status: z.enum(['pass', 'warn', 'fail']),
  issues: z.array(QualityIssueSchema),
  summary: z
    .strictObject({ errors: z.number().int().min(0), warnings: z.number().int().min(0), infos: z.number().int().min(0) })
    .optional(),
  checks: z.strictObject({
    fonts: z.number().int().min(0),
    assets: z.number().int().min(0),
    text_nodes: z.number().int().min(0),
    safe_nodes: z.number().int().min(0),
    contrast_pairs: z.number().int().min(0),
    motion_tracks: z.number().int().min(0).optional(),
    subtitle_segments: z.number().int().min(0).optional(),
    audio_cues: z.number().int().min(0).optional(),
  }),
});
export type QualityPreflightReport = z.infer<typeof QualityPreflightReportSchema>;

export const DeterministicSurfaceSchema = z.strictObject({
  color: HexColorSchema,
  opacity: z.number().min(0).max(1),
});
export type DeterministicSurface = z.infer<typeof DeterministicSurfaceSchema>;
