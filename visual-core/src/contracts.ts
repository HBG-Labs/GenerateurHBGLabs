import { z } from 'zod';

import {
  SemVerSchema,
  Sha256Schema,
  StableIdSchema,
} from '@motion-engine/creative-core';

export const VISUAL_PLAN_SCHEMA = 'visual-plan';
export const VISUAL_PLAN_VERSION = '0.1.0';
export const VISUAL_GRAMMAR_VERSION = '0.1.0';
export const P32_VISUAL_PLAN_VERSION = '0.2.0';
export const P32_VISUAL_GRAMMAR_VERSION = '0.2.0';
export const P335_VISUAL_PLAN_VERSION = '0.3.0';
export const P335_VISUAL_GRAMMAR_VERSION = '0.3.0';

export const RegistryIdSchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/);
export const VisualCapabilitySchema = z.enum([
  'TEXT', 'SHAPE', 'IMAGE', 'PATH', 'MASK', 'GROUP', 'TRANSFORM', 'OPACITY',
  'CLIP', 'PATH_PROGRESS', 'COLOR', 'VARIABLE_FONT', 'CUT',
  'DYNAMIC_TYPOGRAPHY',
  'FUTURE_ARBITRARY_MORPH', 'FUTURE_PATH_FOLLOW', 'FUTURE_TRUE_3D',
  'FUTURE_VARIABLE_FONT_ANIMATION', 'FUTURE_CROSS_SCENE_COMPOSITOR',
]);
export type VisualCapability = z.infer<typeof VisualCapabilitySchema>;

export const VisualEntityKindSchema = z.enum(['text', 'shape', 'path', 'mask', 'group', 'image']);
export type VisualEntityKind = z.infer<typeof VisualEntityKindSchema>;
export const VisualHierarchySchema = z.enum(['HERO', 'PRIMARY', 'SECONDARY', 'SUPPORT', 'DECORATIVE', 'BACKGROUND']);
export const LayoutStrategySchema = z.enum([
  'CENTER_HERO', 'ASYMMETRIC_HERO', 'EDITORIAL_SPLIT', 'FULL_BLEED', 'LAYERED_POSTER',
  'RADIAL_FOCUS', 'DIAGONAL_FLOW', 'GRID_STAGGER', 'DEPTH_STACK', 'FRAME_WITHIN_FRAME',
]);
export const VisualComplexitySchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export const MotionIntensitySchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export const InformationDensitySchema = z.enum(['SPARSE', 'BALANCED', 'DENSE']);
export const VisualPhaseSchema = z.enum(['ENTER', 'ACCENT', 'SETTLE', 'HOLD', 'EXIT']);
export const VisualRegionSchema = z.enum([
  'full', 'top', 'upper', 'center', 'lower', 'bottom', 'left', 'right', 'foreground', 'background',
]);
export const StyleRoleSchema = z.enum(['background', 'foreground', 'accent', 'muted', 'inverse']);
export const VisualSurfaceSchema = z.strictObject({
  opacity: z.number().finite().min(0).max(1),
  radius: z.enum(['none', 'xs', 'sm', 'md', 'lg', 'xl']),
  stroke: z.enum(['none', 'hairline', 'emphasis']),
});
export const VisualComponentReferenceSchema = z.strictObject({
  asset_id: StableIdSchema,
  component_id: StableIdSchema,
  emphasis: z.enum(['PRIMARY', 'SECONDARY', 'SUPPORTING', 'DECORATIVE']),
  focusable: z.boolean(),
  motion_order: z.number().int().min(0).max(63),
  group_key: StableIdSchema.nullable(),
  affordances: z.array(z.enum([
    'ASSEMBLE', 'EXPAND', 'EXTRACT', 'FOCUS', 'COLLAPSE', 'CARRY',
    'DRAW', 'GROW', 'HIGHLIGHT', 'COMPARE', 'EXTRACT_SERIES', 'REASSEMBLE',
  ])).max(8),
});

const NormalizedPointSchema = z.strictObject({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
});

export const VisualEntitySchema = z.strictObject({
  id: StableIdSchema,
  visual_entity_id: StableIdSchema.nullable(),
  kind: VisualEntityKindSchema,
  semantic_role: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  hierarchy: VisualHierarchySchema,
  region: VisualRegionSchema,
  parent_id: StableIdSchema.nullable(),
  persistent: z.boolean(),
  safe: z.boolean(),
  text: z.strictObject({
    value: z.string().min(1).max(240),
    role: z.enum(['DISPLAY', 'HEADLINE', 'SUBHEAD', 'BODY', 'CAPTION', 'DATA', 'DECORATIVE_TYPE']),
    accent_words: z.array(z.string().min(1).max(32)).max(8),
    align: z.enum(['start', 'center', 'end']),
  }).nullable(),
  shape: z.strictObject({ kind: z.enum(['rect', 'ellipse']) }).nullable(),
  path: z.strictObject({ points: z.array(NormalizedPointSchema).min(2).max(64), closed: z.boolean() }).nullable(),
  mask: z.strictObject({
    shape: z.enum(['rect', 'ellipse']),
    direction: z.enum(['left_to_right', 'right_to_left', 'top_to_bottom', 'bottom_to_top']),
  }).nullable(),
  asset_ref: StableIdSchema.nullable(),
  style: z.strictObject({ fill: StyleRoleSchema, stroke: StyleRoleSchema, text: StyleRoleSchema }),
  surface: VisualSurfaceSchema.optional(),
  component_ref: VisualComponentReferenceSchema.optional(),
  transform: z.strictObject({
    scale: z.number().finite().min(0.05).max(8),
    rotate_deg: z.number().finite().min(-360).max(360),
    translate_x: z.number().finite().min(-1).max(1),
    translate_y: z.number().finite().min(-1).max(1),
  }),
});
export type VisualEntity = z.infer<typeof VisualEntitySchema>;

export const SpatialRelationSchema = z.strictObject({
  id: StableIdSchema,
  subject: StableIdSchema,
  relation: z.enum([
    'above', 'below', 'left_of', 'right_of', 'behind', 'in_front_of', 'inside', 'around',
    'aligned_with', 'centered_on', 'follows', 'overlaps', 'masks',
  ]),
  object: StableIdSchema,
});
export type SpatialRelation = z.infer<typeof SpatialRelationSchema>;

const ParameterValueSchema = z.union([z.string().max(80), z.number().finite(), z.boolean()]);
export const PatternInstanceSchema = z.strictObject({
  id: StableIdSchema,
  pattern_id: RegistryIdSchema,
  version: SemVerSchema,
  target_ids: z.array(StableIdSchema).min(1).max(12),
  parameters: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,47}$/), ParameterValueSchema),
});
export type PatternInstance = z.infer<typeof PatternInstanceSchema>;

export const MotionPhraseInstanceSchema = z.strictObject({
  id: StableIdSchema,
  phrase_id: RegistryIdSchema,
  version: SemVerSchema,
  target_ids: z.array(StableIdSchema).min(1).max(12),
  intensity: MotionIntensitySchema,
  direction: z.enum(['up', 'down', 'left', 'right', 'radial', 'none']),
});
export type MotionPhraseInstance = z.infer<typeof MotionPhraseInstanceSchema>;

export const CameraMoveSchema = z.strictObject({
  id: StableIdSchema,
  camera_id: RegistryIdSchema,
  version: SemVerSchema,
  target_id: StableIdSchema,
  intensity: z.number().finite().min(0).max(1),
  phase: VisualPhaseSchema,
});
export type CameraMove = z.infer<typeof CameraMoveSchema>;

export const ContinuityAnchorSchema = z.strictObject({
  id: StableIdSchema,
  entity_id: StableIdSchema,
  visual_entity_id: StableIdSchema,
  property: z.enum(['position', 'scale', 'shape', 'mask', 'color', 'path', 'type']),
  visible_ms: z.number().int().min(100).max(10_000),
});
export type ContinuityAnchor = z.infer<typeof ContinuityAnchorSchema>;

export const ChoreographyEventSchema = z.strictObject({
  id: StableIdSchema,
  phase: VisualPhaseSchema,
  target_id: StableIdSchema,
  action_id: RegistryIdSchema,
  trigger: z.strictObject({
    relation: z.enum(['at_phase_start', 'after', 'with']),
    event_id: StableIdSchema.nullable(),
  }),
});
export type ChoreographyEvent = z.infer<typeof ChoreographyEventSchema>;

export const DepthLayerSchema = z.strictObject({
  entity_id: StableIdSchema,
  plane: z.enum(['BACKGROUND', 'MIDGROUND', 'FOREGROUND']),
  parallax_factor: z.number().finite().min(0).max(2),
  occludes: z.array(StableIdSchema).max(12),
});
export type DepthLayer = z.infer<typeof DepthLayerSchema>;

export const MorphStepSchema = z.strictObject({
  id: StableIdSchema,
  representation: z.enum(['dot', 'line', 'path', 'ellipse', 'rect', 'frame', 'mask', 'color_field', 'type', 'portal']),
  phase: VisualPhaseSchema,
  scale: z.number().finite().min(0.05).max(8),
});

export const MorphChainSchema = z.strictObject({
  id: StableIdSchema,
  entity_id: StableIdSchema,
  kind: z.enum(['parametric', 'semantic']),
  steps: z.array(MorphStepSchema).min(2).max(8),
});
export type MorphChain = z.infer<typeof MorphChainSchema>;

export const MotionEventSchema = z.strictObject({
  id: StableIdSchema,
  target_id: StableIdSchema,
  phase: VisualPhaseSchema,
  energy: z.enum(['left_to_right', 'right_to_left', 'inward', 'outward', 'upward', 'downward', 'rotational', 'radial', 'still']),
  sync_anchor: z.enum(['IMPACT', 'REVEAL', 'BRIDGE_CROSS', 'PAYOFF']).nullable(),
});
export type MotionEvent = z.infer<typeof MotionEventSchema>;

export const CausalRelationSchema = z.strictObject({
  id: StableIdSchema,
  source_event_id: StableIdSchema,
  destination_event_id: StableIdSchema,
  relation: z.enum(['TRIGGERS', 'FOLLOWS', 'OVERLAPS', 'PREPARES', 'REVEALS']),
});
export type CausalRelation = z.infer<typeof CausalRelationSchema>;

export const LayoutTransitionSchema = z.strictObject({
  id: StableIdSchema,
  from: LayoutStrategySchema,
  to: LayoutStrategySchema,
  phase: VisualPhaseSchema,
  target_ids: z.array(StableIdSchema).min(1).max(12),
});
export type LayoutTransition = z.infer<typeof LayoutTransitionSchema>;

export const EffectInstanceSchema = z.strictObject({
  id: StableIdSchema,
  effect_id: z.enum(['CONTROLLED_BLUR', 'SOFT_GLOW', 'LIGHT_SWEEP', 'GRADIENT_MOTION']),
  target_id: StableIdSchema,
  intensity: z.number().finite().min(0).max(1),
  render_cost: z.enum(['LOW', 'MEDIUM', 'HIGH']),
});
export type EffectInstance = z.infer<typeof EffectInstanceSchema>;

export const ReservedVisualRegionSchema = z.strictObject({
  id: StableIdSchema,
  region: VisualRegionSchema,
  reason: z.string().min(1).max(160),
});

export const VisualSceneSchema = z.strictObject({
  id: StableIdSchema,
  source_scene_id: StableIdSchema,
  narrative_role: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  duration_ms: z.number().int().min(500).max(120_000),
  layout: LayoutStrategySchema,
  visual_focus_id: StableIdSchema,
  entry_anchor_id: StableIdSchema.nullable(),
  exit_anchor_id: StableIdSchema.nullable(),
  complexity: VisualComplexitySchema,
  motion_intensity: MotionIntensitySchema,
  information_density: InformationDensitySchema,
  background_role: StyleRoleSchema,
  entities: z.array(VisualEntitySchema).min(1).max(24),
  relations: z.array(SpatialRelationSchema).max(128),
  patterns: z.array(PatternInstanceSchema).max(32),
  motion_phrases: z.array(MotionPhraseInstanceSchema).max(32),
  camera_moves: z.array(CameraMoveSchema).max(12),
  anchors: z.array(ContinuityAnchorSchema).max(64),
  depth_layers: z.array(DepthLayerSchema).max(24),
  choreography: z.array(ChoreographyEventSchema).max(32),
  reserved_regions: z.array(ReservedVisualRegionSchema).max(8),
  morph_chains: z.array(MorphChainSchema).max(8).optional(),
  motion_events: z.array(MotionEventSchema).max(32).optional(),
  causal_relations: z.array(CausalRelationSchema).max(64).optional(),
  layout_transitions: z.array(LayoutTransitionSchema).max(4).optional(),
  effects: z.array(EffectInstanceSchema).max(8).optional(),
});
export type VisualScene = z.infer<typeof VisualSceneSchema>;

export const SceneBridgeSchema = z.strictObject({
  id: StableIdSchema,
  bridge_id: RegistryIdSchema,
  version: SemVerSchema,
  source_scene_id: StableIdSchema,
  destination_scene_id: StableIdSchema,
  source_anchor_id: StableIdSchema,
  destination_anchor_id: StableIdSchema,
  visual_entity_id: StableIdSchema,
  duration_ms: z.number().int().min(100).max(4_000),
  easing: z.enum(['SNAPPY', 'ELASTIC', 'HEAVY', 'FLOATING', 'PRECISE', 'SOFT', 'IMPACTFUL', 'MECHANICAL']),
  fallback_policy: z.enum(['exact_only', 'compatible_simplified', 'generic_transition', 'explicit_cut']),
});
export type SceneBridge = z.infer<typeof SceneBridgeSchema>;

export const CameraContinuitySchema = z.strictObject({
  id: StableIdSchema,
  source_scene_id: StableIdSchema,
  destination_scene_id: StableIdSchema,
  source_camera_id: StableIdSchema,
  destination_camera_id: StableIdSchema,
  energy: z.enum(['left_to_right', 'right_to_left', 'inward', 'outward', 'upward', 'downward', 'rotational', 'radial']),
  velocity_intent: z.enum(['carry', 'accelerate', 'decelerate', 'settle']),
  scale_momentum: z.enum(['preserve', 'expand', 'contract']),
});
export type CameraContinuity = z.infer<typeof CameraContinuitySchema>;

export const VisualMotifSchema = z.strictObject({
  id: StableIdSchema,
  kind: z.enum(['shape', 'line', 'color', 'path', 'type_treatment', 'visual_entity']),
  entity_id: StableIdSchema.nullable(),
  scene_ids: z.array(StableIdSchema).min(2).max(16),
});

export const RegistryFingerprintsSchema = z.strictObject({
  grammar: Sha256Schema,
  patterns: Sha256Schema,
  phrases: Sha256Schema,
  bridges: Sha256Schema,
  cameras: Sha256Schema,
});

export const VisualPlanSchema = z.strictObject({
  schema: z.literal(VISUAL_PLAN_SCHEMA),
  schema_version: z.enum([VISUAL_PLAN_VERSION, P32_VISUAL_PLAN_VERSION, P335_VISUAL_PLAN_VERSION]),
  plan_id: StableIdSchema,
  source: z.strictObject({
    creative_plan_id: StableIdSchema,
    creative_plan_sha256: Sha256Schema,
    pipeline_path: z.literal('visual_directed'),
  }),
  grammar: z.strictObject({ version: z.enum([VISUAL_GRAMMAR_VERSION, P32_VISUAL_GRAMMAR_VERSION, P335_VISUAL_GRAMMAR_VERSION]), fingerprints: RegistryFingerprintsSchema }),
  target: z.strictObject({ format: z.literal('vertical_short_form'), duration_ms: z.number().int().min(500).max(120_000) }),
  style_id: StableIdSchema,
  scenes: z.array(VisualSceneSchema).min(1).max(16),
  bridges: z.array(SceneBridgeSchema).max(32),
  motifs: z.array(VisualMotifSchema).max(16),
  camera_continuities: z.array(CameraContinuitySchema).max(16).optional(),
});
export type VisualPlan = z.infer<typeof VisualPlanSchema>;

export const VisualDiagnosticSchema = z.strictObject({
  code: z.string().regex(/^[a-z][a-z0-9_.]*$/),
  severity: z.enum(['error', 'warning', 'info']),
  path: z.string().min(1),
  scene_id: StableIdSchema.nullable().optional(),
  node_id: StableIdSchema.nullable().optional(),
  message: z.string().min(1).max(500),
  context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  suggested_action: z.string().min(1).max(500).nullable().optional(),
});
export type VisualDiagnostic = z.infer<typeof VisualDiagnosticSchema>;

export const VisualPreflightReportSchema = z.strictObject({
  schema: z.literal('visual-preflight-report'),
  schema_version: z.literal('0.1.0'),
  status: z.enum(['pass', 'warn', 'fail']),
  eligible_for_compilation: z.boolean(),
  visual_plan_sha256: Sha256Schema.nullable(),
  diagnostics: z.array(VisualDiagnosticSchema),
  summary: z.strictObject({ errors: z.number().int().nonnegative(), warnings: z.number().int().nonnegative(), infos: z.number().int().nonnegative() }),
  checks: z.strictObject({ scenes: z.number().int().nonnegative(), entities: z.number().int().nonnegative(), patterns: z.number().int().nonnegative(), phrases: z.number().int().nonnegative(), bridges: z.number().int().nonnegative(), anchors: z.number().int().nonnegative(), depth_layers: z.number().int().nonnegative() }),
});
export type VisualPreflightReport = z.infer<typeof VisualPreflightReportSchema>;
