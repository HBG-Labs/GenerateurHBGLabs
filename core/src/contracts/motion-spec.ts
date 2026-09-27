import { z } from 'zod';

import {
  AnchorSchema,
  BehaviorIdSchema,
  ColorTokenSchema,
  CueIdSchema,
  DottedIdSchema,
  DurationSchema,
  EnergySchema,
  GridPlacementSchema,
  IdSchema,
  LocaleSchema,
  MotifTokenSchema,
  OffsetSchema,
  PlatformSchema,
  RhythmPhaseSchema,
  SemVerSchema,
  Sha256Schema,
  SpaceTokenSchema,
  StrokeTokenSchema,
  TemporalEventKindSchema,
  TypeTokenSchema,
} from './common.ts';
import type { Anchor, Duration, GridPlacement } from './common.ts';

export const MOTION_SPEC_SCHEMA = 'motion-scene-spec';
export const MOTION_SPEC_VERSION = '0.1.0';

const ParamValueSchema = z.union([z.number().finite(), z.string().max(64), z.boolean()]);

/** Instance d'un comportement de la grammaire de mouvement. */
export const BehaviorInstanceSchema = z.strictObject({
  id: IdSchema,
  behavior: BehaviorIdSchema,
  variant: IdSchema.optional(),
  params: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), ParamValueSchema).optional(),
  target: z
    .strictObject({
      run: IdSchema.optional(),
      line: z.number().int().min(0).max(16).optional(),
    })
    .optional(),
  at: AnchorSchema,
  duration: DurationSchema.optional(),
  continues_in: z.strictObject({ scene: IdSchema, layer: IdSchema }).optional(),
});
export type BehaviorInstance = z.infer<typeof BehaviorInstanceSchema>;

const SlotNameSchema = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/, 'nom de slot attendu');

export const TextRunSchema = z.strictObject({
  id: IdSchema,
  text: z.string().min(1).max(160),
  role: z.enum(['base', 'accent', 'muted']).optional(),
  break_after: z.boolean().optional(),
});
export type TextRun = z.infer<typeof TextRunSchema>;

// Les calques sont récursifs (group, mask) : types écrits à la main, schémas
// annotés, pour que TypeScript suive la récursion.
interface LayerCommon {
  id: string;
  slot?: string | undefined;
  placement?: GridPlacement | undefined;
  opacity?: number | undefined;
  behaviors: BehaviorInstance[];
}

export interface TextLayer extends LayerCommon {
  primitive: 'text';
  content: { runs: TextRun[]; break_policy: 'explicit' | 'balance' };
  style: {
    type: string;
    color: string;
    accent_color?: string | undefined;
    muted_color?: string | undefined;
    align?: 'start' | 'center' | 'end' | undefined;
  };
}

export interface ShapeLayer extends LayerCommon {
  primitive: 'shape';
  shape: 'rect' | 'ellipse';
  radius?: string | undefined;
  fill?: string | undefined;
  stroke?: { color: string; weight: string } | undefined;
}

export interface ImageLayer extends LayerCommon {
  primitive: 'image';
  asset: string;
  fit: 'cover' | 'contain';
  focus?:
    | { region: string }
    | { point: { x: number; y: number } }
    | undefined;
}

export interface PathLayer extends LayerCommon {
  primitive: 'path';
  geometry:
    | { motif: string }
    | { points: { x: number; y: number }[]; closed?: boolean | undefined };
  style: { stroke: string; weight: string; cap?: 'butt' | 'round' | 'square' | undefined };
}

export interface GroupLayer extends LayerCommon {
  primitive: 'group';
  children: Layer[];
}

export interface MaskLayer extends LayerCommon {
  primitive: 'mask';
  clip: { shape: 'rect' | 'ellipse'; radius?: string | undefined };
  children: Layer[];
}

export type Layer = TextLayer | ShapeLayer | ImageLayer | PathLayer | GroupLayer | MaskLayer;
export type PrimitiveType = Layer['primitive'];
export const PRIMITIVE_TYPES = ['text', 'shape', 'image', 'path', 'group', 'mask'] as const;

const layerCommon = {
  id: IdSchema,
  slot: SlotNameSchema.optional(),
  placement: GridPlacementSchema.optional(),
  opacity: z.number().min(0).max(1).optional(),
  behaviors: z.array(BehaviorInstanceSchema).max(12),
};

const TextLayerSchema = z.strictObject({
  ...layerCommon,
  primitive: z.literal('text'),
  content: z.strictObject({
    runs: z.array(TextRunSchema).min(1).max(24),
    break_policy: z.enum(['explicit', 'balance']),
  }),
  style: z.strictObject({
    type: TypeTokenSchema,
    color: ColorTokenSchema,
    accent_color: ColorTokenSchema.optional(),
    muted_color: ColorTokenSchema.optional(),
    align: z.enum(['start', 'center', 'end']).optional(),
  }),
});

const ShapeLayerSchema = z.strictObject({
  ...layerCommon,
  primitive: z.literal('shape'),
  shape: z.enum(['rect', 'ellipse']),
  radius: SpaceTokenSchema.optional(),
  fill: ColorTokenSchema.optional(),
  stroke: z.strictObject({ color: ColorTokenSchema, weight: StrokeTokenSchema }).optional(),
});

const ImageLayerSchema = z.strictObject({
  ...layerCommon,
  primitive: z.literal('image'),
  asset: IdSchema,
  fit: z.enum(['cover', 'contain']),
  focus: z
    .union([
      z.strictObject({ region: SlotNameSchema }),
      z.strictObject({
        point: z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
      }),
    ])
    .optional(),
});

const PathLayerSchema = z.strictObject({
  ...layerCommon,
  primitive: z.literal('path'),
  geometry: z.union([
    z.strictObject({ motif: MotifTokenSchema }),
    z.strictObject({
      // Points en unités de grille (colonnes, rangées), jamais en pixels.
      points: z
        .array(z.strictObject({ x: z.number().min(0).max(48), y: z.number().min(0).max(96) }))
        .min(2)
        .max(64),
      closed: z.boolean().optional(),
    }),
  ]),
  style: z.strictObject({
    stroke: ColorTokenSchema,
    weight: StrokeTokenSchema,
    cap: z.enum(['butt', 'round', 'square']).optional(),
  }),
});

export const LayerSchema: z.ZodType<Layer> = z.lazy(() =>
  z.discriminatedUnion('primitive', [
    TextLayerSchema,
    ShapeLayerSchema,
    ImageLayerSchema,
    PathLayerSchema,
    z.strictObject({
      ...layerCommon,
      primitive: z.literal('group'),
      children: z.array(LayerSchema).min(1).max(24),
    }),
    z.strictObject({
      ...layerCommon,
      primitive: z.literal('mask'),
      clip: z.strictObject({ shape: z.enum(['rect', 'ellipse']), radius: SpaceTokenSchema.optional() }),
      children: z.array(LayerSchema).min(1).max(24),
    }),
  ]),
);

/** Axes de variation déclarés par le pattern et figés dans la spec. */
export const VariationSchema = z.strictObject({
  layout_variant: IdSchema.optional(),
  motion_variant: IdSchema.optional(),
  energy: EnergySchema.optional(),
  hierarchy_variant: IdSchema.optional(),
});
export type Variation = z.infer<typeof VariationSchema>;

export const PatternRefSchema = z.strictObject({
  id: DottedIdSchema,
  version: SemVerSchema,
  variation: VariationSchema,
});

export const SceneTimingSchema = z.strictObject({
  anchor: z.union([
    z.strictObject({ voice_segments: z.array(IdSchema).min(1).max(8) }),
    z.strictObject({ duration: DurationSchema }),
  ]),
  lead_in: OffsetSchema.optional(),
  tail: DurationSchema.optional(),
  min_hold: z.union([z.literal('reading'), DurationSchema]).optional(),
});

export const SceneEventSchema = z.strictObject({
  id: IdSchema,
  kind: TemporalEventKindSchema,
  at: AnchorSchema,
});

export const LOCKABLE_PATH = /^(layers|behaviors|events|timing|pattern|background|sound|subtitles)(\.[a-z0-9_]+)*$/;

export const SceneSchema = z.strictObject({
  id: IdSchema,
  pattern: PatternRefSchema,
  purpose: z.enum(['hook', 'tension', 'reveal', 'proof', 'resolution', 'cta', 'signature']),
  locks: z.array(z.string().regex(LOCKABLE_PATH, 'chemin verrouillable attendu')).max(32),
  timing: SceneTimingSchema,
  background: z.strictObject({ fill: ColorTokenSchema }),
  layers: z.array(LayerSchema).min(1).max(24),
  events: z.array(SceneEventSchema).max(16),
  sound: z.strictObject({
    derive_from_events: z.boolean(),
    overrides: z
      .array(
        z.strictObject({
          cue: CueIdSchema,
          at: AnchorSchema,
          gain_db: z.number().min(-40).max(0).optional(),
        }),
      )
      .max(8),
  }),
  subtitles: z.strictObject({ mode: z.enum(['auto', 'off']), reason: z.string().max(120).optional() }),
  transition_out: z.strictObject({ behavior: BehaviorIdSchema, to: IdSchema.optional() }).optional(),
});
export type Scene = z.infer<typeof SceneSchema>;
export type SceneEvent = z.infer<typeof SceneEventSchema>;

export const StyleBindingSchema = z.strictObject({
  kind: z.enum(['style', 'brand', 'series']),
  id: IdSchema,
  version: SemVerSchema,
});
export type StyleBinding = z.infer<typeof StyleBindingSchema>;

export const VoiceSegmentSchema = z.strictObject({
  id: IdSchema,
  text: z.string().min(1).max(400),
  gap_after: DurationSchema.nullable(),
  emphasis: z.array(z.string().min(1).max(64)).max(3),
});
export type VoiceSegment = z.infer<typeof VoiceSegmentSchema>;

export const MotionSceneSpecSchema = z.strictObject({
  schema: z.literal(MOTION_SPEC_SCHEMA),
  schema_version: SemVerSchema,
  spec_id: IdSchema,
  revision: z.number().int().min(1),
  parent_revision: z.number().int().min(1).nullable(),
  created_from: z.strictObject({
    intent_id: IdSchema,
    intent_sha256: Sha256Schema.optional(),
    builder_version: SemVerSchema,
  }),
  locale: LocaleSchema,
  /**
   * Style prévu pour cette spec. Le compilateur reçoit un ResolvedStyle : s'il
   * ne correspond pas à cette liaison, c'est une substitution explicite,
   * tracée dans le manifeste.
   */
  style_binding: StyleBindingSchema,
  format: z.strictObject({
    preset: z.enum(['vertical_9x16']),
    platform_safe_zones: z.array(PlatformSchema).min(1).max(3),
  }),
  system: z.strictObject({ id: DottedIdSchema, version: SemVerSchema }),
  rhythm: z.strictObject({
    curve: DottedIdSchema,
    sections: z
      .array(
        z.strictObject({
          id: IdSchema,
          phase: RhythmPhaseSchema,
          scenes: z.array(IdSchema).min(1).max(12),
        }),
      )
      .min(1)
      .max(12),
  }),
  voice: z.strictObject({
    direction: z.strictObject({
      persona: IdSchema,
      intention: z.string().min(1).max(200),
      tempo: z.enum(['calm', 'measured', 'brisk']),
    }),
    segments: z.array(VoiceSegmentSchema).max(24),
  }),
  scenes: z.array(SceneSchema).min(1).max(16),
});
export type MotionSceneSpec = z.infer<typeof MotionSceneSpecSchema>;

export type { Anchor, Duration };
