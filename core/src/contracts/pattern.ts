import { z } from 'zod';

import {
  ColorTokenSchema,
  DottedIdSchema,
  SemVerSchema,
  SpaceTokenSchema,
  TypeTokenSchema,
} from './common.ts';

export const PATTERN_DEFINITION_SCHEMA = 'pattern-definition';
export const PATTERN_DEFINITION_VERSION = '0.1.0';

const SlotNameSchema = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/);

const SlotSizeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('fill') }),
  z.strictObject({ kind: z.literal('content') }),
  z.strictObject({ kind: z.literal('space'), token: SpaceTokenSchema }),
]);

export const PatternSlotSchema = z.discriminatedUnion('primitive', [
  z.strictObject({
    id: SlotNameSchema,
    primitive: z.literal('text'),
    role: z.literal('statement'),
    order: z.number().int().min(0).max(16),
    width: SlotSizeSchema,
    height: SlotSizeSchema,
    style: z.strictObject({
      type: TypeTokenSchema,
      color: ColorTokenSchema,
      accent_color: ColorTokenSchema,
    }),
  }),
  z.strictObject({
    id: SlotNameSchema,
    primitive: z.literal('shape'),
    role: z.literal('interrupt_marker'),
    order: z.number().int().min(0).max(16),
    width: SlotSizeSchema,
    height: SlotSizeSchema,
    style: z.strictObject({ fill: ColorTokenSchema }),
  }),
]);
export type PatternSlot = z.infer<typeof PatternSlotSchema>;

export const PatternDefinitionSchema = z.strictObject({
  schema: z.literal(PATTERN_DEFINITION_SCHEMA),
  schema_version: SemVerSchema,
  id: DottedIdSchema,
  version: SemVerSchema,
  intent: z.string().min(1).max(200),
  background: ColorTokenSchema,
  layout: z.strictObject({
    kind: z.literal('stack'),
    region: z.literal('safe'),
    direction: z.literal('vertical'),
    align_x: z.enum(['start', 'center', 'end']),
    align_y: z.enum(['start', 'center', 'end']),
    gap: SpaceTokenSchema,
  }),
  slots: z.array(PatternSlotSchema).min(2).max(8),
  constraints: z.strictObject({
    min_lines: z.number().int().min(1).max(6),
    max_lines: z.number().int().min(1).max(6),
    explicit_line_breaks: z.literal(true),
  }),
});
export type PatternDefinition = z.infer<typeof PatternDefinitionSchema>;
