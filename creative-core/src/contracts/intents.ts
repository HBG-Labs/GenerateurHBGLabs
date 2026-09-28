import { z } from 'zod';

import {
  AnchorRelationSchema,
  DesiredDurationSchema,
  DottedIdSchema,
  LanguageSchema,
  LocaleSchema,
  SemanticTagSchema,
  StableIdSchema,
  UnitIntervalSchema,
} from './common.ts';

export const KNOWN_CREATIVE_INTENTS = [
  'explain',
  'surprise',
  'curiosity',
  'educate',
  'demonstrate',
  'compare',
  'reveal',
  'storytelling',
  'problem_solution',
  'list',
  'question',
  'hypothetical',
] as const;

/** Vocabulaires recommandés, volontairement non fermés par le schéma. */
export const KNOWN_NARRATIVE_ROLES = ['hook', 'setup', 'development', 'escalation', 'reveal', 'payoff', 'cta'] as const;
export const KNOWN_VISUAL_MODES = [
  'text_dominant',
  'image_dominant',
  'mixed',
  'abstract',
  'diagram',
  'statistic',
  'quote',
  'comparison',
  'reveal',
  'background_visual',
  'iconographic',
] as const;
export const KNOWN_MOTION_CHARACTERS = [
  'subtle',
  'energetic',
  'dramatic',
  'playful',
  'precise',
  'cinematic',
  'restrained',
  'punchy',
] as const;
export const KNOWN_PACING_CHARACTERS = ['slow', 'measured', 'medium', 'fast', 'aggressive'] as const;
export const KNOWN_TYPOGRAPHY_CHARACTERS = ['bold', 'quiet', 'editorial', 'technical', 'expressive'] as const;
export const KNOWN_TRANSITION_KINDS = ['cut', 'smooth', 'energetic', 'dramatic', 'reveal', 'continuation'] as const;

export const CreativeIntentSchema = z.strictObject({
  primary: SemanticTagSchema,
  secondary: z.array(SemanticTagSchema).max(8),
  objective: z.string().min(1).max(2_000),
  core_message: z.string().min(1).max(4_000),
  desired_outcome: z.string().min(1).max(2_000),
  constraints: z.array(z.string().min(1).max(1_000)).max(32),
});
export type CreativeIntent = z.infer<typeof CreativeIntentSchema>;

export const AudienceIntentSchema = z.strictObject({
  audience: z.string().min(1).max(2_000),
  knowledge_level: z.enum(['unaware', 'beginner', 'intermediate', 'advanced', 'expert', 'mixed']),
  desired_reaction: z.string().min(1).max(1_000),
  tone: z.array(SemanticTagSchema).min(1).max(8),
  language: LanguageSchema,
  locale: LocaleSchema,
});
export type AudienceIntent = z.infer<typeof AudienceIntentSchema>;

export const TargetIntentSchema = z.strictObject({
  format: z.enum(['vertical_short_form', 'square', 'landscape']),
  /** ID fourni par un consommateur externe ; aucune logique de plateforme ne vit ici. */
  preset_id: DottedIdSchema.optional(),
  duration: DesiredDurationSchema,
});
export type TargetIntent = z.infer<typeof TargetIntentSchema>;

export const FactualContentSchema = z.strictObject({
  id: StableIdSchema,
  statement: z.string().min(1).max(10_000),
  classification: z.enum(['factual_claim', 'creative_statement']),
  uncertainty: z.enum(['none', 'low', 'medium', 'high', 'unknown']),
  source_requirement: z.enum(['none', 'recommended', 'required']),
  source_slot: StableIdSchema.optional(),
});
export type FactualContent = z.infer<typeof FactualContentSchema>;

export const SpokenContentSchema = z.strictObject({
  id: StableIdSchema,
  text: z.string().min(1).max(100_000),
  delivery: SemanticTagSchema.optional(),
});
export type SpokenContent = z.infer<typeof SpokenContentSchema>;

export const OnScreenContentSchema = z.strictObject({
  id: StableIdSchema,
  text: z.string().min(1).max(100_000),
  semantic_role: SemanticTagSchema,
});
export type OnScreenContent = z.infer<typeof OnScreenContentSchema>;

export const SceneContentSchema = z.strictObject({
  semantic_meaning: z.string().min(1).max(10_000).optional(),
  spoken: z.array(SpokenContentSchema).max(2_048),
  on_screen: z.array(OnScreenContentSchema).max(2_048),
  claims: z.array(FactualContentSchema).max(2_048),
});
export type SceneContent = z.infer<typeof SceneContentSchema>;

export const AssetIntentSchema = z.strictObject({
  id: StableIdSchema,
  slot: StableIdSchema,
  kind: z.enum(['image', 'icon', 'illustration', 'background', 'none']),
  required: z.boolean(),
  purpose: z.string().min(1).max(2_000),
  content_description: z.string().min(1).max(4_000).optional(),
  constraints: z.array(SemanticTagSchema).max(16),
});
export type AssetIntent = z.infer<typeof AssetIntentSchema>;

export const VisualElementIntentSchema = z.strictObject({
  id: StableIdSchema,
  kind: SemanticTagSchema,
  hierarchy: z.enum(['primary', 'secondary', 'supporting', 'decorative']),
  purpose: z.string().min(1).max(2_000),
  asset_slot: StableIdSchema.optional(),
});
export type VisualElementIntent = z.infer<typeof VisualElementIntentSchema>;

export const VisualHierarchyRelationSchema = z.strictObject({
  id: StableIdSchema,
  from: StableIdSchema,
  to: StableIdSchema,
  relation: SemanticTagSchema,
});
export type VisualHierarchyRelation = z.infer<typeof VisualHierarchyRelationSchema>;

export const VisualIntentSchema = z.strictObject({
  mode: SemanticTagSchema,
  focal_element: StableIdSchema.optional(),
  elements: z.array(VisualElementIntentSchema).max(2_048),
  hierarchy_relationships: z.array(VisualHierarchyRelationSchema).max(4_096),
  direction: z.string().min(1).max(4_000).optional(),
});
export type VisualIntent = z.infer<typeof VisualIntentSchema>;

export const MotionIntentSchema = z.strictObject({
  character: SemanticTagSchema,
  intensity: UnitIntervalSchema,
  enter_emphasis: SemanticTagSchema.optional(),
  accent_emphasis: SemanticTagSchema.optional(),
  settle_behavior: SemanticTagSchema.optional(),
  exit_character: SemanticTagSchema.optional(),
});
export type MotionIntent = z.infer<typeof MotionIntentSchema>;

export const TypographyTreatmentSchema = z.strictObject({
  id: StableIdSchema,
  content_id: StableIdSchema,
  role: z.enum(['display', 'headline', 'body', 'caption', 'statistic', 'quote', 'cta']),
  character: SemanticTagSchema,
  emphasis: UnitIntervalSchema,
});
export type TypographyTreatment = z.infer<typeof TypographyTreatmentSchema>;

export const TypographyIntentSchema = z.strictObject({
  character: SemanticTagSchema,
  treatments: z.array(TypographyTreatmentSchema).max(2_048),
});
export type TypographyIntent = z.infer<typeof TypographyIntentSchema>;

export const AudioEventIntentSchema = z.strictObject({
  id: StableIdSchema,
  kind: z.enum(['narration', 'music', 'sfx', 'silence', 'emphasis', 'ambience']),
  description: z.string().min(1).max(2_000),
  relation: AnchorRelationSchema.optional(),
});
export type AudioEventIntent = z.infer<typeof AudioEventIntentSchema>;

const presence = z.enum(['required', 'optional', 'none']);
export const AudioIntentSchema = z.strictObject({
  narration: presence,
  music: presence,
  sfx: presence,
  ambience: presence,
  direction: z.string().min(1).max(4_000).optional(),
  events: z.array(AudioEventIntentSchema).max(2_048),
});
export type AudioIntent = z.infer<typeof AudioIntentSchema>;

export const SubtitleIntentSchema = z.strictObject({
  required: z.boolean(),
  emphasis_intent: SemanticTagSchema,
  density: z.enum(['sparse', 'standard', 'dense']),
  presentation_style: SemanticTagSchema,
});
export type SubtitleIntent = z.infer<typeof SubtitleIntentSchema>;

export const TransitionIntentSchema = z.strictObject({
  kind: SemanticTagSchema,
  intensity: UnitIntervalSchema,
  continuity: z.string().min(1).max(1_000).optional(),
});
export type TransitionIntent = z.infer<typeof TransitionIntentSchema>;

export const PacingIntentSchema = z.strictObject({
  character: SemanticTagSchema,
  information_density: UnitIntervalSchema,
  desired_duration: DesiredDurationSchema.optional(),
});
export type PacingIntent = z.infer<typeof PacingIntentSchema>;

export const HookIntentSchema = z.strictObject({
  id: StableIdSchema,
  concept: z.string().min(1).max(4_000),
  role: SemanticTagSchema,
  priority: z.number().int().min(1).max(100),
  desired_duration: DesiredDurationSchema,
  intensity: UnitIntervalSchema,
  first_scene_id: StableIdSchema,
});
export type HookIntent = z.infer<typeof HookIntentSchema>;

export const NarrativeSectionSchema = z.strictObject({
  id: StableIdSchema,
  role: SemanticTagSchema,
  purpose: z.string().min(1).max(4_000),
  scene_ids: z.array(StableIdSchema).min(1).max(2_048),
});
export type NarrativeSection = z.infer<typeof NarrativeSectionSchema>;

export const NarrativePlanSchema = z.strictObject({
  hook: HookIntentSchema.optional(),
  sections: z.array(NarrativeSectionSchema).min(1).max(2_048),
  cta: z
    .strictObject({
      id: StableIdSchema,
      purpose: z.string().min(1).max(2_000),
      text: z.string().min(1).max(2_000).optional(),
      required: z.boolean(),
    })
    .optional(),
});
export type NarrativePlan = z.infer<typeof NarrativePlanSchema>;
