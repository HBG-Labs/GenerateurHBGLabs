import { hashVisualDocument } from '@motion-engine/visual-core';
import type { VisualCapability } from '@motion-engine/visual-core';

import { VISUAL_DIRECTOR_CONTRACT_VERSION } from './contracts.ts';
import type { VisualDirectionPlan } from './contracts.ts';

export interface SequenceStrategyDefinition {
  readonly id: string;
  readonly version: string;
  readonly compatible_archetypes: readonly ('EXPLAINER' | 'PRODUCT_DEMO' | 'PROBLEM_SOLUTION' | 'EDITORIAL')[];
  readonly role_shape: readonly VisualDirectionPlan['scenes'][number]['visual_role'][];
  readonly pacing_shape: readonly VisualDirectionPlan['global_pacing'][];
  readonly intensity_shape: readonly ('LOW' | 'MEDIUM' | 'HIGH')[];
  readonly requires_breath: boolean;
  readonly requires_payoff: boolean;
  readonly default_continuity: VisualDirectionPlan['continuity_strategy'];
  readonly default_camera: VisualDirectionPlan['camera_strategy'];
}

export interface MotionIdentityDefinition {
  readonly id: string;
  readonly version: string;
  readonly physics: readonly ('SNAPPY' | 'ELASTIC' | 'HEAVY' | 'FLOATING' | 'PRECISE' | 'SOFT' | 'IMPACTFUL' | 'MECHANICAL')[];
  readonly preferred_bridges: readonly string[];
  readonly preferred_cameras: readonly string[];
  readonly preferred_phrases: readonly string[];
  readonly typography_intensity: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly depth_preference: VisualDirectionPlan['depth_strategy'];
  readonly pacing: VisualDirectionPlan['global_pacing'];
  readonly restraint: VisualDirectionPlan['restraint_level'];
  readonly overlap: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface TechniqueCompositionDefinition {
  readonly id: string;
  readonly version: string;
  readonly status: 'supported' | 'partial' | 'future';
  readonly compatible_roles: readonly VisualDirectionPlan['scenes'][number]['semantic_role'][];
  readonly required_capabilities: readonly VisualCapability[];
  readonly preferred_patterns: readonly string[];
  readonly compatible_phrases: readonly string[];
  readonly preferred_cameras: readonly string[];
  readonly preferred_depth: readonly VisualDirectionPlan['scenes'][number]['depth_intent'][];
  readonly asset_requirements: readonly VisualDirectionPlan['scenes'][number]['asset_intents'][number]['type'][];
  readonly conflicts: readonly string[];
  readonly complexity: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly render_cost: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly alternative_ids: readonly string[];
  readonly provenance: 'P3.2.5_NORMALIZED_LANGUAGE_INDEX';
}

export const SEQUENCE_STRATEGY_DEFINITIONS: readonly SequenceStrategyDefinition[] = Object.freeze([
  {
    id: 'QUESTION_DISCOVERY_EXPLANATION_REVEAL', version: '1.0.0', compatible_archetypes: ['EXPLAINER'],
    role_shape: ['HOOK', 'SETUP', 'EXPLAIN', 'BREATH', 'PAYOFF'], pacing_shape: ['PUNCHY', 'BALANCED', 'BALANCED', 'DELIBERATE', 'BALANCED'],
    intensity_shape: ['HIGH', 'MEDIUM', 'HIGH', 'LOW', 'HIGH'], requires_breath: true, requires_payoff: true,
    default_continuity: 'MOTIF_DRIVEN', default_camera: 'PROGRESSIVE_PUSH',
  },
  {
    id: 'PRODUCT_REVEAL_FEATURES_PAYOFF', version: '1.0.0', compatible_archetypes: ['PRODUCT_DEMO'],
    role_shape: ['HOOK', 'REVEAL', 'PROOF', 'PAYOFF', 'CTA'], pacing_shape: ['PUNCHY', 'BALANCED', 'BRISK', 'DELIBERATE', 'BALANCED'],
    intensity_shape: ['HIGH', 'MEDIUM', 'HIGH', 'MEDIUM', 'LOW'], requires_breath: false, requires_payoff: true,
    default_continuity: 'OBJECT_DRIVEN', default_camera: 'FOLLOW_MOTIF',
  },
  {
    id: 'PROBLEM_TENSION_SOLUTION_PROOF', version: '1.0.0', compatible_archetypes: ['PROBLEM_SOLUTION'],
    role_shape: ['HOOK', 'ESCALATE', 'CONTRAST', 'REVEAL', 'PROOF', 'PAYOFF'], pacing_shape: ['BRISK', 'PUNCHY', 'DELIBERATE', 'BALANCED', 'BALANCED', 'DELIBERATE'],
    intensity_shape: ['MEDIUM', 'HIGH', 'LOW', 'HIGH', 'MEDIUM', 'MEDIUM'], requires_breath: true, requires_payoff: true,
    default_continuity: 'SEMANTIC', default_camera: 'ALTERNATING_STATIC_DYNAMIC',
  },
  {
    id: 'EDITORIAL_STATEMENT_CONTRAST_PAYOFF', version: '1.0.0', compatible_archetypes: ['EDITORIAL'],
    role_shape: ['HOOK', 'SETUP', 'CONTRAST', 'BREATH', 'PAYOFF'], pacing_shape: ['DELIBERATE', 'BALANCED', 'PUNCHY', 'DELIBERATE', 'BALANCED'],
    intensity_shape: ['MEDIUM', 'LOW', 'HIGH', 'LOW', 'MEDIUM'], requires_breath: true, requires_payoff: true,
    default_continuity: 'CUT_DRIVEN', default_camera: 'MOSTLY_STATIC',
  },
  {
    id: 'BUILD_ESCALATE_BREATH_PAYOFF', version: '1.0.0', compatible_archetypes: ['EXPLAINER', 'PRODUCT_DEMO', 'PROBLEM_SOLUTION', 'EDITORIAL'],
    role_shape: ['SETUP', 'ESCALATE', 'BREATH', 'PAYOFF'], pacing_shape: ['BALANCED', 'BRISK', 'DELIBERATE', 'PUNCHY'],
    intensity_shape: ['LOW', 'HIGH', 'LOW', 'HIGH'], requires_breath: true, requires_payoff: true,
    default_continuity: 'SEMANTIC', default_camera: 'ALTERNATING_STATIC_DYNAMIC',
  },
]);

export const MOTION_IDENTITY_DEFINITIONS: readonly MotionIdentityDefinition[] = Object.freeze([
  { id: 'EXPLAINER_CAUSAL', version: '1.0.0', physics: ['PRECISE', 'SOFT'], preferred_bridges: ['PATH_CONTINUE', 'MASK_EXPANSION', 'MATCH_POSITION'], preferred_cameras: ['CAMERA_PUSH_IN', 'CAMERA_SETTLE'], preferred_phrases: ['CAUSAL_PATH_IMPACT', 'OVERLAP_FOLLOW_THROUGH'], typography_intensity: 'MEDIUM', depth_preference: 'PROGRESSIVE_DEPTH', pacing: 'BALANCED', restraint: 'BALANCED', overlap: 'MEDIUM' },
  { id: 'PRODUCT_POLISHED', version: '1.0.0', physics: ['PRECISE', 'SNAPPY'], preferred_bridges: ['ELEMENT_CARRY', 'FRAME_EXPANSION', 'MATCH_SCALE'], preferred_cameras: ['CAMERA_FOLLOW', 'CAMERA_DEPTH_SURGE'], preferred_phrases: ['STAGGERED_REVEAL', 'CAMERA_DEPTH_SURGE'], typography_intensity: 'MEDIUM', depth_preference: 'LAYERED_2_5D', pacing: 'BRISK', restraint: 'BALANCED', overlap: 'MEDIUM' },
  { id: 'EDITORIAL_PRECISE', version: '1.0.0', physics: ['PRECISE', 'HEAVY'], preferred_bridges: ['TYPE_CONTINUE', 'MATCH_SCALE'], preferred_cameras: ['CAMERA_SETTLE'], preferred_phrases: ['TYPE_TRACKING_IMPACT', 'VISUAL_BREATH'], typography_intensity: 'HIGH', depth_preference: 'FLAT_EDITORIAL', pacing: 'DELIBERATE', restraint: 'HIGH', overlap: 'LOW' },
  { id: 'SPATIAL_CONTINUOUS', version: '1.0.0', physics: ['FLOATING', 'SOFT'], preferred_bridges: ['CAMERA_CONTINUE', 'ELEMENT_CARRY', 'ZOOM_THROUGH'], preferred_cameras: ['CAMERA_CONTINUOUS_ZOOM', 'CAMERA_DEPTH_SURGE'], preferred_phrases: ['CAMERA_DEPTH_SURGE', 'FRAME_PORTAL_TRANSFORM'], typography_intensity: 'LOW', depth_preference: 'LAYERED_2_5D', pacing: 'BALANCED', restraint: 'LOW', overlap: 'HIGH' },
  { id: 'PUNCHY_SOCIAL', version: '1.0.0', physics: ['SNAPPY', 'IMPACTFUL'], preferred_bridges: ['TYPE_SCALE_THROUGH', 'FRAME_EXPANSION'], preferred_cameras: ['CAMERA_PUNCH_IN'], preferred_phrases: ['TYPE_TRACKING_IMPACT', 'IMPACT_CUT'], typography_intensity: 'HIGH', depth_preference: 'MIXED', pacing: 'PUNCHY', restraint: 'LOW', overlap: 'HIGH' },
]);

const technique = (value: TechniqueCompositionDefinition): TechniqueCompositionDefinition => Object.freeze(value);

export const TECHNIQUE_COMPOSITION_DEFINITIONS: readonly TechniqueCompositionDefinition[] = Object.freeze([
  technique({ id: 'TYPE_STATE_TO_TRANSITION', version: '1.0.0', status: 'supported', compatible_roles: ['TYPOGRAPHIC_STATEMENT', 'PAYOFF'], required_capabilities: ['TEXT', 'DYNAMIC_TYPOGRAPHY', 'MASK', 'CLIP', 'TRANSFORM'], preferred_patterns: ['TYPE_TRACKING_BURST', 'TYPE_WEIGHT_PULSE', 'TYPE_WIDTH_EXPANSION', 'WORD_TO_MASK'], compatible_phrases: ['TYPE_TRACKING_IMPACT', 'TYPE_AXIS_PULSE', 'WORD_MASK_BRIDGE'], preferred_cameras: ['CAMERA_SETTLE'], preferred_depth: ['FLAT', 'SUBTLE'], asset_requirements: [], conflicts: [], complexity: 'HIGH', render_cost: 'HIGH', alternative_ids: ['BRAND_MOTION_RECIPE_SYSTEM'], provenance: 'P3.2.5_NORMALIZED_LANGUAGE_INDEX' }),
  technique({ id: 'PRODUCT_FEATURE_TO_VISUAL_METAPHOR', version: '1.0.0', status: 'future', compatible_roles: ['PRODUCT'], required_capabilities: ['IMAGE', 'GROUP', 'TRANSFORM'], preferred_patterns: ['DEPTH_PARALLAX_HERO'], compatible_phrases: ['CAMERA_DEPTH_SURGE'], preferred_cameras: ['CAMERA_DEPTH_SURGE'], preferred_depth: ['LAYERED'], asset_requirements: ['PRODUCT'], conflicts: [], complexity: 'HIGH', render_cost: 'HIGH', alternative_ids: ['PERSISTENT_GUIDE_THROUGH_PRODUCT'], provenance: 'P3.2.5_NORMALIZED_LANGUAGE_INDEX' }),
  technique({ id: 'PERSISTENT_GUIDE_THROUGH_PRODUCT', version: '1.0.0', status: 'supported', compatible_roles: ['PRODUCT', 'UI'], required_capabilities: ['GROUP', 'TRANSFORM', 'OPACITY'], preferred_patterns: ['DEPTH_PARALLAX_HERO', 'STAGGER_GRID_REVEAL'], compatible_phrases: ['STAGGERED_REVEAL', 'OVERLAP_FOLLOW_THROUGH'], preferred_cameras: ['CAMERA_FOLLOW', 'CAMERA_SETTLE'], preferred_depth: ['SUBTLE', 'LAYERED'], asset_requirements: ['UI_SURFACE'], conflicts: [], complexity: 'MEDIUM', render_cost: 'MEDIUM', alternative_ids: [], provenance: 'P3.2.5_NORMALIZED_LANGUAGE_INDEX' }),
  technique({ id: 'UI_DEPTH_CAMERA_FOCUS', version: '1.0.0', status: 'supported', compatible_roles: ['UI', 'PRODUCT'], required_capabilities: ['GROUP', 'SHAPE', 'TRANSFORM', 'OPACITY'], preferred_patterns: ['STAGGER_GRID_REVEAL', 'DEPTH_PARALLAX_HERO', 'FOREGROUND_OCCLUSION'], compatible_phrases: ['STAGGERED_REVEAL', 'CAMERA_DEPTH_SURGE'], preferred_cameras: ['CAMERA_DEPTH_SURGE', 'CAMERA_FOLLOW'], preferred_depth: ['LAYERED', 'FOREGROUND_OCCLUSION'], asset_requirements: ['UI_SURFACE'], conflicts: [], complexity: 'HIGH', render_cost: 'MEDIUM', alternative_ids: ['PERSISTENT_GUIDE_THROUGH_PRODUCT'], provenance: 'P3.2.5_NORMALIZED_LANGUAGE_INDEX' }),
  technique({ id: 'POSTER_DECONSTRUCT_RECOMPOSE', version: '1.0.0', status: 'future', compatible_roles: ['TYPOGRAPHIC_STATEMENT', 'ENVIRONMENT'], required_capabilities: ['IMAGE', 'MASK', 'GROUP', 'TRANSFORM'], preferred_patterns: ['TYPE_BEHIND_SUBJECT', 'FOREGROUND_OCCLUSION'], compatible_phrases: ['OCCLUSION_REVEAL'], preferred_cameras: ['CAMERA_SETTLE'], preferred_depth: ['LAYERED'], asset_requirements: ['IMAGE', 'SUBJECT_CUTOUT'], conflicts: [], complexity: 'HIGH', render_cost: 'HIGH', alternative_ids: ['TYPE_STATE_TO_TRANSITION'], provenance: 'P3.2.5_NORMALIZED_LANGUAGE_INDEX' }),
  technique({ id: 'MIXED_MEDIA_COHERENCE_SYSTEM', version: '1.0.0', status: 'future', compatible_roles: ['ENVIRONMENT'], required_capabilities: ['IMAGE', 'GROUP', 'COLOR'], preferred_patterns: ['IMAGE_FULL_BLEED_REVEAL'], compatible_phrases: ['OCCLUSION_REVEAL'], preferred_cameras: ['CAMERA_PUSH_IN'], preferred_depth: ['LAYERED'], asset_requirements: ['IMAGE', 'TEXTURE'], conflicts: [], complexity: 'HIGH', render_cost: 'HIGH', alternative_ids: [], provenance: 'P3.2.5_NORMALIZED_LANGUAGE_INDEX' }),
  technique({ id: 'DATA_TO_CHARACTER_STORY', version: '1.0.0', status: 'partial', compatible_roles: ['DATA', 'DIAGRAM'], required_capabilities: ['TEXT', 'SHAPE', 'PATH', 'PATH_PROGRESS'], preferred_patterns: ['DIAGRAM_CAUSAL_FLOW', 'VECTOR_ASSEMBLY'], compatible_phrases: ['CAUSAL_PATH_IMPACT'], preferred_cameras: ['CAMERA_SETTLE'], preferred_depth: ['FLAT', 'SUBTLE'], asset_requirements: ['PROCEDURAL_VECTOR'], conflicts: [], complexity: 'MEDIUM', render_cost: 'MEDIUM', alternative_ids: ['CAUSAL_EXPLAINER'], provenance: 'P3.2.5_NORMALIZED_LANGUAGE_INDEX' }),
  technique({ id: 'ABSTRACT_SCIENCE_WORLD_TRANSITION', version: '1.0.0', status: 'partial', compatible_roles: ['PHENOMENON', 'DIAGRAM', 'ENVIRONMENT'], required_capabilities: ['SHAPE', 'PATH', 'MASK', 'GROUP', 'TRANSFORM'], preferred_patterns: ['DIAGRAM_CAUSAL_FLOW', 'SHAPE_TO_MASK', 'DEPTH_PARALLAX_HERO'], compatible_phrases: ['CAUSAL_PATH_IMPACT', 'SEMANTIC_MORPH_CHAIN'], preferred_cameras: ['CAMERA_DEPTH_SURGE'], preferred_depth: ['LAYERED', 'FOREGROUND_OCCLUSION'], asset_requirements: ['PROCEDURAL_VECTOR'], conflicts: [], complexity: 'HIGH', render_cost: 'MEDIUM', alternative_ids: ['CAUSAL_EXPLAINER'], provenance: 'P3.2.5_NORMALIZED_LANGUAGE_INDEX' }),
  technique({ id: 'BRAND_MOTION_RECIPE_SYSTEM', version: '1.0.0', status: 'supported', compatible_roles: ['TYPOGRAPHIC_STATEMENT', 'PAYOFF', 'ENVIRONMENT'], required_capabilities: ['TEXT', 'SHAPE', 'TRANSFORM', 'OPACITY'], preferred_patterns: ['KINETIC_WORD_IMPACT', 'EDITORIAL_SPLIT'], compatible_phrases: ['HERO_WORD_IMPACT', 'VISUAL_BREATH'], preferred_cameras: ['CAMERA_SETTLE'], preferred_depth: ['FLAT', 'SUBTLE'], asset_requirements: ['PROCEDURAL_VECTOR'], conflicts: [], complexity: 'MEDIUM', render_cost: 'LOW', alternative_ids: [], provenance: 'P3.2.5_NORMALIZED_LANGUAGE_INDEX' }),
  technique({ id: 'TRUE_3D_PRODUCT_REVEAL', version: '1.0.0', status: 'future', compatible_roles: ['PRODUCT'], required_capabilities: ['FUTURE_TRUE_3D'], preferred_patterns: [], compatible_phrases: [], preferred_cameras: [], preferred_depth: ['LAYERED'], asset_requirements: ['THREE_D_OBJECT'], conflicts: [], complexity: 'HIGH', render_cost: 'HIGH', alternative_ids: ['PERSISTENT_GUIDE_THROUGH_PRODUCT'], provenance: 'P3.2.5_NORMALIZED_LANGUAGE_INDEX' }),
  technique({ id: 'BUILD_COMPLEXITY_BREATH_PAYOFF', version: '1.0.0', status: 'supported', compatible_roles: ['PAYOFF', 'PHENOMENON', 'TYPOGRAPHIC_STATEMENT', 'PRODUCT', 'UI', 'DIAGRAM'], required_capabilities: ['TRANSFORM', 'OPACITY'], preferred_patterns: ['VECTOR_ASSEMBLY', 'KINETIC_WORD_IMPACT'], compatible_phrases: ['OVERLAP_FOLLOW_THROUGH', 'VISUAL_BREATH'], preferred_cameras: ['CAMERA_SETTLE'], preferred_depth: ['FLAT', 'SUBTLE', 'LAYERED'], asset_requirements: [], conflicts: [], complexity: 'MEDIUM', render_cost: 'MEDIUM', alternative_ids: [], provenance: 'P3.2.5_NORMALIZED_LANGUAGE_INDEX' }),
  technique({ id: 'CAUSAL_EXPLAINER', version: '1.0.0', status: 'supported', compatible_roles: ['PHENOMENON', 'DIAGRAM', 'DATA'], required_capabilities: ['PATH', 'PATH_PROGRESS', 'SHAPE', 'TRANSFORM'], preferred_patterns: ['DIAGRAM_CAUSAL_FLOW', 'VECTOR_ASSEMBLY'], compatible_phrases: ['CAUSAL_PATH_IMPACT', 'OVERLAP_FOLLOW_THROUGH'], preferred_cameras: ['CAMERA_PUSH_IN', 'CAMERA_SETTLE'], preferred_depth: ['SUBTLE', 'LAYERED'], asset_requirements: ['PROCEDURAL_VECTOR'], conflicts: [], complexity: 'MEDIUM', render_cost: 'MEDIUM', alternative_ids: [], provenance: 'P3.2.5_NORMALIZED_LANGUAGE_INDEX' }),
]);

function byId<T extends { id: string }>(definitions: readonly T[]): ReadonlyMap<string, T> {
  return new Map(definitions.map((entry) => [entry.id, entry]));
}

export const SEQUENCE_STRATEGY_REGISTRY = byId(SEQUENCE_STRATEGY_DEFINITIONS);
export const MOTION_IDENTITY_REGISTRY = byId(MOTION_IDENTITY_DEFINITIONS);
export const TECHNIQUE_COMPOSITION_REGISTRY = byId(TECHNIQUE_COMPOSITION_DEFINITIONS);

export const DIRECTOR_DEFAULTS = Object.freeze({
  version: '0.1.0',
  precedence: ['ENGINE_CONSTRAINT', 'EXPLICIT_SCENE_DIRECTION', 'TECHNIQUE_COMPOSITION', 'MOTION_IDENTITY', 'SEQUENCE_STRATEGY'],
  layout_by_focus: {
    TYPE: 'ASYMMETRIC_HERO', SUBJECT: 'LAYERED_POSTER', PRODUCT: 'CENTER_HERO', UI: 'DEPTH_STACK', DATA: 'EDITORIAL_SPLIT',
    DIAGRAM: 'RADIAL_FOCUS', PHENOMENON: 'DIAGONAL_FLOW', IMAGE: 'FULL_BLEED', OBJECT: 'CENTER_HERO',
  },
  camera_intensity: { LOW: 0.18, MEDIUM: 0.42, HIGH: 0.68 },
  depth_parallax: { BACKGROUND: 0.18, MIDGROUND: 0.72, FOREGROUND: 1.35 },
});

export const DIRECTOR_REGISTRY_FINGERPRINTS = Object.freeze({
  contract: hashVisualDocument({ version: VISUAL_DIRECTOR_CONTRACT_VERSION, defaults: DIRECTOR_DEFAULTS }),
  sequence_strategies: hashVisualDocument(SEQUENCE_STRATEGY_DEFINITIONS),
  motion_identities: hashVisualDocument(MOTION_IDENTITY_DEFINITIONS),
  technique_compositions: hashVisualDocument(TECHNIQUE_COMPOSITION_DEFINITIONS),
});

export const VISUAL_DIRECTOR_FINGERPRINT = hashVisualDocument({
  version: VISUAL_DIRECTOR_CONTRACT_VERSION,
  registries: DIRECTOR_REGISTRY_FINGERPRINTS,
  defaults: DIRECTOR_DEFAULTS,
});
