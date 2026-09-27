import { z } from 'zod';

/** Identifiant stable d'un objet de spec (scène, calque, comportement, segment…). */
export const IdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,63}$/, 'identifiant attendu : minuscules, chiffres, « _ »');
export type Id = z.infer<typeof IdSchema>;

/** Identifiant hiérarchique (pattern, système) : `statement.interrupt`. */
export const DottedIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/, 'identifiant pointé attendu');

export const SemVerSchema = z.string().regex(/^\d+\.\d+\.\d+$/, 'version semver attendue');

export const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/, 'empreinte sha256 hexadécimale attendue');

export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'couleur #RRGGBB attendue');

/** Comportement de la grammaire de mouvement : `REVEAL_TEXT`. */
export const BehaviorIdSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{1,47}$/, 'identifiant de comportement attendu (MAJUSCULES)');

/** Signal sonore abstrait nommé par un style : `SOFT_TICK`, `LOW_HIT`. */
export const CueIdSchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,47}$/, 'identifiant de cue attendu');

/**
 * Référence à un jeton du profil de marque. La spec n'écrit JAMAIS une valeur
 * (couleur, taille, police) : elle nomme un rôle que le profil résout.
 */
export const TOKEN_NAMESPACES = ['color', 'type', 'space', 'stroke', 'motif', 'ease', 'logo'] as const;
export type TokenNamespace = (typeof TOKEN_NAMESPACES)[number];

export function tokenRefSchema(namespace: TokenNamespace) {
  return z
    .string()
    .regex(
      new RegExp(`^${namespace}\\.[a-z0-9_]+(\\.[a-z0-9_]+)*$`),
      `jeton « ${namespace}.* » attendu`,
    );
}

export const ColorTokenSchema = tokenRefSchema('color');
export const TypeTokenSchema = tokenRefSchema('type');
export const SpaceTokenSchema = tokenRefSchema('space');
export const StrokeTokenSchema = tokenRefSchema('stroke');
export const MotifTokenSchema = tokenRefSchema('motif');
export const EaseTokenSchema = tokenRefSchema('ease');
export const LogoTokenSchema = tokenRefSchema('logo');

export const RHYTHM_PHASES = ['CALM', 'BUILD', 'ACCELERATE', 'INTERRUPTION', 'REVEAL', 'RESOLUTION'] as const;
export const RhythmPhaseSchema = z.enum(RHYTHM_PHASES);
export type RhythmPhase = z.infer<typeof RhythmPhaseSchema>;

export const TEMPORAL_EVENT_KINDS = [
  'BEAT',
  'HOLD',
  'BREATH',
  'REVEAL',
  'ACCENT',
  'IMPACT',
  'INTERRUPTION',
  'TRANSITION',
  'RESOLVE',
] as const;
export const TemporalEventKindSchema = z.enum(TEMPORAL_EVENT_KINDS);
export type TemporalEventKind = z.infer<typeof TemporalEventKindSchema>;

/** Étiquette de langue BCP 47 (sous-ensemble courant) : `fr-FR`, `en`, `pt-BR`, `zh-Hant-TW`. */
export const LocaleSchema = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Z][a-z]{3})?(-(?:[A-Z]{2}|\d{3}))?$/, 'étiquette de langue BCP 47 attendue');

/** Natures d'assets que le moteur sait référencer. Aucune n'est privilégiée par le cœur. */
export const ASSET_KINDS = [
  'photo',
  'illustration',
  'screenshot',
  'video',
  'svg',
  'logo',
  'diagram',
  'map',
  'chart',
  'generated_image',
] as const;
export const AssetKindSchema = z.enum(ASSET_KINDS);
export type AssetKind = z.infer<typeof AssetKindSchema>;

/**
 * Référence de fichier résolue par l'appelant, jamais un chemin absolu :
 * `pack:` = relatif au dossier du document, `lib:` = relatif à la
 * bibliothèque partagée fournie à l'exécution.
 */
export const ResourceRefSchema = z
  .string()
  .regex(/^(pack|lib):(?!.*\.\.)(?![/\\])[A-Za-z0-9_\-./]+$/, 'référence « pack:… » ou « lib:… » attendue');
export type ResourceRef = z.infer<typeof ResourceRefSchema>;

/** Référence figée vers un autre document : identité et empreinte exacte. */
export const DocumentRefSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type DocumentRef = z.infer<typeof DocumentRefSchema>;

export const ENERGY_LEVELS = ['low', 'medium', 'high'] as const;
export const EnergySchema = z.enum(ENERGY_LEVELS);

export const PLATFORMS = ['tiktok', 'reels', 'shorts'] as const;
export const PlatformSchema = z.enum(PLATFORMS);
export type Platform = z.infer<typeof PlatformSchema>;

/**
 * Durée sémantique. Les millisecondes entières sont autorisées pour les locks
 * explicites ; les frames restent exclusivement une sortie du compilateur.
 */
export const DurationSchema = z.union([
  z.strictObject({ ms: z.number().int().min(0).max(120_000) }),
  z.strictObject({ beats: z.number().finite().min(0).max(64) }),
  z.strictObject({ breaths: z.number().finite().min(0).max(16) }),
]);
export type Duration = z.infer<typeof DurationSchema>;

/** Décalage symbolique signé, relatif à une ancre. */
export const OffsetSchema = z.union([
  z.strictObject({ ms: z.number().int().min(-120_000).max(120_000) }),
  z.strictObject({ beats: z.number().finite().min(-16).max(16) }),
  z.strictObject({ breaths: z.number().finite().min(-4).max(4) }),
]);
export type Offset = z.infer<typeof OffsetSchema>;

const offset = { offset: OffsetSchema.optional() };

/**
 * Ancre temporelle : le moment où quelque chose se produit, exprimé par
 * rapport à la scène, à la voix réelle ou à un autre événement.
 */
export const AnchorSchema = z.union([
  z.strictObject({ event: z.enum(['scene.start', 'scene.end']), ...offset }),
  z.strictObject({
    voice_segment: z.strictObject({ segment: IdSchema, edge: z.enum(['start', 'end']) }),
    ...offset,
  }),
  z.strictObject({
    voice_word: z.strictObject({
      segment: IdSchema,
      match: z.string().min(1).max(64),
      occurrence: z.number().int().min(1).max(16).optional(),
    }),
    ...offset,
  }),
  z.strictObject({ after: IdSchema, ...offset }),
  z.strictObject({ with: IdSchema, ...offset }),
  z.strictObject({
    semantic: z.enum(['SCENE_START', 'SCENE_END', 'AFTER_PREVIOUS', 'BEFORE_NEXT']),
    ...offset,
  }),
  z.strictObject({
    layer: z.strictObject({ id: IdSchema, relation: z.enum(['WITH_LAYER', 'AFTER_LAYER']) }),
    ...offset,
  }),
]);
export type Anchor = z.infer<typeof AnchorSchema>;

/** Placement explicite sur la grille de marque (surcharge d'un slot). */
export const GridPlacementSchema = z.strictObject({
  col: z.number().int().min(1).max(48),
  row: z.number().int().min(1).max(96),
  col_span: z.number().int().min(1).max(48),
  row_span: z.number().int().min(1).max(96),
  align_x: z.enum(['start', 'center', 'end']).optional(),
  align_y: z.enum(['start', 'center', 'end']).optional(),
});
export type GridPlacement = z.infer<typeof GridPlacementSchema>;
