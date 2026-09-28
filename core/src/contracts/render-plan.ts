import { z } from 'zod';

import { CueIdSchema, HexColorSchema, IdSchema, SemVerSchema, Sha256Schema } from './common.ts';
import { EasingSchema } from './style-profile.ts';
import { AssetProvenanceSchema, NormalizedPointSchema, QualityPreflightReportSchema, SemanticRegionSchema } from './visual.ts';

export const RENDER_PLAN_SCHEMA = 'render-plan';
export const RENDER_PLAN_VERSION = '0.3.0';
export const AUDIO_PLAN_VERSION = '0.2.0';
export const SUBTITLE_PLAN_VERSION = '0.2.0';

export const RENDER_CAPABILITIES = [
  'TEXT', 'SHAPE', 'IMAGE', 'PATH', 'MASK', 'GROUP', 'TRANSFORM', 'OPACITY', 'CLIP',
  'PATH_PROGRESS', 'COLOR', 'VARIABLE_FONT', 'CUT',
] as const;
export const RenderCapabilitySchema = z.enum(RENDER_CAPABILITIES);
export type RenderCapability = z.infer<typeof RenderCapabilitySchema>;
export const RendererRequirementsSchema = z.strictObject({
  capabilities: z.array(RenderCapabilitySchema),
  fingerprint: Sha256Schema,
}).superRefine((requirements, context) => {
  const normalized = [...new Set(requirements.capabilities)].sort();
  if (JSON.stringify(normalized) !== JSON.stringify(requirements.capabilities)) context.addIssue({ code: 'custom', path: ['capabilities'], message: 'capabilities attendues triées et uniques' });
});

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
  id: IdSchema,
  property: TrackPropertySchema,
  target: z.strictObject({ run: IdSchema.optional(), line: z.number().int().min(0).optional() }).optional(),
  keys: z.array(KeyframeSchema).min(1),
  /** Comportement d'origine, pour la traçabilité et la régénération sélective. */
  source: IdSchema,
});
export type Track = z.infer<typeof TrackSchema>;

export const PlanRunSchema = z.strictObject({
  id: IdSchema,
  source_run: IdSchema,
  source_text: z.string(),
  formatted_text: z.string(),
  text: z.string(),
  font: IdSchema,
  weight: z.number().int(),
  size: z.number().positive(),
  tracking_px: Px,
  color: HexColorSchema,
  role: z.enum(['base', 'accent', 'muted']),
  measured_width: z.number().min(0),
  glyphs: z.array(
    z.strictObject({
      glyph_id: z.number().int().min(0),
      cluster: z.number().int().min(0),
      x: Px,
      y: Px,
      x_advance: Px,
      y_advance: Px,
      x_offset: Px,
      y_offset: Px,
    }),
  ),
});
export type PlanRun = z.infer<typeof PlanRunSchema>;

/** Ligne déjà coupée par le compilateur : le moteur de rendu ne recoupe jamais. */
export const PlanLineSchema = z.strictObject({
  runs: z.array(PlanRunSchema).min(1),
  /** Haut de la boîte de ligne, relatif à la boîte du calque. */
  top: Px,
  height: z.number().positive(),
  measured_width: z.number().min(0),
  ascent: z.number().min(0),
  descent: z.number().min(0),
  line_gap: z.number().min(0),
  baseline: z.number().min(0),
});
export type PlanLine = z.infer<typeof PlanLineSchema>;

interface PlanNodeCommon {
  id: string;
  box: Box;
  /** Origine des transformations, relative à la boîte (0..1). */
  origin: { x: number; y: number };
  opacity: number;
  transform: { translate_x: number; translate_y: number; scale: number; rotate: number };
  must_be_safe: boolean;
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
  destination: Box;
  focal_point: { x: number; y: number };
  semantic_regions: z.infer<typeof SemanticRegionSchema>[];
  treatment: {
    grade: 'none' | 'warm' | 'cool' | 'mono' | 'duotone';
    contrast: number;
    grain: number;
    duotone: { dark: string; light: string } | null;
  };
}
export interface PlanPathNode extends PlanNodeCommon {
  type: 'path';
  /** Tracé SVG en pixels, relatif à la boîte. */
  d: string;
  stroke: { color: string; width: number; cap: 'butt' | 'round' | 'square'; join: 'miter' | 'round' | 'bevel' };
  progress: number;
}
export interface PlanGroupNode extends PlanNodeCommon {
  type: 'group';
  children: PlanNode[];
}
export interface PlanMaskNode extends PlanNodeCommon {
  type: 'mask';
  clip: {
    shape: 'rect' | 'ellipse';
    radius: number;
    mode: 'clip' | 'reveal' | 'wipe';
    direction: 'left_to_right' | 'right_to_left' | 'top_to_bottom' | 'bottom_to_top';
  };
  children: PlanNode[];
}
export type PlanNode = PlanTextNode | PlanShapeNode | PlanImageNode | PlanPathNode | PlanGroupNode | PlanMaskNode;

const nodeCommon = {
  id: IdSchema,
  box: BoxSchema,
  origin: z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  opacity: z.number().min(0).max(1),
  transform: z.strictObject({
    translate_x: Px,
    translate_y: Px,
    scale: z.number().finite().positive(),
    rotate: Px,
  }),
  must_be_safe: z.boolean(),
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
      destination: BoxSchema,
      focal_point: NormalizedPointSchema,
      semantic_regions: z.array(SemanticRegionSchema).max(32),
      treatment: z.strictObject({
        grade: z.enum(['none', 'warm', 'cool', 'mono', 'duotone']),
        contrast: z.number().min(-1).max(1),
        grain: z.number().min(0).max(1),
        duotone: z.strictObject({ dark: HexColorSchema, light: HexColorSchema }).nullable(),
      }),
    }),
    z.strictObject({
      ...nodeCommon,
      type: z.literal('path'),
      d: z.string().min(1),
      stroke: z.strictObject({
        color: HexColorSchema,
        width: z.number().positive(),
        cap: z.enum(['butt', 'round', 'square']),
        join: z.enum(['miter', 'round', 'bevel']),
      }),
      progress: z.number().min(0).max(1),
    }),
    z.strictObject({ ...nodeCommon, type: z.literal('group'), children: z.array(PlanNodeSchema) }),
    z.strictObject({
      ...nodeCommon,
      type: z.literal('mask'),
      clip: z.strictObject({
        shape: z.enum(['rect', 'ellipse']),
        radius: z.number().min(0),
        mode: z.enum(['clip', 'reveal', 'wipe']),
        direction: z.enum(['left_to_right', 'right_to_left', 'top_to_bottom', 'bottom_to_top']),
      }),
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
  transition_out: z
    .strictObject({
      kind: z.enum(['cut', 'tracks']),
      behavior: z.strictObject({ id: z.string(), version: SemVerSchema }),
      to_scene: IdSchema,
      at_frame: Frame,
    })
    .nullable(),
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
  safe_zone: BoxSchema,
  requirements: RendererRequirementsSchema,
  provenance: z.strictObject({
    timing_source: z.enum(['explicit_duration', 'voice_timestamps', 'fallback_frames']),
    behavior_registry_fingerprint: Sha256Schema,
    text_engine: z.strictObject({
      name: z.literal('harfbuzzjs'),
      package_version: SemVerSchema,
      native_version: z.string().min(1),
      shaping_configuration: z.strictObject({
        direction: z.enum(['ltr', 'rtl', 'auto']),
        kerning: z.boolean(),
        ligatures: z.boolean(),
        cluster_level: z.string(),
      }),
    }),
  }),
  fonts: z.array(
    z.strictObject({
      id: IdSchema,
      css_name: z.string(),
      weight: z.number().int(),
      style: z.enum(['normal', 'italic']),
      file: z.string(),
      sha256: Sha256Schema,
      axes: z.record(z.string(), z.number().finite()),
      supported_axes: z.record(
        z.string(),
        z.strictObject({ min: z.number().finite(), default: z.number().finite(), max: z.number().finite() }),
      ),
      substituted_for: z.string().nullable(),
    }),
  ),
  assets: z.array(
    z.strictObject({
      ref: IdSchema,
      file: z.string(),
      sha256: Sha256Schema,
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      mime: z.enum(['image/png', 'image/jpeg']),
      provenance: AssetProvenanceSchema,
      semantic_regions: z.array(SemanticRegionSchema).max(32),
      transformations: z.array(z.string().min(1).max(160)),
    }),
  ),
  scenes: z.array(PlanSceneSchema).min(1),
  preflight: QualityPreflightReportSchema,
});
export type RenderPlan = z.infer<typeof RenderPlanSchema>;

const FrameRangeSchema = z.strictObject({ start_frame: Frame, end_frame: Frame });

/** Contrat audio intégralement minuté. P1.5 ne produit aucun fichier voix. */
export const AudioPlanSchema = z.strictObject({
  schema: z.literal('audio-plan'),
  schema_version: z.literal(AUDIO_PLAN_VERSION),
  timing_source: z.enum(['estimated', 'aligned']),
  fps: z.number().int().positive(),
  duration_frames: z.number().int().positive(),
  voice_segments: z.array(z.strictObject({
    id: IdSchema,
    source_segment_id: IdSchema,
    source_text: z.string().min(1),
    ...FrameRangeSchema.shape,
    timing_source: z.enum(['estimated', 'aligned']),
    asset: z.strictObject({ file: z.string(), sha256: Sha256Schema }).nullable(),
    gain_db: z.number().min(-40).max(12),
    priority: z.number().int().min(0).max(100),
  })),
  silences: z.array(z.strictObject({ id: IdSchema, ...FrameRangeSchema.shape, reason: z.enum(['lead_in', 'gap', 'tail', 'authored']) })),
  sfx_cues: z.array(z.strictObject({
    id: IdSchema, cue: CueIdSchema, at_frame: Frame, duration_frames: z.number().int().min(0),
    gain_db: z.number().min(-40).max(12), priority: z.number().int().min(0).max(100),
    source_event: IdSchema, asset: z.strictObject({ file: z.string(), sha256: Sha256Schema }).nullable(),
  })),
  music_regions: z.array(z.strictObject({
    id: IdSchema, ...FrameRangeSchema.shape, gain_db: z.number().min(-40).max(12),
    priority: z.number().int().min(0).max(100), asset: z.strictObject({ file: z.string(), sha256: Sha256Schema }).nullable(),
    ducking: z.strictObject({ enabled: z.boolean(), target: z.enum(['voice', 'sfx']), attenuation_db: z.number().min(-40).max(0) }),
  })),
  mix: z.strictObject({ target_lufs: z.number().min(-30).max(-8), true_peak_dbtp: z.number().min(-6).max(0) }),
}).superRefine((plan, context) => {
  const ranges = [...plan.voice_segments, ...plan.silences, ...plan.music_regions];
  ranges.forEach((range, index) => {
    if (range.end_frame <= range.start_frame || range.end_frame > plan.duration_frames) context.addIssue({ code: 'custom', path: ['ranges', index], message: 'intervalle audio invalide' });
  });
  plan.sfx_cues.forEach((cue, index) => {
    if (cue.at_frame >= plan.duration_frames) context.addIssue({ code: 'custom', path: ['sfx_cues', index, 'at_frame'], message: 'cue hors durée' });
  });
});
export type AudioPlan = z.infer<typeof AudioPlanSchema>;

export const SubtitlePlanSchema = z.strictObject({
  schema: z.literal('subtitle-plan'),
  schema_version: z.literal(SUBTITLE_PLAN_VERSION),
  timing_source: z.enum(['estimated', 'aligned']),
  fps: z.number().int().positive(),
  duration_frames: z.number().int().positive(),
  safe_region: BoxSchema,
  style_role: IdSchema,
  segments: z.array(z.strictObject({
    id: IdSchema,
    scene_id: IdSchema,
    source_segment_id: IdSchema,
    ...FrameRangeSchema.shape,
    box: BoxSchema,
    font: IdSchema,
    font_size: z.number().positive(),
    line_height: z.number().positive(),
    minimum_size: z.number().positive(),
    lines: z.array(PlanLineSchema).min(1).max(3),
  })),
}).superRefine((plan, context) => {
  plan.segments.forEach((segment, index) => {
    if (segment.end_frame <= segment.start_frame || segment.end_frame > plan.duration_frames) context.addIssue({ code: 'custom', path: ['segments', index], message: 'intervalle de sous-titre invalide' });
    if (segment.font_size < segment.minimum_size) context.addIssue({ code: 'custom', path: ['segments', index, 'font_size'], message: 'taille sous le minimum lisible' });
  });
});
export type SubtitlePlan = z.infer<typeof SubtitlePlanSchema>;
