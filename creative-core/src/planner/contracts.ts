import { z } from 'zod';

import { LanguageSchema, LocaleSchema, SemanticTagSchema, Sha256Schema, StableIdSchema } from '../contracts/common.ts';
import { CreativeDiagnosticSchema } from '../contracts/diagnostics.ts';

export const PLANNER_INPUT_VERSION = '0.1.0' as const;
export const PLANNING_REPORT_VERSION = '0.1.0' as const;
export const STORY_PLANNER_VERSION = '0.2.0' as const;

export const NARRATIVE_ROLES = [
  'hook',
  'premise',
  'setup',
  'context',
  'problem',
  'consequence',
  'development',
  'escalation',
  'explanation',
  'example',
  'item',
  'strongest_item',
  'comparison_a',
  'comparison_b',
  'contrast',
  'solution',
  'demonstration',
  'action',
  'result',
  'proof',
  'tension',
  'partial_information',
  'reveal',
  'payoff',
  'takeaway',
  'cta',
] as const;
export const NarrativeRoleSchema = z.enum(NARRATIVE_ROLES);
export type NarrativeRole = z.infer<typeof NarrativeRoleSchema>;

export const ARCHETYPE_IDS = [
  'HYPOTHETICAL',
  'EXPLAINER',
  'PROBLEM_SOLUTION',
  'LIST',
  'COMPARISON',
  'REVEAL',
  'DEMONSTRATION',
] as const;
export const ArchetypeIdSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{1,47}$/, 'ID d’archétype attendu en majuscules');
export type ArchetypeId = z.infer<typeof ArchetypeIdSchema>;

export const InformationDensitySchema = z.enum(['minimal', 'low', 'medium', 'high']);
export type InformationDensity = z.infer<typeof InformationDensitySchema>;

export const ContentSlotRoleSchema = z.enum([
  'hook_text',
  'narration',
  'explanation',
  'factual_claim',
  'reveal',
  'cta',
  'statistic',
  'comparison',
  'label',
]);
export type ContentSlotRole = z.infer<typeof ContentSlotRoleSchema>;

export const PlannerAssetKindSchema = z.enum(['image', 'illustration', 'icon', 'background', 'diagram', 'none']);
export type PlannerAssetKind = z.infer<typeof PlannerAssetKindSchema>;

const constraintBase = { id: StableIdSchema };
export const PlannerConstraintSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...constraintBase, kind: z.literal('require_role'), role: NarrativeRoleSchema }),
  z.strictObject({ ...constraintBase, kind: z.literal('forbid_role'), role: NarrativeRoleSchema }),
  z.strictObject({ ...constraintBase, kind: z.literal('min_scenes'), value: z.number().int().min(1).max(256) }),
  z.strictObject({ ...constraintBase, kind: z.literal('max_scenes'), value: z.number().int().min(1).max(256) }),
  z.strictObject({ ...constraintBase, kind: z.literal('require_narration') }),
  z.strictObject({ ...constraintBase, kind: z.literal('forbid_narration') }),
  z.strictObject({ ...constraintBase, kind: z.literal('require_asset'), asset_kind: PlannerAssetKindSchema }),
  z.strictObject({ ...constraintBase, kind: z.literal('forbid_asset'), asset_kind: PlannerAssetKindSchema }),
]);
export type PlannerConstraint = z.infer<typeof PlannerConstraintSchema>;

export const ProvidedContentSchema = z.strictObject({
  id: StableIdSchema,
  role: ContentSlotRoleSchema,
  text: z.string().min(1).max(20_000),
  channels: z.array(z.enum(['spoken', 'on_screen'])).min(1).max(2),
  source_slot: StableIdSchema.optional(),
});
export type ProvidedContent = z.infer<typeof ProvidedContentSchema>;

export const PlannerInputSchema = z.strictObject({
  schema: z.literal('planner-input'),
  schema_version: z.literal(PLANNER_INPUT_VERSION),
  input_id: StableIdSchema,
  topic: z.string().min(1).max(3_000),
  creative_goal: SemanticTagSchema,
  audience: z.strictObject({
    description: z.string().min(1).max(2_000),
    knowledge_level: z.enum(['unaware', 'beginner', 'intermediate', 'advanced', 'expert', 'mixed']),
  }),
  language: LanguageSchema,
  locale: LocaleSchema,
  target_duration_ms: z.number().int().positive().max(3_600_000),
  target_format: z.enum(['vertical_short', 'square', 'landscape']),
  tone: z.array(SemanticTagSchema).min(1).max(8),
  pacing: z.enum(['slow', 'measured', 'medium', 'fast', 'aggressive']),
  information_density: InformationDensitySchema,
  narrative_archetype: ArchetypeIdSchema.optional(),
  desired_reaction: z.string().min(1).max(1_000),
  factual_mode: z.enum(['factual', 'creative', 'mixed']),
  cta: z.strictObject({
    mode: z.enum(['none', 'soft', 'explicit']),
    text: z.string().min(1).max(2_000).optional(),
  }),
  constraints: z.array(PlannerConstraintSchema).max(1_024),
  provided_content: z.array(ProvidedContentSchema).max(1_024),
});
export type PlannerInput = z.infer<typeof PlannerInputSchema>;

export const StoryBeatSchema = z.strictObject({
  id: StableIdSchema,
  role: NarrativeRoleSchema,
  semantic_purpose: z.string().min(1).max(2_000),
  importance: z.number().int().min(1).max(100),
  duration_weight: z.number().int().positive().max(1_000),
  information_density: InformationDensitySchema,
  relationship: z.strictObject({
    previous_beat_id: StableIdSchema.nullable(),
    next_beat_id: StableIdSchema.nullable(),
  }),
  required: z.boolean(),
  splittable: z.boolean(),
});
export type StoryBeat = z.infer<typeof StoryBeatSchema>;

export const StoryArcPointSchema = z.strictObject({
  beat_id: StableIdSchema,
  phase: z.enum(['curiosity', 'context', 'tension', 'escalation', 'reveal', 'resolution']),
  direction: z.enum(['rise', 'hold', 'fall']),
});
export type StoryArcPoint = z.infer<typeof StoryArcPointSchema>;

const contentSlotBase = {
  id: StableIdSchema,
  beat_id: StableIdSchema,
  role: ContentSlotRoleSchema,
  required: z.boolean(),
  language: LanguageSchema,
  semantic_context: z.string().min(1).max(4_000),
  constraints: z.strictObject({
    max_characters: z.number().int().positive().max(20_000),
    channels: z.array(z.enum(['spoken', 'on_screen'])).min(1).max(2),
  }),
  factual_requirement: z.enum(['none', 'source_recommended', 'source_required']),
};

export const ContentSlotSchema = z.discriminatedUnion('status', [
  z.strictObject({
    ...contentSlotBase,
    status: z.literal('resolved'),
    resolved_content_id: StableIdSchema,
    text: z.string().min(1).max(20_000),
    source_slot: StableIdSchema.optional(),
  }),
  z.strictObject({
    ...contentSlotBase,
    status: z.literal('unresolved'),
  }),
]);
export type ContentSlot = z.infer<typeof ContentSlotSchema>;

export const SceneAllocationSchema = z.strictObject({
  scene_id: StableIdSchema,
  beat_ids: z.array(StableIdSchema).min(1).max(32),
  primary_role: NarrativeRoleSchema,
  duration_ms: z.number().int().positive(),
  information_density: InformationDensitySchema,
  split_index: z.number().int().nonnegative(),
});
export type SceneAllocation = z.infer<typeof SceneAllocationSchema>;

export const PlanningDecisionSchema = z.strictObject({
  code: z.string().regex(/^[a-z][a-z0-9_.]*$/),
  kind: z.enum(['selected', 'retained', 'omitted', 'merged', 'split', 'allocated', 'resolved', 'unresolved', 'defaulted']),
  node_ids: z.array(StableIdSchema).max(64),
  context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});
export type PlanningDecision = z.infer<typeof PlanningDecisionSchema>;

export const PlannerValidationReportSchema = z.strictObject({
  schema: z.literal('planner-validation-report'),
  schema_version: z.literal('0.1.0'),
  status: z.enum(['pass', 'warn', 'fail']),
  eligible_for_planning: z.boolean(),
  planner_input_sha256: Sha256Schema.nullable(),
  diagnostics: z.array(CreativeDiagnosticSchema),
  summary: z.strictObject({
    errors: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
    infos: z.number().int().nonnegative(),
  }),
});
export type PlannerValidationReport = z.infer<typeof PlannerValidationReportSchema>;

export const PlanningReportSchema = z.strictObject({
  schema: z.literal('planning-report'),
  schema_version: z.literal(PLANNING_REPORT_VERSION),
  planner_version: z.literal(STORY_PLANNER_VERSION),
  status: z.enum(['pass', 'warn', 'fail']),
  eligible_for_creative_compilation: z.boolean(),
  planner_input_sha256: Sha256Schema,
  registry_fingerprint: Sha256Schema,
  archetype: z.strictObject({
    id: ArchetypeIdSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    selection: z.enum(['received', 'goal_match', 'defaulted']),
  }),
  beats: z.array(StoryBeatSchema),
  story_arc: z.array(StoryArcPointSchema),
  scenes: z.array(SceneAllocationSchema),
  duration: z.strictObject({
    target_ms: z.number().int().positive(),
    allocated_ms: z.number().int().nonnegative(),
    exact: z.boolean(),
  }),
  content_slots: z.strictObject({
    total: z.number().int().nonnegative(),
    resolved: z.number().int().nonnegative(),
    unresolved: z.number().int().nonnegative(),
    required_unresolved: z.number().int().nonnegative(),
    ids: z.array(StableIdSchema),
  }),
  asset_intents: z.array(
    z.strictObject({
      id: StableIdSchema,
      slot: StableIdSchema,
      kind: PlannerAssetKindSchema,
      scene_ids: z.array(StableIdSchema).min(1),
    }),
  ),
  decisions: z.array(PlanningDecisionSchema),
  diagnostics: z.array(CreativeDiagnosticSchema),
  creative_plan: z.strictObject({
    sha256: Sha256Schema.nullable(),
    preflight_status: z.enum(['pass', 'warn', 'fail']),
    errors: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
  }),
});
export type PlanningReport = z.infer<typeof PlanningReportSchema>;
