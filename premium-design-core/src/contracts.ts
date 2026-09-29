import { z } from "zod";

import {
  SemVerSchema,
  Sha256Schema,
  StableIdSchema,
} from "@motion-engine/creative-core";

export const PREMIUM_DESIGN_PLAN_VERSION = "0.1.0";
export const PREMIUM_DESIGN_SYSTEM_VERSION = "0.1.0";

export const DesignRecipeIdSchema = z.enum([
  "CLEAN_PRODUCT",
  "EDITORIAL_CONTRAST",
  "DATA_FOCUSED",
  "SPATIAL_TECH",
]);
export const DesignDensitySchema = z.enum(["RESTRAINED", "BALANCED", "RICH"]);
export const DesignHierarchySchema = z.enum(["CLEAR", "DRAMATIC", "EDITORIAL"]);
export const SurfaceLevelSchema = z.enum([
  "BACKGROUND",
  "SURFACE_1",
  "SURFACE_2",
  "FLOATING",
  "FOCAL",
]);
export const PremiumMaterialIdSchema = z.enum([
  "MATTE_DEPTH",
  "LAYERED_GRADIENT_SIMPLIFIED",
  "SOFT_ELEVATION",
  "GLASS_EDGE_SIMPLIFIED",
  "ACCENT_FIELD",
]);
export const PremiumIconIdSchema = z.enum([
  "HOME",
  "GRID",
  "TASK",
  "CALENDAR",
  "CLOCK",
  "SEARCH",
  "BELL",
  "USER",
  "TEAM",
  "MESSAGE",
  "DOCUMENT",
  "FOLDER",
  "CHECK",
  "ARROW",
  "TREND",
  "CHART",
  "TARGET",
  "SPARK",
  "PIN",
  "FILTER",
]);
export type PremiumIconId = z.infer<typeof PremiumIconIdSchema>;

const TokenScaleSchema = z.strictObject({
  xs: z.number().finite().positive(),
  sm: z.number().finite().positive(),
  md: z.number().finite().positive(),
  lg: z.number().finite().positive(),
  xl: z.number().finite().positive(),
});
export const ResolvedDesignTokensSchema = z.strictObject({
  spacing: TokenScaleSchema,
  radius: TokenScaleSchema,
  border: z.strictObject({
    hairline: z.number().finite().min(0.5).max(4),
    emphasis: z.number().finite().min(1).max(8),
  }),
  elevation: z.strictObject({
    flat: z.number().finite().min(0).max(1),
    raised: z.number().finite().min(0).max(1),
    floating: z.number().finite().min(0).max(1),
  }),
  typography: z.strictObject({
    display_ratio: z.number().finite().min(1).max(5),
    body_ratio: z.number().finite().min(0.4).max(2),
    metadata_ratio: z.number().finite().min(0.2).max(1),
  }),
  icon: z.strictObject({
    sm: z.number().finite().min(0.04).max(0.3),
    md: z.number().finite().min(0.05).max(0.4),
    lg: z.number().finite().min(0.08).max(0.5),
  }),
  data: z.strictObject({
    grid_opacity: z.number().finite().min(0).max(0.5),
    primary_weight: z.number().finite().min(1).max(8),
    secondary_weight: z.number().finite().min(0.5).max(5),
  }),
  detail: z.strictObject({
    maximum_per_asset: z.number().int().min(0).max(24),
    opacity: z.number().finite().min(0).max(1),
  }),
});
export type ResolvedDesignTokens = z.infer<typeof ResolvedDesignTokensSchema>;

export const PremiumDesignSelectionSchema = z.strictObject({
  selection_id: StableIdSchema,
  recipe: z.strictObject({ id: DesignRecipeIdSchema, version: SemVerSchema }),
  density: DesignDensitySchema,
  hierarchy: DesignHierarchySchema,
  canvas: z.enum(["9:16", "1:1", "4:5", "16:9"]),
  style_id: StableIdSchema,
});
export type PremiumDesignSelection = z.infer<
  typeof PremiumDesignSelectionSchema
>;

export const DesignDecisionSchema = z.strictObject({
  id: StableIdSchema,
  asset_id: StableIdSchema,
  component_id: StableIdSchema.nullable(),
  category: z.enum([
    "SPACING",
    "PROPORTION",
    "HIERARCHY",
    "SURFACE",
    "MATERIAL",
    "ICON",
    "CHART",
    "DETAIL",
    "COMPOSITION",
  ]),
  token: z.string().regex(/^[a-z][a-z0-9_.]{0,63}$/),
  resolved: z.union([z.string().max(96), z.number().finite(), z.boolean()]),
  reason: z.enum([
    "HIERARCHY",
    "GROUPING",
    "READABILITY",
    "FOCUS",
    "CONSISTENCY",
    "NEGATIVE_SPACE",
    "RESTRAINT",
    "DATA_STORY",
  ]),
});
export type DesignDecision = z.infer<typeof DesignDecisionSchema>;

export const PremiumDesignPlanSchema = z.strictObject({
  schema: z.literal("premium-design-plan"),
  schema_version: z.literal(PREMIUM_DESIGN_PLAN_VERSION),
  design_system_version: z.literal(PREMIUM_DESIGN_SYSTEM_VERSION),
  design_plan_id: StableIdSchema,
  source: z.strictObject({
    direction_plan_id: StableIdSchema,
    procedural_asset_plan_id: StableIdSchema,
    procedural_asset_plan_sha256: Sha256Schema,
    asset_request_sha256: Sha256Schema,
  }),
  selection: PremiumDesignSelectionSchema,
  registry_fingerprints: z.strictObject({
    system: Sha256Schema,
    recipes: Sha256Schema,
    materials: Sha256Schema,
    icons: Sha256Schema,
    charts: Sha256Schema,
  }),
  tokens: ResolvedDesignTokensSchema,
  decisions: z.array(DesignDecisionSchema).min(1).max(512),
  designed_asset_plan_sha256: Sha256Schema,
});
export type PremiumDesignPlan = z.infer<typeof PremiumDesignPlanSchema>;

export const DesignDiagnosticSchema = z.strictObject({
  code: z.string().regex(/^[a-z][a-z0-9_.]*$/),
  severity: z.enum(["error", "warning", "info"]),
  path: z.string().min(1),
  asset_id: StableIdSchema.nullable(),
  component_id: StableIdSchema.nullable(),
  property: z.string().min(1).max(80),
  expected_constraint: z.string().min(1).max(200),
  actual_state: z.string().min(1).max(200),
  suggested_correction_class: z.enum([
    "SPACING",
    "HIERARCHY",
    "TYPOGRAPHY",
    "SURFACE",
    "ICONOGRAPHY",
    "CHART",
    "COMPOSITION",
    "SECURITY",
    "LIMIT",
  ]),
});
export type DesignDiagnostic = z.infer<typeof DesignDiagnosticSchema>;

export const PremiumDesignPreflightReportSchema = z.strictObject({
  schema: z.literal("premium-design-preflight-report"),
  schema_version: z.literal("0.1.0"),
  status: z.enum(["pass", "warn", "fail"]),
  eligible_for_render: z.boolean(),
  premium_design_plan_sha256: Sha256Schema.nullable(),
  diagnostics: z.array(DesignDiagnosticSchema).max(512),
  summary: z.strictObject({
    errors: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
    infos: z.number().int().nonnegative(),
  }),
  checks: z.strictObject({
    schema: z.boolean(),
    registry: z.boolean(),
    spacing: z.boolean(),
    hierarchy: z.boolean(),
    typography: z.boolean(),
    surfaces: z.boolean(),
    iconography: z.boolean(),
    charts: z.boolean(),
    composition: z.boolean(),
    limits: z.boolean(),
    security: z.boolean(),
  }),
});
export type PremiumDesignPreflightReport = z.infer<
  typeof PremiumDesignPreflightReportSchema
>;

export const DesignDecisionTraceSchema = z.strictObject({
  schema: z.literal("design-decision-trace"),
  schema_version: z.literal("0.1.0"),
  design_plan_id: StableIdSchema,
  precedence: z.tuple([
    z.literal("ENGINE_LIMIT"),
    z.literal("DESIGN_RECIPE"),
    z.literal("ASSET_FAMILY"),
    z.literal("DENSITY"),
    z.literal("COMPONENT_ROLE"),
  ]),
  entries: z.array(DesignDecisionSchema).max(512),
});
export type DesignDecisionTrace = z.infer<typeof DesignDecisionTraceSchema>;
