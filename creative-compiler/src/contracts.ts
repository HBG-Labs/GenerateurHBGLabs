import { z } from 'zod';

import {
  CreativeDiagnosticSchema,
  ContentSlotRoleSchema,
  StableIdSchema,
} from '@motion-engine/creative-core';
import {
  BehaviorIdSchema,
  MOTION_SPEC_VERSION,
  PlatformSchema,
  Sha256Schema,
  TypeTokenSchema,
} from '@motion-engine/core';

export const CREATIVE_COMPILER_VERSION = '0.1.0' as const;
export const CREATIVE_RESOLUTION_VERSION = '0.1.0' as const;
export const CREATIVE_COMPILE_REPORT_VERSION = '0.1.0' as const;
export const CREATIVE_TEXT_RUN_MAX_CHARACTERS = 160 as const;
export const MOTION_SPEC_TARGET_VERSION = MOTION_SPEC_VERSION;

const ContentResolutionBase = {
  slot_id: StableIdSchema,
  scene_id: StableIdSchema,
  role: ContentSlotRoleSchema,
  required: z.boolean(),
  channels: z.array(z.enum(['spoken', 'on_screen'])).min(1).max(2),
  factual_requirement: z.enum(['none', 'source_recommended', 'source_required']),
  max_characters: z.number().int().positive().max(20_000),
};

export const ResolvedContentSlotSchema = z.discriminatedUnion('status', [
  z.strictObject({
    ...ContentResolutionBase,
    status: z.literal('resolved'),
    content_id: StableIdSchema,
    text: z.string().min(1).max(20_000),
    source_slot: StableIdSchema.optional(),
  }),
  z.strictObject({
    ...ContentResolutionBase,
    status: z.literal('unresolved'),
  }),
]);
export type ResolvedContentSlot = z.infer<typeof ResolvedContentSlotSchema>;

const AssetResolutionBase = {
  asset_intent_id: StableIdSchema,
  asset_slot: StableIdSchema,
  required: z.boolean(),
};

export const ResolvedAssetSlotSchema = z.discriminatedUnion('status', [
  z.strictObject({
    ...AssetResolutionBase,
    status: z.literal('resolved'),
    asset_ref: StableIdSchema,
    focus: z
      .union([
        z.strictObject({ region: z.string().regex(/^[a-z][a-z0-9_.]{0,63}$/) }),
        z.strictObject({ point: z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }) }),
      ])
      .optional(),
  }),
  z.strictObject({
    ...AssetResolutionBase,
    status: z.literal('unresolved'),
  }),
]);
export type ResolvedAssetSlot = z.infer<typeof ResolvedAssetSlotSchema>;

export const ResolvedAudioEventSchema = z.discriminatedUnion('status', [
  z.strictObject({
    creative_event_id: StableIdSchema,
    status: z.literal('resolved'),
    cue: z.string().regex(/^[A-Z][A-Z0-9_]{1,47}$/),
    gain_db: z.number().min(-40).max(0).optional(),
  }),
  z.strictObject({
    creative_event_id: StableIdSchema,
    status: z.literal('unresolved'),
  }),
]);
export type ResolvedAudioEvent = z.infer<typeof ResolvedAudioEventSchema>;

export const CreativeResolutionSchema = z.strictObject({
  schema: z.literal('creative-resolution'),
  schema_version: z.literal(CREATIVE_RESOLUTION_VERSION),
  plan_id: StableIdSchema,
  content_slots: z.array(ResolvedContentSlotSchema).max(256),
  asset_slots: z.array(ResolvedAssetSlotSchema).max(128),
  audio_events: z.array(ResolvedAudioEventSchema).max(256),
});
export type CreativeResolution = z.infer<typeof CreativeResolutionSchema>;

export const VisualLayoutStrategySchema = z.enum([
  'text_stack',
  'image_hero',
  'split',
  'comparison',
  'diagram',
  'abstract',
]);
export type VisualLayoutStrategy = z.infer<typeof VisualLayoutStrategySchema>;

export const MotionMappingSchema = z.strictObject({
  text_behavior: BehaviorIdSchema,
  image_behavior: BehaviorIdSchema.nullable(),
  intensity_scale: z.number().min(0).max(2),
});

export const TransitionMappingSchema = z.strictObject({
  boundary_behavior: BehaviorIdSchema,
  scene_reveal_behavior: BehaviorIdSchema.nullable(),
  fidelity: z.enum(['exact', 'degraded']),
});

export const CompilationProfileSchema = z.strictObject({
  schema: z.literal('creative-compilation-profile'),
  schema_version: z.literal('0.1.0'),
  id: z.string().regex(/^[a-z][a-z0-9_.]{1,63}$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  motion_spec_target: z.literal(MOTION_SPEC_TARGET_VERSION),
  fps: z.number().int().min(1).max(120),
  system: z.strictObject({ id: z.string().regex(/^[a-z][a-z0-9_.]*$/), version: z.string().regex(/^\d+\.\d+\.\d+$/) }),
  platform: PlatformSchema,
  visual_modes: z.record(z.string(), VisualLayoutStrategySchema),
  motion_characters: z.record(z.string(), MotionMappingSchema),
  typography_roles: z.record(z.string(), TypeTokenSchema),
  transitions: z.record(z.string(), TransitionMappingSchema),
  rhythm_roles: z.record(z.string(), z.enum(['CALM', 'BUILD', 'ACCELERATE', 'INTERRUPTION', 'REVEAL', 'RESOLUTION'])),
  scene_purposes: z.record(z.string(), z.enum(['hook', 'tension', 'reveal', 'proof', 'resolution', 'cta', 'signature'])),
});
export type CompilationProfile = z.infer<typeof CompilationProfileSchema>;

export const QuantizedSceneSchema = z.strictObject({
  creative_scene_id: StableIdSchema,
  motion_scene_id: StableIdSchema,
  duration_ms: z.number().int().positive(),
  from_frame: z.number().int().nonnegative(),
  to_frame: z.number().int().positive(),
});

export const ProvenanceSceneSchema = z.strictObject({
  creative_scene_id: StableIdSchema,
  motion_scene_id: StableIdSchema,
  narrative_role: z.string(),
  source_content_slot_ids: z.array(StableIdSchema),
  source_asset_intent_ids: z.array(StableIdSchema),
  motion_layer_ids: z.array(StableIdSchema),
});

export const ProvenanceLayerSchema = z.strictObject({
  creative_scene_id: StableIdSchema,
  motion_scene_id: StableIdSchema,
  motion_layer_id: StableIdSchema,
  source_kind: z.enum(['content', 'asset', 'visual_intent', 'compiler_structure']),
  source_id: StableIdSchema,
  hierarchy: z.enum(['primary', 'secondary', 'supporting', 'decorative']).nullable(),
});

export const CreativeCompileProvenanceSchema = z.strictObject({
  schema: z.literal('creative-compile-provenance'),
  schema_version: z.literal('0.1.0'),
  creative_plan_sha256: Sha256Schema,
  resolution_sha256: Sha256Schema,
  scenes: z.array(ProvenanceSceneSchema),
  layers: z.array(ProvenanceLayerSchema),
  quantization: z.strictObject({
    fps: z.number().int().positive(),
    target_duration_ms: z.number().int().positive(),
    total_frames: z.number().int().positive(),
    scenes: z.array(QuantizedSceneSchema),
  }),
});
export type CreativeCompileProvenance = z.infer<typeof CreativeCompileProvenanceSchema>;

export const CreativeCompileReportSchema = z.strictObject({
  schema: z.literal('creative-compile-report'),
  schema_version: z.literal(CREATIVE_COMPILE_REPORT_VERSION),
  compiler_version: z.literal(CREATIVE_COMPILER_VERSION),
  status: z.enum(['pass', 'warn', 'fail']),
  eligible: z.boolean(),
  diagnostics: z.array(CreativeDiagnosticSchema),
  summary: z.strictObject({
    errors: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
    infos: z.number().int().nonnegative(),
    scenes: z.number().int().nonnegative(),
    layers: z.number().int().nonnegative(),
    resolved_content_slots: z.number().int().nonnegative(),
    resolved_asset_slots: z.number().int().nonnegative(),
  }),
  hashes: z.strictObject({
    creative_plan: Sha256Schema.nullable(),
    resolution: Sha256Schema.nullable(),
    profile: Sha256Schema,
    style: Sha256Schema,
    motion_spec: Sha256Schema.nullable(),
    provenance: Sha256Schema.nullable(),
    compiler_fingerprint: Sha256Schema.nullable(),
  }),
});
export type CreativeCompileReport = z.infer<typeof CreativeCompileReportSchema>;
