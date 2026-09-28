import { z } from 'zod';

import {
  ArchetypeIdSchema,
  ContentSlotRoleSchema,
  CreativeDiagnosticSchema,
  InformationDensitySchema,
  LanguageSchema,
  LocaleSchema,
  PlannerConstraintSchema,
  SemanticTagSchema,
  Sha256Schema,
  StableIdSchema,
} from '@motion-engine/creative-core';

export const CREATIVE_GATEWAY_VERSION = '0.1.0' as const;
export const CREATIVE_GENERATION_REQUEST_VERSION = '0.1.0' as const;
export const CREATIVE_GENERATION_OUTPUT_VERSION = '0.1.0' as const;
export const CREATIVE_GATEWAY_SNAPSHOT_VERSION = '0.1.0' as const;
export const CREATIVE_GATEWAY_REPORT_VERSION = '0.1.0' as const;
export const RESOLUTION_REPAIR_CONTRACT_VERSION = '0.1.0' as const;

export const ProviderCapabilitySchema = z.enum([
  'structured_output',
  'json_schema',
  'text_generation',
  'tool_use',
  'streaming',
  'multimodal_input',
]);
export type ProviderCapability = z.infer<typeof ProviderCapabilitySchema>;

export const ProviderMetadataSchema = z.strictObject({
  provider_id: StableIdSchema,
  adapter_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  capabilities: z.array(ProviderCapabilitySchema).min(1).max(16),
  model_family: z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/).optional(),
  deterministic_test: z.boolean(),
});
export type ProviderMetadata = z.infer<typeof ProviderMetadataSchema>;

export const ProviderUsageSchema = z.strictObject({
  input_units: z.number().int().nonnegative().nullable(),
  output_units: z.number().int().nonnegative().nullable(),
  cached_units: z.number().int().nonnegative().nullable(),
  request_count: z.number().int().nonnegative(),
  provider_reported_cost: z
    .strictObject({ amount: z.number().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/) })
    .nullable(),
});
export type ProviderUsage = z.infer<typeof ProviderUsageSchema>;

export const CreativeGenerationRequestSchema = z.strictObject({
  schema: z.literal('creative-generation-request'),
  schema_version: z.literal(CREATIVE_GENERATION_REQUEST_VERSION),
  request_id: StableIdSchema,
  idempotency_key: Sha256Schema,
  idea: z.string().min(1).max(3_000),
  creative_goal: SemanticTagSchema,
  target_duration_ms: z.number().int().min(3_000).max(180_000),
  target_format: z.enum(['vertical_short', 'square', 'landscape']),
  audience: z.strictObject({
    description: z.string().min(1).max(2_000),
    knowledge_level: z.enum(['unaware', 'beginner', 'intermediate', 'advanced', 'expert', 'mixed']),
  }),
  language: LanguageSchema,
  locale: LocaleSchema,
  tone: z.array(SemanticTagSchema).min(1).max(8),
  desired_reaction: z.string().min(1).max(1_000),
  factual_mode: z.enum(['factual', 'creative', 'mixed']),
  cta: z.strictObject({ mode: z.enum(['none', 'soft', 'explicit']) }),
  constraints: z.array(PlannerConstraintSchema).max(64),
});
export type CreativeGenerationRequest = z.infer<typeof CreativeGenerationRequestSchema>;

export const OutputProvenanceSchema = z.enum(['fixture', 'provider_generated']);
export type OutputProvenance = z.infer<typeof OutputProvenanceSchema>;

export const PlanningGenerationOutputSchema = z.strictObject({
  schema: z.literal('creative-generation-output'),
  schema_version: z.literal(CREATIVE_GENERATION_OUTPUT_VERSION),
  stage: z.literal('planning'),
  request_id: StableIdSchema,
  provenance: OutputProvenanceSchema,
  normalized_topic: z.string().min(1).max(3_000),
  creative_goal: SemanticTagSchema,
  audience: z.strictObject({
    description: z.string().min(1).max(2_000),
    knowledge_level: z.enum(['unaware', 'beginner', 'intermediate', 'advanced', 'expert', 'mixed']),
  }),
  language: LanguageSchema,
  locale: LocaleSchema,
  target_duration_ms: z.number().int().min(3_000).max(180_000),
  target_format: z.enum(['vertical_short', 'square', 'landscape']),
  tone: z.array(SemanticTagSchema).min(1).max(8),
  pacing: z.enum(['slow', 'measured', 'medium', 'fast', 'aggressive']),
  information_density: InformationDensitySchema,
  narrative_archetype: ArchetypeIdSchema.optional(),
  desired_reaction: z.string().min(1).max(1_000),
  factual_mode: z.enum(['factual', 'creative', 'mixed']),
  cta: z.strictObject({ mode: z.enum(['none', 'soft', 'explicit']) }),
  suggested_constraints: z.array(PlannerConstraintSchema).max(64),
});
export type PlanningGenerationOutput = z.infer<typeof PlanningGenerationOutputSchema>;

export const ResolutionContentSchema = z.strictObject({
  slot_id: StableIdSchema,
  scene_id: StableIdSchema.optional(),
  text: z.string().min(1).max(20_000),
  provenance: OutputProvenanceSchema,
  uncertainty: z.enum(['none', 'low', 'medium', 'high', 'unknown']),
  source_required: z.boolean(),
});
export type ResolutionContent = z.infer<typeof ResolutionContentSchema>;

export const AssetDescriptionSchema = z.strictObject({
  asset_intent_id: StableIdSchema,
  asset_slot: StableIdSchema,
  description: z.string().min(1).max(4_000),
  provenance: OutputProvenanceSchema,
});
export type AssetDescription = z.infer<typeof AssetDescriptionSchema>;

export const ResolutionGenerationOutputSchema = z.strictObject({
  schema: z.literal('creative-generation-output'),
  schema_version: z.literal(CREATIVE_GENERATION_OUTPUT_VERSION),
  stage: z.literal('resolution'),
  request_id: StableIdSchema,
  plan_id: StableIdSchema,
  provenance: OutputProvenanceSchema,
  content: z.array(ResolutionContentSchema).max(128),
  asset_descriptions: z.array(AssetDescriptionSchema).max(64),
});
export type ResolutionGenerationOutput = z.infer<typeof ResolutionGenerationOutputSchema>;

const NullableResolutionContentSchema = z.strictObject({
  scene_id: StableIdSchema.nullable(),
  text: z.string().min(1).max(20_000),
  provenance: OutputProvenanceSchema,
  uncertainty: z.enum(['none', 'low', 'medium', 'high', 'unknown']),
  source_required: z.boolean(),
});

export const ResolutionRepairTargetIdSchema = z.strictObject({
  slot_id: StableIdSchema,
  scene_id: StableIdSchema.nullable(),
});
export type ResolutionRepairTargetId = z.infer<typeof ResolutionRepairTargetIdSchema>;

export const ResolutionRepairTargetSchema = z.strictObject({
  target: ResolutionRepairTargetIdSchema,
  previous_content: NullableResolutionContentSchema.nullable(),
  semantic_role: ContentSlotRoleSchema,
  semantic_context: z.string().min(1).max(4_000),
  language: LanguageSchema,
  locale: LocaleSchema,
  required: z.boolean(),
  content_constraints: z.strictObject({
    max_characters: z.number().int().positive().max(20_000),
    channels: z.array(z.enum(['spoken', 'on_screen'])).min(1).max(2),
    factual_requirement: z.enum(['none', 'source_recommended', 'source_required']),
  }),
  allowed_scene_ids: z.array(StableIdSchema).min(1).max(64),
  generic_resolution_allowed: z.boolean(),
  diagnostics: z.array(CreativeDiagnosticSchema).min(1).max(16),
  temporal_constraint: z.strictObject({
    available_scene_ms: z.number().int().nonnegative(),
    already_allocated_ms: z.number().int().nonnegative(),
    remaining_slot_ms: z.number().int().nonnegative(),
    current_required_ms: z.number().int().nonnegative(),
    current_word_count: z.number().int().nonnegative(),
    maximum_slot_words: z.number().int().nonnegative(),
  }).nullable(),
  subtitle_constraint: z.strictObject({
    maximum_lines: z.number().int().positive(),
    preferred_size: z.number().positive(),
    minimum_size: z.number().positive(),
    available_width: z.number().positive(),
    available_height: z.number().positive(),
  }).nullable(),
});
export type ResolutionRepairTarget = z.infer<typeof ResolutionRepairTargetSchema>;

export const ResolutionRepairRequestSchema = z.strictObject({
  schema: z.literal('resolution-repair-request'),
  schema_version: z.literal(RESOLUTION_REPAIR_CONTRACT_VERSION),
  request_id: StableIdSchema,
  plan_id: StableIdSchema,
  attempt: z.number().int().positive().max(8),
  targets: z.array(ResolutionRepairTargetSchema).min(1).max(128),
});
export type ResolutionRepairRequest = z.infer<typeof ResolutionRepairRequestSchema>;

export const ResolutionRepairPatchItemSchema = z.strictObject({
  target: ResolutionRepairTargetIdSchema,
  replacement: NullableResolutionContentSchema,
});
export type ResolutionRepairPatchItem = z.infer<typeof ResolutionRepairPatchItemSchema>;

export const ResolutionRepairPatchSchema = z.strictObject({
  schema: z.literal('resolution-repair-patch'),
  schema_version: z.literal(RESOLUTION_REPAIR_CONTRACT_VERSION),
  request_id: StableIdSchema,
  plan_id: StableIdSchema,
  items: z.array(ResolutionRepairPatchItemSchema).min(1).max(128),
});
export type ResolutionRepairPatch = z.infer<typeof ResolutionRepairPatchSchema>;

export const CreativeGenerationOutputSchema = z.discriminatedUnion('stage', [
  PlanningGenerationOutputSchema,
  ResolutionGenerationOutputSchema,
]);
export type CreativeGenerationOutput = z.infer<typeof CreativeGenerationOutputSchema>;

export const GatewayAssetBindingSchema = z.strictObject({
  asset_slot: StableIdSchema,
  asset_ref: StableIdSchema,
  provenance: z.enum(['fixture', 'user_supplied', 'externally_verified']),
  focus: z
    .union([
      z.strictObject({ region: z.string().regex(/^[a-z][a-z0-9_.]{0,63}$/) }),
      z.strictObject({ point: z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }) }),
    ])
    .optional(),
});
export type GatewayAssetBinding = z.infer<typeof GatewayAssetBindingSchema>;

export const GatewaySourceVerificationSchema = z.strictObject({
  slot_id: StableIdSchema,
  source_slot: StableIdSchema,
  provenance: z.enum(['fixture', 'user_supplied', 'externally_verified']),
});
export type GatewaySourceVerification = z.infer<typeof GatewaySourceVerificationSchema>;

export const PromptContractSchema = z.strictObject({
  schema: z.literal('creative-prompt-contract'),
  schema_version: z.literal('0.1.0'),
  stage: z.enum(['planning', 'resolution']),
  system_intent: z.enum(['structure_creative_request', 'resolve_creative_slots']),
  output_schema: z.strictObject({ name: z.string(), version: z.string() }),
  user_content: z.string(),
  constraints: z.array(z.string()).max(32),
});
export type PromptContract = z.infer<typeof PromptContractSchema>;

export const GatewayStateSchema = z.enum([
  'CREATED',
  'PLANNING_PENDING',
  'PLANNING_VALIDATING',
  'PLANNED',
  'RESOLUTION_PENDING',
  'RESOLUTION_VALIDATING',
  'RESOLVED',
  'REPLAY_VALIDATING',
  'READY_FOR_COMPILE',
  'FAILED',
  'CANCELLED',
]);
export type GatewayState = z.infer<typeof GatewayStateSchema>;

export const GatewayTransitionSchema = z.strictObject({
  from: GatewayStateSchema,
  to: GatewayStateSchema,
  reason: z.string().regex(/^[a-z][a-z0-9_.]*$/),
});
export type GatewayTransition = z.infer<typeof GatewayTransitionSchema>;

export const GatewayFailureKindSchema = z.enum([
  'provider_auth_missing',
  'provider_auth_invalid',
  'provider_rate_limited',
  'provider_unavailable',
  'provider_network_error',
  'provider_timeout',
  'provider_safety_refusal',
  'provider_output_incomplete',
  'provider_call_limit_exceeded',
  'provider_malformed_response',
  'schema_invalid',
  'semantic_invalid',
  'unsupported_capability',
  'repair_exhausted',
  'unresolved_required_content',
  'unresolved_required_asset',
  'factual_verification_required',
  'cancelled',
]);
export type GatewayFailureKind = z.infer<typeof GatewayFailureKindSchema>;

export const GatewaySnapshotPayloadSchema = z.strictObject({
  schema: z.literal('creative-gateway-snapshot'),
  schema_version: z.literal(CREATIVE_GATEWAY_SNAPSHOT_VERSION),
  gateway_version: z.literal(CREATIVE_GATEWAY_VERSION),
  request: CreativeGenerationRequestSchema,
  provider: ProviderMetadataSchema,
  planning_output: PlanningGenerationOutputSchema,
  resolution_output: ResolutionGenerationOutputSchema,
  asset_bindings: z.array(GatewayAssetBindingSchema).max(64),
  source_verifications: z.array(GatewaySourceVerificationSchema).max(128),
  provenance: z.strictObject({
    user_idea: z.literal('user_supplied'),
    planning_output: OutputProvenanceSchema,
    resolution_output: OutputProvenanceSchema,
    raw_response_policy: z.literal('excluded'),
    resolution_repair: z.strictObject({
      occurred: z.literal(true),
      attempt_count: z.number().int().positive(),
      repaired_targets: z.array(ResolutionRepairTargetIdSchema).min(1).max(128),
      diagnostic_codes: z.array(z.string().regex(/^[a-z][a-z0-9_.]*$/)).min(1).max(128),
      request_contract_version: z.literal(RESOLUTION_REPAIR_CONTRACT_VERSION),
      patch_contract_version: z.literal(RESOLUTION_REPAIR_CONTRACT_VERSION),
    }).optional(),
  }),
  hashes: z.strictObject({
    request: Sha256Schema,
    planning_output: Sha256Schema,
    resolution_output: Sha256Schema,
    accepted_provider_response: Sha256Schema,
  }),
});
export type GatewaySnapshotPayload = z.infer<typeof GatewaySnapshotPayloadSchema>;

export const CreativeGatewaySnapshotSchema = GatewaySnapshotPayloadSchema.extend({
  snapshot_sha256: Sha256Schema,
}).strict();
export type CreativeGatewaySnapshot = z.infer<typeof CreativeGatewaySnapshotSchema>;

export const GatewayMetricsSchema = z.strictObject({
  total_ms: z.number().nonnegative(),
  provider_ms: z.number().nonnegative(),
  validation_ms: z.number().nonnegative(),
  planning_ms: z.number().nonnegative(),
  resolution_ms: z.number().nonnegative(),
  measured: z.literal(true),
});
export type GatewayMetrics = z.infer<typeof GatewayMetricsSchema>;

export const CreativeGatewayReportSchema = z.strictObject({
  schema: z.literal('creative-gateway-report'),
  schema_version: z.literal(CREATIVE_GATEWAY_REPORT_VERSION),
  gateway_version: z.literal(CREATIVE_GATEWAY_VERSION),
  state: GatewayStateSchema,
  eligible_for_compile: z.boolean(),
  failure_kind: GatewayFailureKindSchema.nullable(),
  provider: ProviderMetadataSchema.nullable(),
  transitions: z.array(GatewayTransitionSchema),
  diagnostics: z.array(CreativeDiagnosticSchema),
  summary: z.strictObject({
    errors: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
    infos: z.number().int().nonnegative(),
    planning_attempts: z.number().int().nonnegative(),
    resolution_attempts: z.number().int().nonnegative(),
  }),
  usage: ProviderUsageSchema,
  usage_by_stage: z.strictObject({
    planning: ProviderUsageSchema,
    initial_resolution: ProviderUsageSchema,
    resolution_repair: ProviderUsageSchema,
  }).optional(),
  resolution_repair: z.strictObject({
    attempt_count: z.number().int().nonnegative(),
    initial_invalid_targets: z.array(ResolutionRepairTargetIdSchema).max(128),
    diagnostic_codes_by_target: z.array(z.strictObject({
      target: ResolutionRepairTargetIdSchema,
      codes: z.array(z.string().regex(/^[a-z][a-z0-9_.]*$/)).min(1).max(16),
    })).max(128),
    patched_targets: z.array(ResolutionRepairTargetIdSchema).max(128),
    remaining_invalid_targets: z.array(ResolutionRepairTargetIdSchema).max(128),
    patch_sha256: Sha256Schema.nullable(),
  }).optional(),
  metrics: GatewayMetricsSchema,
  hashes: z.strictObject({
    request: Sha256Schema.nullable(),
    accepted_provider_response: Sha256Schema.nullable(),
    snapshot: Sha256Schema.nullable(),
  }),
  raw_response_policy: z.literal('excluded'),
});
export type CreativeGatewayReport = z.infer<typeof CreativeGatewayReportSchema>;
