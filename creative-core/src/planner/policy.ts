import type { NarrativeRole, PlannerAssetKind } from './contracts.ts';

export interface RoleIntentProfile {
  readonly visual_mode: string;
  readonly motion_character: string;
  readonly typography_role: 'display' | 'headline' | 'body' | 'caption' | 'statistic' | 'quote' | 'cta';
  readonly typography_character: string;
  readonly transition_kind: string;
  readonly asset_kind: PlannerAssetKind;
  readonly audio_cue: 'none' | 'impact' | 'whoosh' | 'rise' | 'hit' | 'transition' | 'reveal' | 'ambience';
}

export interface PlanningPolicy {
  readonly default_profile: RoleIntentProfile;
  readonly role_profiles: Readonly<Partial<Record<NarrativeRole, RoleIntentProfile>>>;
  readonly tone_motion: Readonly<Record<string, string>>;
}

const base: RoleIntentProfile = {
  visual_mode: 'mixed',
  motion_character: 'restrained',
  typography_role: 'body',
  typography_character: 'editorial',
  transition_kind: 'continuation',
  asset_kind: 'none',
  audio_cue: 'none',
};

const defaultPlanningPolicy: PlanningPolicy = {
  default_profile: base,
  role_profiles: {
    hook: { ...base, visual_mode: 'text_dominant', motion_character: 'punchy', typography_role: 'headline', typography_character: 'bold', transition_kind: 'cut', audio_cue: 'impact' },
    premise: { ...base, visual_mode: 'mixed', asset_kind: 'illustration' },
    context: { ...base, visual_mode: 'mixed', asset_kind: 'background' },
    problem: { ...base, visual_mode: 'text_dominant', motion_character: 'precise', typography_role: 'headline' },
    consequence: { ...base, visual_mode: 'image_dominant', motion_character: 'dramatic', asset_kind: 'illustration', audio_cue: 'rise' },
    escalation: { ...base, visual_mode: 'image_dominant', motion_character: 'energetic', transition_kind: 'energetic', asset_kind: 'illustration', audio_cue: 'rise' },
    explanation: { ...base, visual_mode: 'diagram', motion_character: 'precise', typography_character: 'technical', asset_kind: 'diagram' },
    example: { ...base, visual_mode: 'mixed', asset_kind: 'illustration' },
    item: { ...base, visual_mode: 'text_dominant', motion_character: 'precise', typography_role: 'headline' },
    strongest_item: { ...base, visual_mode: 'text_dominant', motion_character: 'punchy', typography_role: 'display', typography_character: 'bold', audio_cue: 'hit' },
    comparison_a: { ...base, visual_mode: 'comparison', asset_kind: 'image' },
    comparison_b: { ...base, visual_mode: 'comparison', asset_kind: 'image' },
    contrast: { ...base, visual_mode: 'comparison', motion_character: 'precise', typography_role: 'headline' },
    solution: { ...base, visual_mode: 'mixed', motion_character: 'precise', asset_kind: 'illustration' },
    demonstration: { ...base, visual_mode: 'image_dominant', motion_character: 'precise', asset_kind: 'image' },
    action: { ...base, visual_mode: 'image_dominant', motion_character: 'precise', asset_kind: 'image', audio_cue: 'whoosh' },
    result: { ...base, visual_mode: 'image_dominant', motion_character: 'restrained', asset_kind: 'image', audio_cue: 'hit' },
    proof: { ...base, visual_mode: 'statistic', typography_role: 'statistic', typography_character: 'technical', asset_kind: 'diagram' },
    tension: { ...base, visual_mode: 'abstract', motion_character: 'dramatic', transition_kind: 'dramatic', asset_kind: 'background', audio_cue: 'rise' },
    partial_information: { ...base, visual_mode: 'mixed', motion_character: 'restrained', transition_kind: 'reveal' },
    reveal: { ...base, visual_mode: 'image_dominant', motion_character: 'dramatic', typography_role: 'headline', typography_character: 'expressive', transition_kind: 'reveal', asset_kind: 'illustration', audio_cue: 'reveal' },
    payoff: { ...base, visual_mode: 'text_dominant', motion_character: 'restrained', typography_role: 'headline', typography_character: 'bold', transition_kind: 'smooth', audio_cue: 'hit' },
    takeaway: { ...base, visual_mode: 'text_dominant', motion_character: 'restrained', typography_role: 'headline', transition_kind: 'smooth' },
    cta: { ...base, visual_mode: 'text_dominant', motion_character: 'restrained', typography_role: 'cta', typography_character: 'bold', transition_kind: 'smooth' },
  },
  tone_motion: {
    dramatic: 'dramatic',
    energetic: 'energetic',
    playful: 'playful',
    precise: 'precise',
    cinematic: 'cinematic',
    restrained: 'restrained',
    subtle: 'subtle',
  },
};

export const DEFAULT_PLANNING_POLICY: Readonly<PlanningPolicy> = Object.freeze(defaultPlanningPolicy);

export function profileForRole(policy: PlanningPolicy, role: NarrativeRole): RoleIntentProfile {
  return policy.role_profiles[role] ?? policy.default_profile;
}
