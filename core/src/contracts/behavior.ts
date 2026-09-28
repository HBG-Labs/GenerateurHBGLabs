import { z } from 'zod';

import { BehaviorIdSchema, IdSchema, SemVerSchema } from './common.ts';

export const BEHAVIOR_DEFINITION_SCHEMA = 'behavior-definition';
export const BEHAVIOR_DEFINITION_VERSION = '0.1.0';

export const P13_ANIMATABLE_PROPERTIES = [
  'opacity',
  'translate_x',
  'translate_y',
  'scale',
  'rotate',
  'clip_top',
  'clip_right',
  'clip_bottom',
  'clip_left',
  'path_progress',
  'color',
] as const;
export const P13_ANCHOR_KINDS = [
  'SCENE_START',
  'SCENE_END',
  'AFTER_PREVIOUS',
  'BEFORE_NEXT',
  'WITH_LAYER',
  'AFTER_LAYER',
] as const;

const ParameterDefinitionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('number'),
    required: z.boolean(),
    default: z.number().finite().optional(),
    min: z.number().finite(),
    max: z.number().finite(),
  }),
  z.strictObject({
    type: z.literal('enum'),
    required: z.boolean(),
    default: IdSchema.optional(),
    values: z.array(IdSchema).min(1).max(16),
  }),
  z.strictObject({ type: z.literal('boolean'), required: z.boolean(), default: z.boolean().optional() }),
  z.strictObject({
    type: z.literal('string'),
    required: z.boolean(),
    default: IdSchema.optional(),
  }),
]);

export const BehaviorDefinitionSchema = z.strictObject({
  schema: z.literal(BEHAVIOR_DEFINITION_SCHEMA),
  schema_version: SemVerSchema,
  id: BehaviorIdSchema,
  version: SemVerSchema,
  intent: z.string().min(1).max(240),
  compatible_primitives: z.array(z.enum(['group', 'text', 'shape', 'image', 'path', 'mask'])).min(1).max(6),
  variants: z.array(IdSchema).max(12),
  parameters: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), ParameterDefinitionSchema),
  animatable_properties: z.array(z.enum(P13_ANIMATABLE_PROPERTIES)).min(1).max(10),
  accepted_anchors: z.array(z.enum(P13_ANCHOR_KINDS)).min(1).max(6),
  constraints: z.strictObject({
    target: z.enum(['none', 'optional_run_or_line', 'required_run']),
    max_instances_per_layer: z.number().int().min(1).max(12),
  }),
  incompatibilities: z.array(BehaviorIdSchema).max(12),
  duration_budget: z.strictObject({
    min_ms: z.number().int().min(0).max(10_000),
    default_beats: z.number().min(0).max(16),
    max_ms: z.number().int().min(0).max(20_000),
  }),
  reduced_motion: z.strictObject({ strategy: z.enum(['opacity_only', 'instant', 'preserve']) }),
  render_cost: z.strictObject({ compute: z.number().int().min(0).max(10), attention: z.number().int().min(0).max(10) }),
});

export type BehaviorDefinition = z.infer<typeof BehaviorDefinitionSchema>;
export type P13AnchorKind = (typeof P13_ANCHOR_KINDS)[number];
export type P13AnimatableProperty = (typeof P13_ANIMATABLE_PROPERTIES)[number];
