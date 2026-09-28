import { z } from 'zod';

import { Sha256Schema, StableIdSchema } from './common.ts';

export const CreativeDiagnosticSchema = z.strictObject({
  code: z.string().regex(/^[a-z][a-z0-9_.]*$/),
  severity: z.enum(['error', 'warning', 'info']),
  path: z.string().min(1),
  node_id: StableIdSchema.nullable().optional(),
  scene_id: StableIdSchema.nullable().optional(),
  message: z.string().min(1).max(500),
  context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  suggested_action: z.string().min(1).max(500).nullable().optional(),
});
export type CreativeDiagnostic = z.infer<typeof CreativeDiagnosticSchema>;

export const CreativePreflightReportSchema = z.strictObject({
  schema: z.literal('creative-preflight-report'),
  schema_version: z.literal('0.1.0'),
  status: z.enum(['pass', 'warn', 'fail']),
  eligible_for_compilation: z.boolean(),
  creative_plan_sha256: Sha256Schema.nullable(),
  diagnostics: z.array(CreativeDiagnosticSchema),
  summary: z.strictObject({
    errors: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
    infos: z.number().int().nonnegative(),
  }),
  checks: z.strictObject({
    scenes: z.number().int().nonnegative(),
    structural_ids: z.number().int().nonnegative(),
    content_items: z.number().int().nonnegative(),
    asset_intents: z.number().int().nonnegative(),
    references: z.number().int().nonnegative(),
  }),
});
export type CreativePreflightReport = z.infer<typeof CreativePreflightReportSchema>;
