import { z } from 'zod';

import { CueIdSchema, HexColorSchema, IdSchema, SemVerSchema, Sha256Schema } from './common.ts';
import { EasingSchema } from './style-profile.ts';

export const RENDER_PLAN_SCHEMA = 'render-plan';
export const RENDER_PLAN_VERSION = '0.1.0';

const Frame = z.number().int().min(0);
const Px = z.number().finite();

export const BoxSchema = z.strictObject({ x: Px, y: Px, w: z.number().min(0), h: z.number().min(0) });
export type Box = z.infer<typeof BoxSchema>;

/** Propriétés animables. Un nouveau type de rendu (morphing, uniformes de shader) ajoute ici une propriété. */
export const TRACK_PROPERTIES = [
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
export const TrackPropertySchema = z.enum(TRACK_PROPERTIES);
export type TrackProperty = z.infer<typeof TrackPropertySchema>;

export const KeyframeSchema = z.strictObject({
  frame: Frame,
  value: z.union([z.number().finite(), HexColorSchema]),
  /** Courbe appliquée entre cette clé et la suivante. */
  ease: EasingSchema.optional(),
});
export type Keyframe = z.infer<typeof KeyframeSchema>;

export const TrackSchema = z.strictObject({
  property: TrackPropertySchema,
  target: z.strictObject({ run: IdSchema.optional(), line: z.number().int().min(0).optional() }).optional(),
  keys: z.array(KeyframeSchema).min(1),
  /** Comportement d'origine, pour la traçabilité et la régénération sélective. */
  source: IdSchema,
});
export type Track = z.infer<typeof TrackSchema>;

export const PlanRunSchema = z.strictObject({
  id: IdSchema,
  text: z.string(),
  font: IdSchema,
  weight: z.number().int(),
  size: z.number().positive(),
  tracking_px: Px,
  color: HexColorSchema,
});
export type PlanRun = z.infer<typeof PlanRunSchema>;

/** Ligne déjà coupée par le compilateur : le moteur de rendu ne recoupe jamais. */
export const PlanLineSchema = z.strictObject({
  runs: z.array(PlanRunSchema).min(1),
  /** Haut de la boîte de ligne, relatif à la boîte du calque. */
  top: Px,
  height: z.number().positive(),
  /** Largeur mesurée par le compilateur (null tant que la mesure n'existe pas). */
  measured_width: z.number().min(0).nullable(),
});
export type PlanLine = z.infer<typeof PlanLineSchema>;

interface PlanNodeCommon {
  id: string;
  box: Box;
  /** Origine des transformations, relative à la boîte (0..1). */
  origin: { x: number; y: number };
  opacity: number;
  tracks: Track[];
}

export interface PlanTextNode extends PlanNodeCommon {
  type: 'text';
  align: 'start' | 'center' | 'end';
  lines: PlanLine[];
}
export interface PlanShapeNode extends PlanNodeCommon {
  type: 'shape';
  shape: 'rect' | 'ellipse';
  radius: number;
  fill: string | null;
  stroke: { color: string; width: number } | null;
}
export interface PlanImageNode extends PlanNodeCommon {
  type: 'image';
  asset: string;
  fit: 'cover' | 'contain';
  /** Recadrage dans l'image source, en pixels source. */
  crop: Box;
}
export interface PlanPathNode extends PlanNodeCommon {
  type: 'path';
  /** Tracé SVG en pixels, relatif à la boîte. */
  d: string;
  stroke: { color: string; width: number; cap: 'butt' | 'round' | 'square' };
}
export interface PlanGroupNode extends PlanNodeCommon {
  type: 'group';
  children: PlanNode[];
}
export interface PlanMaskNode extends PlanNodeCommon {
  type: 'mask';
  clip: { shape: 'rect' | 'ellipse'; radius: number };
  children: PlanNode[];
}
export type PlanNode = PlanTextNode | PlanShapeNode | PlanImageNode | PlanPathNode | PlanGroupNode | PlanMaskNode;

const nodeCommon = {
  id: IdSchema,
  box: BoxSchema,
  origin: z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  opacity: z.number().min(0).max(1),
  tracks: z.array(TrackSchema),
};

export const PlanNodeSchema: z.ZodType<PlanNode> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.strictObject({
      ...nodeCommon,
      type: z.literal('text'),
      align: z.enum(['start', 'center', 'end']),
      lines: z.array(PlanLineSchema).min(1),
    }),
    z.strictObject({
      ...nodeCommon,
      type: z.literal('shape'),
      shape: z.enum(['rect', 'ellipse']),
      radius: z.number().min(0),
      fill: HexColorSchema.nullable(),
      stroke: z.strictObject({ color: HexColorSchema, width: z.number().positive() }).nullable(),
    }),
    z.strictObject({
      ...nodeCommon,
      type: z.literal('image'),
      asset: IdSchema,
      fit: z.enum(['cover', 'contain']),
      crop: BoxSchema,
    }),
    z.strictObject({
      ...nodeCommon,
      type: z.literal('path'),
      d: z.string().min(1),
      stroke: z.strictObject({
        color: HexColorSchema,
        width: z.number().positive(),
        cap: z.enum(['butt', 'round', 'square']),
      }),
    }),
    z.strictObject({ ...nodeCommon, type: z.literal('group'), children: z.array(PlanNodeSchema) }),
    z.strictObject({
      ...nodeCommon,
      type: z.literal('mask'),
      clip: z.strictObject({ shape: z.enum(['rect', 'ellipse']), radius: z.number().min(0) }),
      children: z.array(PlanNodeSchema),
    }),
  ]),
);

export const PlanSceneSchema = z.strictObject({
  id: IdSchema,
  from: Frame,
  /** Frame de fin exclusive. */
  to: Frame,
  background: HexColorSchema,
  nodes: z.array(PlanNodeSchema),
});
export type PlanScene = z.infer<typeof PlanSceneSchema>;

export const RenderPlanSchema = z.strictObject({
  schema: z.literal(RENDER_PLAN_SCHEMA),
  schema_version: SemVerSchema,
  spec: z.strictObject({ spec_id: IdSchema, revision: z.number().int().min(1), sha256: Sha256Schema }),
  /** Style résolu utilisé : empreinte du ResolvedStyle et mode. */
  style: z.strictObject({ mode: z.enum(['creative', 'brand', 'series']), sha256: Sha256Schema }),
  compiler_version: SemVerSchema,
  canvas: z.strictObject({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().int().positive(),
    duration_frames: z.number().int().positive(),
  }),
  fonts: z.array(
    z.strictObject({
      id: IdSchema,
      css_name: z.string(),
      weight: z.number().int(),
      style: z.enum(['normal', 'italic']),
      file: z.string(),
      sha256: Sha256Schema,
    }),
  ),
  assets: z.array(
    z.strictObject({
      ref: IdSchema,
      file: z.string(),
      sha256: Sha256Schema,
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
  ),
  scenes: z.array(PlanSceneSchema).min(1),
});
export type RenderPlan = z.infer<typeof RenderPlanSchema>;

/** Montage audio : la voix n'est jamais étirée, seuls les silences entre segments changent. */
export const AudioPlanSchema = z.strictObject({
  schema: z.literal('audio-plan'),
  schema_version: SemVerSchema,
  duration_s: z.number().positive(),
  voice: z
    .strictObject({
      file: z.string(),
      sha256: Sha256Schema,
      segments: z.array(
        z.strictObject({
          id: IdSchema,
          source_start_s: z.number().min(0),
          source_end_s: z.number().min(0),
          start_s: z.number().min(0),
        }),
      ),
    })
    .nullable(),
  cues: z.array(
    z.strictObject({
      cue: CueIdSchema,
      t_s: z.number().min(0),
      gain_db: z.number().max(0),
      source_event: IdSchema,
    }),
  ),
  target_lufs: z.number().min(-30).max(-8),
  true_peak_dbtp: z.number().min(-6).max(0),
});
export type AudioPlan = z.infer<typeof AudioPlanSchema>;

export const SubtitlePlanSchema = z.strictObject({
  schema: z.literal('subtitle-plan'),
  schema_version: SemVerSchema,
  cues: z.array(
    z.strictObject({
      scene: IdSchema,
      start_s: z.number().min(0),
      end_s: z.number().min(0),
      lines: z.array(z.string()).min(1).max(3),
    }),
  ),
});
export type SubtitlePlan = z.infer<typeof SubtitlePlanSchema>;
