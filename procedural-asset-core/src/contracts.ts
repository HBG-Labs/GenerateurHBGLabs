import { z } from 'zod';

import { SemVerSchema, Sha256Schema, StableIdSchema } from '@motion-engine/creative-core';
import { RegistryIdSchema, StyleRoleSchema, VisualHierarchySchema, VisualRegionSchema } from '@motion-engine/visual-core';

export const PROCEDURAL_ASSET_PLAN_SCHEMA = 'procedural-asset-plan';
export const PROCEDURAL_ASSET_PLAN_VERSION = '0.1.0';
export const PROCEDURAL_ASSET_GRAMMAR_VERSION = '0.1.0';

export const AssetFamilySchema = z.enum([
  'UI_CARD', 'PANEL', 'APP_SCREEN', 'DASHBOARD', 'DATA_CHART', 'COUNTER',
  'GENERIC_SMARTPHONE_FRAME', 'BROWSER_FRAME', 'GENERIC_PRODUCT_FRAME',
  'PROCESS_DIAGRAM', 'LIGHT_SYSTEM', 'PARTICLE_FIELD', 'ORBIT_SYSTEM',
  'POSTER_FRAME', 'DECORATIVE_SYSTEM',
]);
export const AssetVariantSchema = z.enum([
  'METRIC', 'FEATURE', 'STATUS', 'CHART', 'BAR', 'LINE', 'DONUT', 'PROCESS',
  'PHONE', 'BROWSER', 'PRODUCT', 'ATMOSPHERE', 'ORBIT', 'EDITORIAL', 'GRID',
]);
export const MaterialIdSchema = z.enum([
  'FLAT', 'GRADIENT_LAYERED', 'SOFT_SHADOW', 'BORDERED', 'PAPER_LIKE',
  'GLASS_LIKE_SIMPLIFIED', 'LUMINOUS', 'MATTE',
]);
export const MaterialLanguageSchema = z.enum(['CLEAN_FLAT', 'SOFT_DIMENSIONAL', 'EDITORIAL_PAPER', 'LUMINOUS_TECH']);
export const AssetLanguageSchema = z.enum(['UI', 'DATA', 'VECTOR_ILLUSTRATION', 'EDITORIAL', 'PROCEDURAL_ENVIRONMENT']);
export const AssetSystemIdentitySchema = z.enum(['PRODUCT_POLISHED', 'EDITORIAL_PRECISE', 'EXPLAINER_LUMINOUS']);
export const AssetDensitySchema = z.enum(['COMPACT', 'BALANCED', 'SPACIOUS']);
export const AssetEmphasisSchema = z.enum(['PRIMARY', 'SECONDARY', 'SUPPORTING', 'DECORATIVE']);
export const AssetComplexitySchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export const RenderCostClassSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export const ComponentKindSchema = z.enum(['group', 'shape', 'text', 'path', 'mask']);
export const ComponentStateSchema = z.enum(['COLLAPSED', 'ASSEMBLED', 'FOCUSED', 'EXPANDED', 'DECOMPOSED']);
export const AssetAffordanceSchema = z.enum([
  'ASSEMBLE', 'EXPAND', 'EXTRACT', 'FOCUS', 'COLLAPSE', 'CARRY', 'DRAW',
  'GROW', 'HIGHLIGHT', 'COMPARE', 'EXTRACT_SERIES', 'REASSEMBLE',
]);
export const AssetChoreographySchema = z.enum(['PRODUCT_HERO', 'DATA_HERO', 'EDITORIAL_RECOMPOSE', 'ENVIRONMENT_FOCUS']);
export const IconIdSchema = z.enum(['CHECK', 'SPARK', 'CLOCK', 'TREND', 'GRID', 'ARROW', 'FOCUS', 'BELL']);
export const IconStyleSchema = z.enum(['OUTLINE', 'FILLED']);

const PointSchema = z.strictObject({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) });
const TransformSchema = z.strictObject({
  scale: z.number().finite().min(0.05).max(8),
  rotate_deg: z.number().finite().min(-360).max(360),
  translate_x: z.number().finite().min(-1).max(1),
  translate_y: z.number().finite().min(-1).max(1),
});

export const ProceduralAssetRequestSchema = z.strictObject({
  request_id: StableIdSchema,
  source_asset_intent_id: StableIdSchema,
  direction_plan_id: StableIdSchema,
  scene_id: StableIdSchema,
  family: AssetFamilySchema,
  variant: AssetVariantSchema,
  semantic_role: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  language: AssetLanguageSchema,
  system_identity: AssetSystemIdentitySchema,
  material_language: MaterialLanguageSchema,
  material: MaterialIdSchema,
  density: AssetDensitySchema,
  emphasis: AssetEmphasisSchema,
  choreography: AssetChoreographySchema,
  persistent: z.boolean(),
  seed: z.number().int().min(0).max(2_147_483_647),
  copy: z.strictObject({ title: z.string().min(1).max(80), label: z.string().max(48), value: z.string().max(24) }),
  data: z.array(z.number().finite().min(0).max(1)).max(12),
});
export type ProceduralAssetRequest = z.infer<typeof ProceduralAssetRequestSchema>;

export const ProceduralComponentSchema = z.strictObject({
  id: StableIdSchema,
  parent_id: StableIdSchema.nullable(),
  semantic_role: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  kind: ComponentKindSchema,
  hierarchy: VisualHierarchySchema,
  region: VisualRegionSchema,
  emphasis: AssetEmphasisSchema,
  focusable: z.boolean(),
  decorative: z.boolean(),
  group_key: StableIdSchema.nullable(),
  motion_order: z.number().int().min(0).max(63),
  depth: z.enum(['BACKGROUND', 'MIDGROUND', 'FOREGROUND']),
  style: z.strictObject({ fill: StyleRoleSchema, stroke: StyleRoleSchema, text: StyleRoleSchema }),
  surface: z.strictObject({ opacity: z.number().finite().min(0).max(1), radius: z.enum(['none', 'xs', 'sm', 'md', 'lg', 'xl']), stroke: z.enum(['none', 'hairline', 'emphasis']) }),
  transform: TransformSchema,
  text: z.strictObject({ value: z.string().min(1).max(120), role: z.enum(['DISPLAY', 'HEADLINE', 'SUBHEAD', 'BODY', 'CAPTION', 'DATA']), align: z.enum(['start', 'center', 'end']) }).nullable(),
  shape: z.strictObject({ kind: z.enum(['rect', 'ellipse']) }).nullable(),
  path: z.strictObject({ points: z.array(PointSchema).min(2).max(32), closed: z.boolean() }).nullable(),
  mask: z.strictObject({ shape: z.enum(['rect', 'ellipse']), direction: z.enum(['left_to_right', 'right_to_left', 'top_to_bottom', 'bottom_to_top']) }).nullable(),
  icon_id: IconIdSchema.nullable(),
  affordances: z.array(AssetAffordanceSchema).max(8),
});
export type ProceduralComponent = z.infer<typeof ProceduralComponentSchema>;

export const ProceduralAssetSchema = z.strictObject({
  asset_id: StableIdSchema,
  asset_type: AssetFamilySchema,
  version: SemVerSchema,
  variant: AssetVariantSchema,
  semantic_role: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  language: AssetLanguageSchema,
  system_identity: AssetSystemIdentitySchema,
  material_language: MaterialLanguageSchema,
  material: MaterialIdSchema,
  choreography: AssetChoreographySchema,
  initial_state: ComponentStateSchema,
  persistent: z.boolean(),
  seed: z.number().int().min(0).max(2_147_483_647),
  components: z.array(ProceduralComponentSchema).min(2).max(64),
  capabilities: z.array(RegistryIdSchema).max(16),
  affordances: z.array(AssetAffordanceSchema).max(16),
  complexity: AssetComplexitySchema,
  render_cost: RenderCostClassSchema,
  contribution: z.strictObject({ layers: z.number().int().min(1).max(64), paths: z.number().int().min(0).max(24), masks: z.number().int().min(0).max(8), text_nodes: z.number().int().min(0).max(24), potential_tracks: z.number().int().min(0).max(128), ui_elements: z.number().int().min(0).max(48), icons: z.number().int().min(0).max(32), particles: z.number().int().min(0).max(96) }),
  provenance: z.strictObject({ request_id: StableIdSchema, source_asset_intent_id: StableIdSchema, resolver_version: SemVerSchema, registry_fingerprint: Sha256Schema }),
});
export type ProceduralAsset = z.infer<typeof ProceduralAssetSchema>;

export const ProceduralAssetPlanSchema = z.strictObject({
  schema: z.literal(PROCEDURAL_ASSET_PLAN_SCHEMA),
  schema_version: z.literal(PROCEDURAL_ASSET_PLAN_VERSION),
  plan_id: StableIdSchema,
  direction_plan_id: StableIdSchema,
  scene_id: StableIdSchema,
  grammar_version: z.literal(PROCEDURAL_ASSET_GRAMMAR_VERSION),
  registry_fingerprints: z.strictObject({ assets: Sha256Schema, materials: Sha256Schema, icons: Sha256Schema, affordances: Sha256Schema, choreographies: Sha256Schema }),
  assets: z.array(ProceduralAssetSchema).min(1).max(6),
});
export type ProceduralAssetPlan = z.infer<typeof ProceduralAssetPlanSchema>;

export const AssetDiagnosticSchema = z.strictObject({
  code: z.string().regex(/^[a-z][a-z0-9_.]*$/),
  severity: z.enum(['error', 'warning', 'info']),
  path: z.string().min(1),
  scene_id: StableIdSchema.nullable(),
  asset_id: StableIdSchema.nullable(),
  component_id: StableIdSchema.nullable(),
  context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  suggested_action: z.string().min(1).max(400),
});
export type AssetDiagnostic = z.infer<typeof AssetDiagnosticSchema>;

export const ProceduralAssetPreflightReportSchema = z.strictObject({
  schema: z.literal('procedural-asset-preflight-report'),
  schema_version: z.literal('0.1.0'),
  status: z.enum(['pass', 'warn', 'fail']),
  eligible_for_compilation: z.boolean(),
  procedural_asset_plan_sha256: Sha256Schema.nullable(),
  diagnostics: z.array(AssetDiagnosticSchema).max(512),
  summary: z.strictObject({ errors: z.number().int().nonnegative(), warnings: z.number().int().nonnegative(), infos: z.number().int().nonnegative() }),
  checks: z.strictObject({ schema: z.boolean(), registry: z.boolean(), hierarchy: z.boolean(), limits: z.boolean(), materials: z.boolean(), references: z.boolean(), affordances: z.boolean(), depth: z.boolean(), security: z.boolean() }),
});
export type ProceduralAssetPreflightReport = z.infer<typeof ProceduralAssetPreflightReportSchema>;

export const AssetDiversityReportSchema = z.strictObject({
  schema: z.literal('asset-diversity-report'), schema_version: z.literal('0.1.0'),
  plan_ids: z.array(StableIdSchema).min(1).max(64),
  families: z.array(AssetFamilySchema), materials: z.array(MaterialIdSchema), languages: z.array(AssetLanguageSchema),
  component_count: z.number().int().nonnegative(), focusable_count: z.number().int().nonnegative(), icon_count: z.number().int().nonnegative(), data_system_count: z.number().int().nonnegative(), environment_system_count: z.number().int().nonnegative(),
  repetitions: z.array(z.strictObject({ family: AssetFamilySchema, count: z.number().int().min(2) })),
});
export type AssetDiversityReport = z.infer<typeof AssetDiversityReportSchema>;
