import { z } from 'zod';

import { SemVerSchema, Sha256Schema, StableIdSchema } from '@motion-engine/creative-core';
import { LayoutStrategySchema, MotionIntensitySchema, RegistryIdSchema, VisualComplexitySchema } from '@motion-engine/visual-core';

export const VISUAL_DIRECTION_PLAN_SCHEMA = 'visual-direction-plan';
export const VISUAL_DIRECTION_PLAN_VERSION = '0.1.0';
export const VISUAL_DIRECTOR_CONTRACT_VERSION = '0.1.0';

export const VisualRoleSchema = z.enum(['HOOK', 'SETUP', 'EXPLAIN', 'ESCALATE', 'CONTRAST', 'REVEAL', 'BREATH', 'PROOF', 'PAYOFF', 'CTA']);
export const VisualSemanticRoleSchema = z.enum(['PHENOMENON', 'DIAGRAM', 'PRODUCT', 'UI', 'TYPOGRAPHIC_STATEMENT', 'COMPARISON', 'ENVIRONMENT', 'DATA', 'PAYOFF']);
export const VisualFocusTypeSchema = z.enum(['TYPE', 'SUBJECT', 'PRODUCT', 'UI', 'DATA', 'DIAGRAM', 'PHENOMENON', 'IMAGE', 'OBJECT']);
export const DirectionReasonSchema = z.enum(['SEMANTIC_CONTINUITY', 'SEMANTIC_CLARITY', 'HIERARCHY', 'PAYOFF', 'CONTRAST', 'MOTIF', 'PACING', 'PRODUCT_FOCUS', 'VISUAL_BREATH', 'INTENTIONAL_CUT']);
export const MotifCategorySchema = z.enum(['LINE', 'CIRCLE_ORBIT', 'FRAME', 'GRID', 'LIGHT_RAY', 'CARD', 'RIBBON', 'REPEATED_SHAPE']);
export const MotifStateSchema = z.enum(['INTRODUCE', 'EVOLVE', 'CARRY', 'RESOLVE', 'ABSENT']);
export const PacingSchema = z.enum(['DELIBERATE', 'BALANCED', 'BRISK', 'PUNCHY']);
export const ContinuityStrategySchema = z.enum(['SEMANTIC', 'MOTIF_DRIVEN', 'OBJECT_DRIVEN', 'CAMERA_DRIVEN', 'CUT_DRIVEN']);
export const CameraStrategySchema = z.enum(['MOSTLY_STATIC', 'PROGRESSIVE_PUSH', 'FOLLOW_MOTIF', 'ALTERNATING_STATIC_DYNAMIC', 'SPATIAL_EXPLORATION']);
export const DepthStrategySchema = z.enum(['FLAT_EDITORIAL', 'LAYERED_2_5D', 'PROGRESSIVE_DEPTH', 'MIXED']);
export const NegativeSpaceSchema = z.enum(['GENEROUS', 'BALANCED', 'DENSE_CONTROLLED']);
export const RestraintSchema = z.enum(['HIGH', 'BALANCED', 'LOW']);
export const ScaleHierarchySchema = z.enum(['RESTRAINED', 'CONTRASTED', 'EXTREME']);
export const VisualDensitySchema = z.enum(['SPARSE', 'BALANCED', 'DENSE']);
export const DepthIntentSchema = z.enum(['FLAT', 'SUBTLE', 'LAYERED', 'FOREGROUND_OCCLUSION']);
export const EntryExitStrategySchema = z.enum(['STATIC', 'REVEAL', 'IMPACT', 'CARRY', 'MASK', 'CAMERA', 'INTENTIONAL_CUT']);
export const BridgeMotivationSchema = z.enum(['SEMANTIC_CONTINUITY', 'MOTIF_CONTINUITY', 'OBJECT_CONTINUITY', 'CAMERA_MOMENTUM', 'TYPOGRAPHY_CONTINUITY', 'INTENTIONAL_CONTRAST']);
export const AssetIntentTypeSchema = z.enum(['PROCEDURAL_VECTOR', 'UI_SURFACE', 'ILLUSTRATION', 'IMAGE', 'SUBJECT_CUTOUT', 'PRODUCT', 'TEXTURE', 'THREE_D_OBJECT']);
export const AssetRoleSchema = z.enum(['HERO', 'SUPPORT', 'BACKGROUND', 'FOREGROUND', 'DEVICE_FRAME', 'APP_SCREEN', 'UI_CARD', 'CHART', 'COUNTER', 'FEATURE_CALLOUT', 'CTA_SURFACE']);
export const MaterialIntentSchema = z.enum(['FLAT', 'GRADIENT', 'TEXTURED', 'PAPER', 'GLASS_LIKE', 'METALLIC_LIKE', 'LUMINOUS']);
export const AssetAvailabilitySchema = z.enum(['AVAILABLE', 'FUTURE_REQUIREMENT']);
export const RenderCostClassSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export const CapabilitySupportSchema = z.enum(['SUPPORTED', 'PARTIAL', 'SIMPLIFIED', 'FUTURE', 'UNSUPPORTED']);

export const DirectorRegistryFingerprintsSchema = z.strictObject({
  contract: Sha256Schema,
  sequence_strategies: Sha256Schema,
  motion_identities: Sha256Schema,
  technique_compositions: Sha256Schema,
});

export const IntensityPointSchema = z.strictObject({
  scene_id: StableIdSchema,
  intensity: MotionIntensitySchema,
});

export const AssetIntentSchema = z.strictObject({
  id: StableIdSchema,
  type: AssetIntentTypeSchema,
  role: AssetRoleSchema,
  material: MaterialIntentSchema,
  availability: AssetAvailabilitySchema,
  reason: DirectionReasonSchema,
});

export const SceneDirectionSchema = z.strictObject({
  id: StableIdSchema,
  scene_id: StableIdSchema,
  visual_role: VisualRoleSchema,
  semantic_role: VisualSemanticRoleSchema,
  focus: VisualFocusTypeSchema,
  layout_id: LayoutStrategySchema.optional(),
  technique_composition_id: RegistryIdSchema,
  technique_composition_version: SemVerSchema,
  pattern_ids: z.array(RegistryIdSchema).max(4),
  phrase_ids: z.array(RegistryIdSchema).max(4),
  camera_mode: z.enum(['INHERIT', 'STATIC', 'SELECT']),
  camera_id: RegistryIdSchema.nullable(),
  depth_intent: DepthIntentSchema,
  entry_strategy: EntryExitStrategySchema,
  exit_strategy: EntryExitStrategySchema,
  asset_intents: z.array(AssetIntentSchema).max(6),
  motif_state: MotifStateSchema,
  motion_intensity: MotionIntensitySchema,
  complexity: VisualComplexitySchema,
  visual_density: VisualDensitySchema,
  reason: DirectionReasonSchema,
});

export const DirectionBridgeSchema = z.strictObject({
  id: StableIdSchema,
  source_scene_id: StableIdSchema,
  destination_scene_id: StableIdSchema,
  bridge_id: RegistryIdSchema,
  bridge_version: SemVerSchema,
  motivation: BridgeMotivationSchema,
  persistent_entity_key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/).nullable(),
  camera_continuity: z.boolean(),
  reason: DirectionReasonSchema,
});

export const VisualDirectionPlanSchema = z.strictObject({
  schema: z.literal(VISUAL_DIRECTION_PLAN_SCHEMA),
  schema_version: z.literal(VISUAL_DIRECTION_PLAN_VERSION),
  direction_plan_id: StableIdSchema,
  source: z.strictObject({
    creative_plan_id: StableIdSchema,
    creative_plan_sha256: Sha256Schema,
    creative_scene_ids: z.array(StableIdSchema).min(1).max(16),
    director_context_sha256: Sha256Schema,
    registry_fingerprints: DirectorRegistryFingerprintsSchema,
  }),
  style_id: StableIdSchema,
  sequence_strategy: z.strictObject({ id: RegistryIdSchema, version: SemVerSchema }),
  motion_identity: z.strictObject({ id: RegistryIdSchema, version: SemVerSchema }),
  art_direction: z.strictObject({
    hierarchy: z.enum(['CLEAR', 'DRAMATIC', 'EDITORIAL']),
    scale_hierarchy: ScaleHierarchySchema,
    negative_space: NegativeSpaceSchema,
    visual_density: VisualDensitySchema,
    material_intent: MaterialIntentSchema,
    asset_coherence: z.enum(['COHERENT', 'MIXED_INTENTIONAL']),
  }),
  motif: z.strictObject({ id: StableIdSchema, category: MotifCategorySchema, lifecycle_required: z.boolean() }),
  global_pacing: PacingSchema,
  global_intensity_arc: z.array(IntensityPointSchema).min(1).max(16),
  continuity_strategy: ContinuityStrategySchema,
  camera_strategy: CameraStrategySchema,
  depth_strategy: DepthStrategySchema,
  restraint_level: RestraintSchema,
  budget: z.strictObject({ complexity: VisualComplexitySchema, render_cost: RenderCostClassSchema, external_assets_allowed: z.boolean() }),
  scenes: z.array(SceneDirectionSchema).min(1).max(16),
  bridges: z.array(DirectionBridgeSchema).max(15),
});
export type VisualDirectionPlan = z.infer<typeof VisualDirectionPlanSchema>;
export type SceneDirection = z.infer<typeof SceneDirectionSchema>;

export const VisualDirectorContextSchema = z.strictObject({
  schema: z.literal('visual-director-context'),
  schema_version: z.literal('0.1.0'),
  creative_plan_id: StableIdSchema,
  creative_plan_sha256: Sha256Schema,
  scene_ids: z.array(StableIdSchema).min(1).max(16),
  narrative_archetype: z.enum(['EXPLAINER', 'PRODUCT_DEMO', 'PROBLEM_SOLUTION', 'EDITORIAL']),
  canvas: z.enum(['9:16', '1:1', '4:5', '16:9']),
  style_id: StableIdSchema,
  capabilities: z.record(RegistryIdSchema, CapabilitySupportSchema),
  available_asset_types: z.array(AssetIntentTypeSchema).max(8),
  supported_materials: z.array(MaterialIntentSchema).max(7),
  registry_fingerprints: DirectorRegistryFingerprintsSchema,
  limits: z.strictObject({
    max_scenes: z.number().int().min(1).max(16),
    max_technique_compositions_per_scene: z.number().int().min(1).max(4),
    max_patterns_per_scene: z.number().int().min(0).max(8),
    max_asset_intents_per_scene: z.number().int().min(0).max(8),
    max_bridges: z.number().int().min(0).max(16),
    max_high_complexity_scenes: z.number().int().min(0).max(16),
  }),
});
export type VisualDirectorContext = z.infer<typeof VisualDirectorContextSchema>;

export const DirectorDiagnosticSchema = z.strictObject({
  code: z.string().regex(/^[a-z][a-z0-9_.]*$/),
  severity: z.enum(['error', 'warning', 'info']),
  path: z.string().min(1),
  target_id: StableIdSchema.nullable(),
  scene_id: StableIdSchema.nullable(),
  selected_concept: z.string().max(96).nullable(),
  context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  suggested_action: z.string().min(1).max(400),
});
export type DirectorDiagnostic = z.infer<typeof DirectorDiagnosticSchema>;

export const VisualDirectionPreflightReportSchema = z.strictObject({
  schema: z.literal('visual-direction-preflight-report'),
  schema_version: z.literal('0.1.0'),
  status: z.enum(['pass', 'warn', 'fail']),
  eligible_for_resolution: z.boolean(),
  direction_plan_sha256: Sha256Schema.nullable(),
  diagnostics: z.array(DirectorDiagnosticSchema).max(512),
  summary: z.strictObject({ errors: z.number().int().nonnegative(), warnings: z.number().int().nonnegative(), infos: z.number().int().nonnegative() }),
  checks: z.strictObject({ schema: z.boolean(), registries: z.boolean(), capabilities: z.boolean(), scene_compatibility: z.boolean(), sequence_coherence: z.boolean(), complexity: z.boolean(), asset_availability: z.boolean(), visual_plan_feasibility: z.boolean() }),
});
export type VisualDirectionPreflightReport = z.infer<typeof VisualDirectionPreflightReportSchema>;

export const DecisionTraceEntrySchema = z.strictObject({
  decision_id: StableIdSchema,
  scope: z.enum(['GLOBAL', 'SCENE', 'BRIDGE']),
  target_id: StableIdSchema,
  source: z.enum(['SEQUENCE_STRATEGY', 'MOTION_IDENTITY', 'TECHNIQUE_COMPOSITION', 'EXPLICIT_SCENE_DIRECTION', 'ENGINE_CONSTRAINT']),
  selected: z.string().min(1).max(96),
  reason: DirectionReasonSchema,
  resolved_output_ids: z.array(StableIdSchema).max(24),
  override: z.boolean(),
});
export const VisualDecisionTraceSchema = z.strictObject({
  schema: z.literal('visual-decision-trace'), schema_version: z.literal('0.1.0'), direction_plan_id: StableIdSchema,
  precedence: z.tuple([z.literal('ENGINE_CONSTRAINT'), z.literal('EXPLICIT_SCENE_DIRECTION'), z.literal('TECHNIQUE_COMPOSITION'), z.literal('MOTION_IDENTITY'), z.literal('SEQUENCE_STRATEGY')]),
  entries: z.array(DecisionTraceEntrySchema).max(512),
});
export type VisualDecisionTrace = z.infer<typeof VisualDecisionTraceSchema>;

export const SequenceCoherenceReportSchema = z.strictObject({
  schema: z.literal('sequence-coherence-report'), schema_version: z.literal('0.1.0'), direction_plan_id: StableIdSchema,
  motif_continuity: z.enum(['coherent', 'broken', 'not_required']),
  pacing_variety: z.enum(['varied', 'flat']),
  layout_variety: z.enum(['varied', 'repetitive']),
  bridge_variety: z.enum(['varied', 'repetitive', 'none']),
  focus_progression: z.enum(['progressive', 'repetitive']),
  intensity_progression: z.enum(['progressive', 'flat']),
  camera_coherence: z.enum(['coherent', 'incoherent', 'static']),
  asset_coherence: z.enum(['coherent', 'mixed_intentionally', 'inconsistent']),
  observations: z.array(z.string().min(1).max(240)).max(32),
});
export type SequenceCoherenceReport = z.infer<typeof SequenceCoherenceReportSchema>;
