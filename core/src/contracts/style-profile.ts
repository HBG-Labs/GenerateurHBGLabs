import { z } from 'zod';

import {
  BehaviorIdSchema,
  ColorTokenSchema,
  CueIdSchema,
  DottedIdSchema,
  HexColorSchema,
  IdSchema,
  RHYTHM_PHASES,
  ResourceRefSchema,
  SemVerSchema,
  Sha256Schema,
  TEMPORAL_EVENT_KINDS,
  TypeTokenSchema,
} from './common.ts';

export const STYLE_PROFILE_SCHEMA = 'creative-style-profile';
export const STYLE_PROFILE_VERSION = '0.1.0';

/** Clé de jeton sans espace de noms : `surface.primary`, `display.xl`. */
export const TokenKeySchema = z.string().regex(/^[a-z0-9_]+(\.[a-z0-9_]+)*$/, 'clé de jeton attendue');

const Px = z.number().finite().min(0).max(4000);

export const FontFileSchema = z.strictObject({
  weight: z.number().int().min(100).max(900),
  style: z.enum(['normal', 'italic']),
  src: ResourceRefSchema,
  sha256: Sha256Schema,
  /** Coordonnées OpenType explicites ; aucune variation implicite n'est autorisée. */
  axes: z.record(z.string().regex(/^[A-Za-z0-9]{4}$/), z.number().finite()).optional(),
  /** Une substitution n'est valide que si elle est déclarée dans le style. */
  fallback_for: TokenKeySchema.optional(),
});
export type FontFile = z.infer<typeof FontFileSchema>;

export const TypeStyleSchema = z.strictObject({
  family: TokenKeySchema,
  weight: z.number().int().min(100).max(900),
  size: Px,
  line_height: z.number().min(0.7).max(2.5),
  tracking_em: z.number().min(-0.2).max(0.5),
  case: z.enum(['upper', 'as_is']),
  min_size: Px.optional(),
  fallback_role: TypeTokenSchema.optional(),
});
export type TypeStyle = z.infer<typeof TypeStyleSchema>;

export const EasingSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('linear') }),
  z.strictObject({
    type: z.literal('bezier'),
    p: z.tuple([z.number().min(0).max(1), z.number(), z.number().min(0).max(1), z.number()]),
  }),
  z.strictObject({
    type: z.literal('spring'),
    damping: z.number().min(1).max(200),
    stiffness: z.number().min(1).max(1000),
    mass: z.number().min(0.1).max(10),
    /** Vitesse initiale générique en unités de progression par seconde. */
    initial_velocity: z.number().finite().min(-100).max(100).optional(),
  }),
]);
export type Easing = z.infer<typeof EasingSchema>;

const InsetsSchema = z.strictObject({ top: Px, right: Px, bottom: Px, left: Px });

export const MotifSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('line'),
    /** Longueur en colonnes de grille ; épaisseur par rôle de trait. */
    length_cols: z.number().min(0.25).max(48),
    weight: TokenKeySchema,
    cap: z.enum(['butt', 'round', 'square']),
  }),
]);

export const BehaviorPolicySchema = z.strictObject({
  allowed: z.boolean(),
  variants: z.array(IdSchema).max(16).optional(),
  param_bounds: z.record(z.string(), z.strictObject({ min: z.number(), max: z.number() })).optional(),
});

const Weighted = z.strictObject({ id: DottedIdSchema, weight: z.number().min(0).max(1) });

export const CreativeStyleProfileSchema = z.strictObject({
  schema: z.literal(STYLE_PROFILE_SCHEMA),
  schema_version: SemVerSchema,
  id: IdSchema,
  version: SemVerSchema,
  name: z.string().min(1).max(80),
  /** `authored` : écrit par une personne ; `generated` : produit par le Creative Director. */
  origin: z.enum(['authored', 'generated']),
  role_contract: SemVerSchema,
  /** Les tailles en pixels sont exprimées sur ce canevas de référence. */
  reference_canvas: z.strictObject({ width: z.number().int().min(1), height: z.number().int().min(1) }),

  palette: z.record(TokenKeySchema, HexColorSchema),
  typography: z.strictObject({
    families: z.record(
      TokenKeySchema,
      z.strictObject({ css_name: z.string().regex(/^[a-z0-9-]+$/), files: z.array(FontFileSchema).min(1) }),
    ),
    scale: z.record(TokenKeySchema, TypeStyleSchema),
  }),
  grid: z.strictObject({
    columns: z.number().int().min(1).max(48),
    rows: z.number().int().min(1).max(96),
    margin: InsetsSchema,
    gutter: Px,
  }),
  space: z.record(TokenKeySchema, Px),
  strokes: z.record(TokenKeySchema, Px),
  motifs: z.record(TokenKeySchema, MotifSchema),

  composition_personality: z.strictObject({
    preferred_systems: z.array(Weighted).max(16),
    negative_space: z.enum(['dense', 'balanced', 'airy']),
    alignment: z.enum(['start', 'center', 'mixed']),
    asymmetry: z.number().min(0).max(1),
  }),

  motion_personality: z.strictObject({
    easings: z.record(TokenKeySchema, EasingSchema),
    max_overshoot: z.number().min(0).max(0.2),
    behaviors: z.record(BehaviorIdSchema, BehaviorPolicySchema),
  }),

  rhythm_personality: z.strictObject({
    tempo: z.strictObject({
      beat_ms: z.strictObject(
        Object.fromEntries(RHYTHM_PHASES.map((phase) => [phase, z.number().int().min(150).max(2000)])) as Record<
          (typeof RHYTHM_PHASES)[number],
          z.ZodNumber
        >,
      ),
      breath_ms: z.number().int().min(100).max(2000),
    }),
    reading: z.strictObject({
      ms_per_word: z.number().int().min(100).max(1000),
      min_hold_ms: z.number().int().min(200).max(5000),
    }),
    preferred_curves: z.array(Weighted).max(16),
  }),

  subtitle_style: z.strictObject({
    type: TypeTokenSchema,
    color: ColorTokenSchema,
    backdrop: ColorTokenSchema.nullable(),
    max_chars_per_line: z.number().int().min(12).max(60),
    max_lines: z.number().int().min(1).max(3),
    active_word: z.enum(['none', 'underline', 'weight']),
  }),

  sound_personality: z.strictObject({
    event_cues: z.partialRecord(z.enum(TEMPORAL_EVENT_KINDS), CueIdSchema),
    cues: z.record(
      CueIdSchema,
      z.strictObject({ src: ResourceRefSchema.nullable(), sha256: Sha256Schema.nullable(), gain_db: z.number().min(-40).max(0) }),
    ),
    max_cues_per_video: z.number().int().min(0).max(24),
  }),

  voice_personality: z.strictObject({
    description: z.string().min(1).max(400),
  }),

  image_treatment: z.strictObject({
    grade: z.enum(['none', 'warm', 'cool', 'mono', 'duotone']),
    contrast: z.number().min(-1).max(1),
    grain: z.number().min(0).max(1),
    duotone: z.strictObject({ dark: ColorTokenSchema, light: ColorTokenSchema }).nullable(),
  }),

  illustration_treatment: z.strictObject({
    stroke: z.enum(['none', 'thin', 'bold']),
    fill: z.enum(['none', 'flat', 'gradient']),
    palette_roles: z.array(ColorTokenSchema).max(12),
  }),

  transition_preferences: z.strictObject({
    preferred: z.array(BehaviorIdSchema).max(16),
    avoid: z.array(BehaviorIdSchema).max(16),
  }),

  forbidden: z.strictObject({
    behaviors: z.array(BehaviorIdSchema).max(64),
    style_tags: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)).max(64),
  }),
});
export type CreativeStyleProfile = z.infer<typeof CreativeStyleProfileSchema>;

/** Sections qu'une série peut surcharger. Les interdits ne se surchargent jamais : ils s'additionnent. */
export const OVERRIDABLE_STYLE_SECTIONS = [
  'palette',
  'typography',
  'grid',
  'space',
  'strokes',
  'motifs',
  'composition_personality',
  'motion_personality',
  'rhythm_personality',
  'subtitle_style',
  'sound_personality',
  'voice_personality',
  'image_treatment',
  'illustration_treatment',
  'transition_preferences',
] as const;
