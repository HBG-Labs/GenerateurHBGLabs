import { hashVisualDocument } from './canonical.ts';
import { P32_VISUAL_GRAMMAR_VERSION, VISUAL_GRAMMAR_VERSION } from './contracts.ts';
import type { VisualCapability, VisualEntityKind } from './contracts.ts';
import { DEFAULT_VISUAL_LIMITS } from './limits.ts';

export type SupportLevel = 'supported' | 'compatible_simplified' | 'future';

export interface VisualPatternDefinition {
  readonly id: string;
  readonly version: string;
  readonly category: 'typography' | 'composition' | 'shape' | 'mask' | 'path' | 'depth' | 'transition';
  readonly support: SupportLevel;
  readonly required_capabilities: readonly VisualCapability[];
  readonly allowed_targets: readonly VisualEntityKind[];
  readonly parameters: readonly string[];
  readonly conflicts: readonly string[];
  readonly exclusive_control: readonly string[];
  readonly complexity: 1 | 2 | 3;
  readonly intensity_range: readonly ['LOW' | 'MEDIUM' | 'HIGH', 'LOW' | 'MEDIUM' | 'HIGH'];
  readonly resolver: string;
}

const pattern = (value: VisualPatternDefinition): VisualPatternDefinition => Object.freeze(value);

export const VISUAL_PATTERN_DEFINITIONS: readonly VisualPatternDefinition[] = Object.freeze([
  pattern({ id: 'KINETIC_WORD_IMPACT', version: '1.0.0', category: 'typography', support: 'supported', required_capabilities: ['TEXT', 'MASK', 'TRANSFORM', 'OPACITY'], allowed_targets: ['text'], parameters: ['direction', 'intensity', 'mask'], conflicts: [], exclusive_control: ['text_enter'], complexity: 2, intensity_range: ['MEDIUM', 'HIGH'], resolver: 'p1.kinetic_word_impact' }),
  pattern({ id: 'TYPE_BEHIND_SUBJECT', version: '1.0.0', category: 'composition', support: 'supported', required_capabilities: ['TEXT', 'SHAPE', 'GROUP', 'TRANSFORM'], allowed_targets: ['text', 'shape', 'group'], parameters: ['subject', 'type'], conflicts: [], exclusive_control: ['z_order'], complexity: 2, intensity_range: ['LOW', 'HIGH'], resolver: 'p1.type_behind_subject' }),
  pattern({ id: 'IMAGE_FULL_BLEED_REVEAL', version: '1.0.0', category: 'mask', support: 'supported', required_capabilities: ['IMAGE', 'MASK', 'CLIP'], allowed_targets: ['image', 'mask'], parameters: ['direction'], conflicts: [], exclusive_control: ['clip'], complexity: 2, intensity_range: ['LOW', 'HIGH'], resolver: 'p1.full_bleed_mask' }),
  pattern({ id: 'SHAPE_EXPANSION_TRANSITION', version: '1.0.0', category: 'transition', support: 'compatible_simplified', required_capabilities: ['SHAPE', 'MASK', 'CLIP'], allowed_targets: ['shape', 'mask'], parameters: ['direction'], conflicts: [], exclusive_control: ['clip'], complexity: 2, intensity_range: ['MEDIUM', 'HIGH'], resolver: 'p1.mask_wipe_bridge' }),
  pattern({ id: 'CONTINUOUS_ZOOM_BRIDGE', version: '1.0.0', category: 'transition', support: 'compatible_simplified', required_capabilities: ['GROUP', 'TRANSFORM'], allowed_targets: ['group', 'image'], parameters: ['scale'], conflicts: [], exclusive_control: ['camera_scale'], complexity: 2, intensity_range: ['LOW', 'HIGH'], resolver: 'p1.matched_camera_push' }),
  pattern({ id: 'EDITORIAL_SPLIT', version: '1.0.0', category: 'composition', support: 'supported', required_capabilities: ['GROUP', 'TEXT', 'SHAPE'], allowed_targets: ['group', 'text', 'shape', 'image'], parameters: ['ratio', 'alignment'], conflicts: ['CENTER_HERO_COMPOSITION'], exclusive_control: ['layout'], complexity: 2, intensity_range: ['LOW', 'MEDIUM'], resolver: 'p1.editorial_split' }),
  pattern({ id: 'STAGGER_GRID_REVEAL', version: '1.0.0', category: 'composition', support: 'supported', required_capabilities: ['GROUP', 'OPACITY', 'TRANSFORM'], allowed_targets: ['group', 'shape', 'text'], parameters: ['direction', 'cascade'], conflicts: [], exclusive_control: ['grid_enter'], complexity: 2, intensity_range: ['MEDIUM', 'HIGH'], resolver: 'p1.staggered_layers' }),
  pattern({ id: 'PATH_FOLLOW_ELEMENT', version: '1.0.0', category: 'path', support: 'future', required_capabilities: ['PATH', 'FUTURE_PATH_FOLLOW'], allowed_targets: ['shape', 'group'], parameters: ['path'], conflicts: [], exclusive_control: ['position'], complexity: 3, intensity_range: ['LOW', 'HIGH'], resolver: 'future.path_follow' }),
  pattern({ id: 'PATH_DRAW_EXPLANATION', version: '1.0.0', category: 'path', support: 'supported', required_capabilities: ['PATH', 'PATH_PROGRESS'], allowed_targets: ['path'], parameters: ['direction'], conflicts: [], exclusive_control: ['path_progress'], complexity: 1, intensity_range: ['LOW', 'HIGH'], resolver: 'p1.draw_path' }),
  pattern({ id: 'MASK_TO_NEXT_SCENE', version: '1.0.0', category: 'transition', support: 'compatible_simplified', required_capabilities: ['MASK', 'CLIP', 'GROUP'], allowed_targets: ['mask'], parameters: ['direction'], conflicts: [], exclusive_control: ['clip'], complexity: 2, intensity_range: ['MEDIUM', 'HIGH'], resolver: 'p1.matched_mask_boundary' }),
  pattern({ id: 'FOREGROUND_OCCLUSION', version: '1.0.0', category: 'depth', support: 'supported', required_capabilities: ['GROUP', 'SHAPE', 'TEXT'], allowed_targets: ['group', 'shape', 'text', 'image'], parameters: ['foreground'], conflicts: [], exclusive_control: ['z_order'], complexity: 2, intensity_range: ['LOW', 'MEDIUM'], resolver: 'p1.layer_order_occlusion' }),
  pattern({ id: 'DEPTH_PARALLAX_HERO', version: '1.0.0', category: 'depth', support: 'supported', required_capabilities: ['GROUP', 'TRANSFORM'], allowed_targets: ['group', 'shape', 'text', 'image'], parameters: ['depth'], conflicts: [], exclusive_control: ['depth_camera'], complexity: 3, intensity_range: ['LOW', 'HIGH'], resolver: 'p1.depth_scaled_camera_push' }),
  pattern({ id: 'TYPE_AS_TRANSITION', version: '1.0.0', category: 'transition', support: 'compatible_simplified', required_capabilities: ['TEXT', 'MASK', 'CLIP'], allowed_targets: ['text', 'mask'], parameters: ['keyword'], conflicts: [], exclusive_control: ['clip'], complexity: 2, intensity_range: ['MEDIUM', 'HIGH'], resolver: 'p1.type_mask_boundary' }),
  pattern({ id: 'MATCH_POSITION_BRIDGE', version: '1.0.0', category: 'transition', support: 'supported', required_capabilities: ['TRANSFORM'], allowed_targets: ['shape', 'text', 'group', 'image'], parameters: ['anchor'], conflicts: [], exclusive_control: ['bridge_position'], complexity: 1, intensity_range: ['LOW', 'MEDIUM'], resolver: 'p1.matched_boundary_state' }),
  pattern({ id: 'MATCH_SCALE_BRIDGE', version: '1.0.0', category: 'transition', support: 'supported', required_capabilities: ['TRANSFORM'], allowed_targets: ['shape', 'text', 'group', 'image'], parameters: ['anchor'], conflicts: [], exclusive_control: ['bridge_scale'], complexity: 1, intensity_range: ['LOW', 'MEDIUM'], resolver: 'p1.matched_boundary_state' }),
  pattern({ id: 'CAMERA_FOLLOW_ANCHOR', version: '1.0.0', category: 'depth', support: 'compatible_simplified', required_capabilities: ['GROUP', 'TRANSFORM'], allowed_targets: ['group', 'image'], parameters: ['anchor'], conflicts: [], exclusive_control: ['camera_scale'], complexity: 2, intensity_range: ['LOW', 'HIGH'], resolver: 'p1.focus_or_push' }),
]);

export interface MotionPhraseDefinition {
  readonly id: string;
  readonly version: string;
  readonly phases: readonly ('ENTER' | 'ACCENT' | 'SETTLE' | 'HOLD' | 'EXIT')[];
  readonly compatible_targets: readonly VisualEntityKind[];
  readonly required_capabilities: readonly VisualCapability[];
  readonly resolver: string;
  readonly max_targets: number;
}

export const MOTION_PHRASE_DEFINITIONS: readonly MotionPhraseDefinition[] = Object.freeze([
  { id: 'HERO_WORD_IMPACT', version: '1.0.0', phases: ['ENTER', 'ACCENT', 'SETTLE', 'HOLD'], compatible_targets: ['text'], required_capabilities: ['TEXT', 'MASK', 'TRANSFORM', 'OPACITY'], resolver: 'p1.reveal_accent_settle', max_targets: 4 },
  { id: 'STAGGERED_REVEAL', version: '1.0.0', phases: ['ENTER', 'SETTLE'], compatible_targets: ['text', 'shape', 'group'], required_capabilities: ['OPACITY', 'TRANSFORM'], resolver: 'p1.ordered_reveals', max_targets: 12 },
  { id: 'PATH_CAUSAL_REVEAL', version: '1.0.0', phases: ['ENTER', 'ACCENT', 'HOLD'], compatible_targets: ['path', 'shape'], required_capabilities: ['PATH', 'PATH_PROGRESS'], resolver: 'p1.draw_then_accent', max_targets: 8 },
  { id: 'DEPTH_CAMERA_SETTLE', version: '1.0.0', phases: ['ENTER', 'SETTLE', 'HOLD'], compatible_targets: ['group', 'image', 'shape'], required_capabilities: ['GROUP', 'TRANSFORM'], resolver: 'p1.depth_push_settle', max_targets: 12 },
  { id: 'VISUAL_BREATH', version: '1.0.0', phases: ['HOLD'], compatible_targets: ['group', 'text', 'shape', 'path', 'mask', 'image'], required_capabilities: ['OPACITY'], resolver: 'p1.static_hold', max_targets: 12 },
]);

export interface CameraDefinition {
  readonly id: string;
  readonly version: string;
  readonly support: SupportLevel;
  readonly resolver: string;
  readonly required_capabilities: readonly VisualCapability[];
  readonly allowed_targets: readonly VisualEntityKind[];
  readonly safe_scale_range: readonly [number, number];
}

export const CAMERA_DEFINITIONS: readonly CameraDefinition[] = Object.freeze([
  { id: 'CAMERA_PUSH_IN', version: '1.0.0', support: 'supported', resolver: 'p1.camera_push', required_capabilities: ['GROUP', 'TRANSFORM'], allowed_targets: ['group', 'image'], safe_scale_range: [1.02, 1.08] },
  { id: 'CAMERA_PUNCH_IN', version: '1.0.0', support: 'supported', resolver: 'p1.camera_push', required_capabilities: ['GROUP', 'TRANSFORM'], allowed_targets: ['group', 'image'], safe_scale_range: [1.04, 1.08] },
  { id: 'CAMERA_CONTINUOUS_ZOOM', version: '1.0.0', support: 'compatible_simplified', resolver: 'p1.matched_camera_push', required_capabilities: ['GROUP', 'TRANSFORM'], allowed_targets: ['group', 'image'], safe_scale_range: [1.02, 1.08] },
  { id: 'CAMERA_FOLLOW', version: '1.0.0', support: 'compatible_simplified', resolver: 'p1.focus_or_push', required_capabilities: ['GROUP', 'TRANSFORM'], allowed_targets: ['group', 'image'], safe_scale_range: [1.01, 1.08] },
  { id: 'CAMERA_PULL_OUT', version: '1.0.0', support: 'future', resolver: 'future.camera_pull', required_capabilities: ['FUTURE_CROSS_SCENE_COMPOSITOR'], allowed_targets: ['group', 'image'], safe_scale_range: [0.92, 0.99] },
  { id: 'CAMERA_PAN', version: '1.0.0', support: 'future', resolver: 'future.camera_pan', required_capabilities: ['FUTURE_CROSS_SCENE_COMPOSITOR'], allowed_targets: ['group', 'image'], safe_scale_range: [1, 1] },
]);

export interface SceneBridgeDefinition {
  readonly id: string;
  readonly version: string;
  readonly support: SupportLevel;
  readonly continuity_properties: readonly string[];
  readonly required_capabilities: readonly VisualCapability[];
  readonly resolver: string;
  readonly fallback_order: readonly string[];
}

export const SCENE_BRIDGE_DEFINITIONS: readonly SceneBridgeDefinition[] = Object.freeze([
  { id: 'MATCH_POSITION', version: '1.0.0', support: 'supported', continuity_properties: ['position'], required_capabilities: ['TRANSFORM'], resolver: 'p1.matched_boundary_state', fallback_order: ['MATCH_SCALE', 'explicit_cut'] },
  { id: 'MATCH_SCALE', version: '1.0.0', support: 'supported', continuity_properties: ['scale'], required_capabilities: ['TRANSFORM'], resolver: 'p1.matched_boundary_state', fallback_order: ['MATCH_POSITION', 'explicit_cut'] },
  { id: 'MATCH_SHAPE', version: '1.0.0', support: 'future', continuity_properties: ['shape'], required_capabilities: ['FUTURE_ARBITRARY_MORPH'], resolver: 'future.arbitrary_morph', fallback_order: ['MASK_EXPANSION', 'explicit_cut'] },
  { id: 'MASK_EXPANSION', version: '1.0.0', support: 'compatible_simplified', continuity_properties: ['mask', 'color'], required_capabilities: ['MASK', 'CLIP'], resolver: 'p1.matched_mask_boundary', fallback_order: ['COLOR_FIELD_CONTINUE', 'explicit_cut'] },
  { id: 'CAMERA_CONTINUE', version: '1.0.0', support: 'compatible_simplified', continuity_properties: ['scale', 'position'], required_capabilities: ['GROUP', 'TRANSFORM'], resolver: 'p1.matched_camera_boundary', fallback_order: ['MATCH_SCALE', 'explicit_cut'] },
  { id: 'ELEMENT_CARRY', version: '1.0.0', support: 'supported', continuity_properties: ['position', 'scale'], required_capabilities: ['GROUP', 'TRANSFORM'], resolver: 'p1.persistent_entity_boundary', fallback_order: ['MATCH_POSITION', 'explicit_cut'] },
  { id: 'COLOR_FIELD_CONTINUE', version: '1.0.0', support: 'supported', continuity_properties: ['color'], required_capabilities: ['COLOR'], resolver: 'p1.matched_color_boundary', fallback_order: ['explicit_cut'] },
  { id: 'PATH_CONTINUE', version: '1.0.0', support: 'compatible_simplified', continuity_properties: ['path'], required_capabilities: ['PATH', 'PATH_PROGRESS'], resolver: 'p1.matched_path_boundary', fallback_order: ['MATCH_POSITION', 'explicit_cut'] },
  { id: 'TYPE_CONTINUE', version: '1.0.0', support: 'compatible_simplified', continuity_properties: ['type', 'scale'], required_capabilities: ['TEXT', 'TRANSFORM'], resolver: 'p1.matched_type_boundary', fallback_order: ['MATCH_SCALE', 'explicit_cut'] },
]);

export const P32_VISUAL_PATTERN_DEFINITIONS: readonly VisualPatternDefinition[] = Object.freeze([
  ...VISUAL_PATTERN_DEFINITIONS,
  pattern({ id: 'TYPE_TRACKING_BURST', version: '1.0.0', category: 'typography', support: 'supported', required_capabilities: ['TEXT', 'DYNAMIC_TYPOGRAPHY'], allowed_targets: ['text'], parameters: ['from_em', 'to_em'], conflicts: [], exclusive_control: ['dynamic_tracking'], complexity: 2, intensity_range: ['MEDIUM', 'HIGH'], resolver: 'p1.7.dynamic_tracking' }),
  pattern({ id: 'TYPE_WEIGHT_PULSE', version: '1.0.0', category: 'typography', support: 'supported', required_capabilities: ['TEXT', 'VARIABLE_FONT', 'DYNAMIC_TYPOGRAPHY'], allowed_targets: ['text'], parameters: ['from', 'to'], conflicts: [], exclusive_control: ['font_axis_wght'], complexity: 2, intensity_range: ['MEDIUM', 'HIGH'], resolver: 'p1.7.dynamic_wght' }),
  pattern({ id: 'TYPE_WIDTH_EXPANSION', version: '1.0.0', category: 'typography', support: 'supported', required_capabilities: ['TEXT', 'VARIABLE_FONT', 'DYNAMIC_TYPOGRAPHY'], allowed_targets: ['text'], parameters: ['from', 'to'], conflicts: [], exclusive_control: ['font_axis_wdth'], complexity: 2, intensity_range: ['MEDIUM', 'HIGH'], resolver: 'p1.7.dynamic_wdth' }),
  pattern({ id: 'WORD_TO_MASK', version: '1.0.0', category: 'transition', support: 'compatible_simplified', required_capabilities: ['TEXT', 'MASK', 'CLIP', 'TRANSFORM'], allowed_targets: ['text', 'mask'], parameters: ['direction'], conflicts: [], exclusive_control: ['clip'], complexity: 3, intensity_range: ['MEDIUM', 'HIGH'], resolver: 'p1.7.type_scale_mask' }),
  pattern({ id: 'SHAPE_TO_MASK', version: '1.0.0', category: 'transition', support: 'supported', required_capabilities: ['SHAPE', 'MASK', 'CLIP', 'TRANSFORM'], allowed_targets: ['shape', 'mask'], parameters: ['direction'], conflicts: [], exclusive_control: ['clip'], complexity: 2, intensity_range: ['MEDIUM', 'HIGH'], resolver: 'p1.semantic_shape_mask' }),
  pattern({ id: 'CIRCLE_TO_PORTAL', version: '1.0.0', category: 'transition', support: 'compatible_simplified', required_capabilities: ['SHAPE', 'MASK', 'CLIP', 'GROUP', 'TRANSFORM'], allowed_targets: ['shape', 'mask', 'group'], parameters: ['scale'], conflicts: [], exclusive_control: ['portal'], complexity: 3, intensity_range: ['MEDIUM', 'HIGH'], resolver: 'p1.scale_mask_portal' }),
  pattern({ id: 'FRAME_EXPANSION', version: '1.0.0', category: 'transition', support: 'supported', required_capabilities: ['GROUP', 'MASK', 'CLIP', 'TRANSFORM'], allowed_targets: ['group', 'mask', 'shape'], parameters: ['scale'], conflicts: [], exclusive_control: ['frame_transition'], complexity: 3, intensity_range: ['MEDIUM', 'HIGH'], resolver: 'p1.frame_to_full_screen' }),
  pattern({ id: 'DOT_TO_ORBIT', version: '1.0.0', category: 'shape', support: 'supported', required_capabilities: ['SHAPE', 'PATH', 'PATH_PROGRESS', 'TRANSFORM'], allowed_targets: ['shape', 'path', 'group'], parameters: ['direction'], conflicts: [], exclusive_control: ['semantic_morph'], complexity: 2, intensity_range: ['MEDIUM', 'HIGH'], resolver: 'p1.dot_orbit_chain' }),
  pattern({ id: 'VECTOR_ASSEMBLY', version: '1.0.0', category: 'shape', support: 'supported', required_capabilities: ['SHAPE', 'PATH', 'GROUP', 'TRANSFORM', 'OPACITY'], allowed_targets: ['shape', 'path', 'group'], parameters: ['order'], conflicts: [], exclusive_control: ['assembly'], complexity: 3, intensity_range: ['LOW', 'HIGH'], resolver: 'p1.ordered_vector_assembly' }),
  pattern({ id: 'DIAGRAM_CAUSAL_FLOW', version: '1.0.0', category: 'path', support: 'supported', required_capabilities: ['PATH', 'PATH_PROGRESS', 'SHAPE', 'TRANSFORM'], allowed_targets: ['path', 'shape', 'group'], parameters: ['order'], conflicts: [], exclusive_control: ['causal_flow'], complexity: 2, intensity_range: ['LOW', 'HIGH'], resolver: 'p1.draw_then_accent' }),
]);

export const P32_MOTION_PHRASE_DEFINITIONS: readonly MotionPhraseDefinition[] = Object.freeze([
  ...MOTION_PHRASE_DEFINITIONS,
  { id: 'TYPE_TRACKING_IMPACT', version: '1.0.0', phases: ['ENTER', 'ACCENT', 'SETTLE'], compatible_targets: ['text'], required_capabilities: ['TEXT', 'DYNAMIC_TYPOGRAPHY', 'TRANSFORM'], resolver: 'p1.7.tracking_axis_impact', max_targets: 2 },
  { id: 'TYPE_AXIS_PULSE', version: '1.0.0', phases: ['ACCENT', 'SETTLE'], compatible_targets: ['text'], required_capabilities: ['TEXT', 'VARIABLE_FONT', 'DYNAMIC_TYPOGRAPHY'], resolver: 'p1.7.axis_pulse', max_targets: 2 },
  { id: 'WORD_MASK_BRIDGE', version: '1.0.0', phases: ['ACCENT', 'EXIT'], compatible_targets: ['text', 'mask'], required_capabilities: ['TEXT', 'MASK', 'CLIP', 'TRANSFORM'], resolver: 'p1.type_scale_mask', max_targets: 3 },
  { id: 'SEMANTIC_MORPH_CHAIN', version: '1.0.0', phases: ['ENTER', 'ACCENT', 'EXIT'], compatible_targets: ['shape', 'mask', 'group'], required_capabilities: ['SHAPE', 'MASK', 'TRANSFORM'], resolver: 'p1.semantic_transform_chain', max_targets: 6 },
  { id: 'CAUSAL_PATH_IMPACT', version: '1.0.0', phases: ['ENTER', 'ACCENT', 'SETTLE'], compatible_targets: ['path', 'shape', 'group'], required_capabilities: ['PATH', 'PATH_PROGRESS', 'TRANSFORM'], resolver: 'p1.draw_impact_followthrough', max_targets: 8 },
  { id: 'CAMERA_DEPTH_SURGE', version: '1.0.0', phases: ['ENTER', 'ACCENT', 'SETTLE'], compatible_targets: ['group', 'image', 'shape'], required_capabilities: ['GROUP', 'TRANSFORM'], resolver: 'p1.depth_scaled_camera_push', max_targets: 12 },
  { id: 'OCCLUSION_REVEAL', version: '1.0.0', phases: ['ENTER', 'ACCENT'], compatible_targets: ['group', 'shape', 'text', 'mask'], required_capabilities: ['GROUP', 'MASK', 'CLIP'], resolver: 'p1.layer_order_mask', max_targets: 8 },
  { id: 'FRAME_PORTAL_TRANSFORM', version: '1.0.0', phases: ['ACCENT', 'EXIT'], compatible_targets: ['group', 'mask', 'shape'], required_capabilities: ['GROUP', 'MASK', 'CLIP', 'TRANSFORM'], resolver: 'p1.frame_scale_mask', max_targets: 4 },
  { id: 'OVERLAP_FOLLOW_THROUGH', version: '1.0.0', phases: ['ACCENT', 'SETTLE'], compatible_targets: ['group', 'shape', 'text', 'path'], required_capabilities: ['TRANSFORM', 'OPACITY'], resolver: 'p1.overlap_settle', max_targets: 8 },
  { id: 'IMPACT_CUT', version: '1.0.0', phases: ['ACCENT', 'EXIT'], compatible_targets: ['group', 'shape', 'text', 'path', 'mask', 'image'], required_capabilities: ['CUT'], resolver: 'p1.intentional_impact_cut', max_targets: 4 },
]);

export const P32_CAMERA_DEFINITIONS: readonly CameraDefinition[] = Object.freeze([
  ...CAMERA_DEFINITIONS,
  { id: 'CAMERA_DEPTH_SURGE', version: '1.0.0', support: 'supported', resolver: 'p1.depth_scaled_camera_push', required_capabilities: ['GROUP', 'TRANSFORM'], allowed_targets: ['group', 'image'], safe_scale_range: [1.04, 1.12] },
  { id: 'CAMERA_SETTLE', version: '1.0.0', support: 'supported', resolver: 'p1.camera_push_settle', required_capabilities: ['GROUP', 'TRANSFORM'], allowed_targets: ['group', 'image'], safe_scale_range: [1.01, 1.05] },
]);

export const P32_SCENE_BRIDGE_DEFINITIONS: readonly SceneBridgeDefinition[] = Object.freeze([
  ...SCENE_BRIDGE_DEFINITIONS,
  { id: 'FRAME_EXPANSION', version: '1.0.0', support: 'supported', continuity_properties: ['scale', 'mask', 'position'], required_capabilities: ['GROUP', 'MASK', 'CLIP', 'TRANSFORM'], resolver: 'p1.frame_mask_boundary', fallback_order: ['MASK_EXPANSION', 'MATCH_SCALE', 'explicit_cut'] },
  { id: 'ZOOM_THROUGH', version: '1.0.0', support: 'compatible_simplified', continuity_properties: ['scale', 'position'], required_capabilities: ['GROUP', 'MASK', 'TRANSFORM'], resolver: 'p1.portal_camera_boundary', fallback_order: ['CAMERA_CONTINUE', 'MATCH_SCALE', 'explicit_cut'] },
  { id: 'TYPE_SCALE_THROUGH', version: '1.0.0', support: 'compatible_simplified', continuity_properties: ['type', 'scale', 'mask'], required_capabilities: ['TEXT', 'MASK', 'CLIP', 'TRANSFORM'], resolver: 'p1.type_mask_boundary', fallback_order: ['TYPE_CONTINUE', 'MASK_EXPANSION', 'explicit_cut'] },
]);

export const MOTION_PHYSICS_MAPPINGS = Object.freeze({
  SNAPPY: { easing: 'enter', duration_scale: 0.75 }, ELASTIC: { easing: 'settle', duration_scale: 1 },
  HEAVY: { easing: 'inout', duration_scale: 1.25 }, FLOATING: { easing: 'inout', duration_scale: 1.4 },
  PRECISE: { easing: 'inout', duration_scale: 1 }, SOFT: { easing: 'enter', duration_scale: 1.2 },
  IMPACTFUL: { easing: 'settle', duration_scale: 0.8 }, MECHANICAL: { easing: 'linear', duration_scale: 0.9 },
});

function byId<T extends { id: string }>(definitions: readonly T[]): ReadonlyMap<string, T> {
  return new Map(definitions.map((entry) => [entry.id, entry]));
}

export const VISUAL_PATTERN_REGISTRY = byId(VISUAL_PATTERN_DEFINITIONS);
export const MOTION_PHRASE_REGISTRY = byId(MOTION_PHRASE_DEFINITIONS);
export const CAMERA_REGISTRY = byId(CAMERA_DEFINITIONS);
export const SCENE_BRIDGE_REGISTRY = byId(SCENE_BRIDGE_DEFINITIONS);

export const VISUAL_REGISTRY_FINGERPRINTS = Object.freeze({
  patterns: hashVisualDocument(VISUAL_PATTERN_DEFINITIONS),
  phrases: hashVisualDocument(MOTION_PHRASE_DEFINITIONS),
  bridges: hashVisualDocument(SCENE_BRIDGE_DEFINITIONS),
  cameras: hashVisualDocument(CAMERA_DEFINITIONS),
});

export const VISUAL_GRAMMAR_FINGERPRINT = hashVisualDocument({
  version: VISUAL_GRAMMAR_VERSION,
  registries: VISUAL_REGISTRY_FINGERPRINTS,
  physics: MOTION_PHYSICS_MAPPINGS,
  limits: DEFAULT_VISUAL_LIMITS,
});

export const ACTIVE_VISUAL_GRAMMAR = Object.freeze({
  version: VISUAL_GRAMMAR_VERSION,
  fingerprint: VISUAL_GRAMMAR_FINGERPRINT,
  registry_fingerprints: VISUAL_REGISTRY_FINGERPRINTS,
  patterns: VISUAL_PATTERN_REGISTRY,
  phrases: MOTION_PHRASE_REGISTRY,
  cameras: CAMERA_REGISTRY,
  bridges: SCENE_BRIDGE_REGISTRY,
});

export const P32_VISUAL_PATTERN_REGISTRY = byId(P32_VISUAL_PATTERN_DEFINITIONS);
export const P32_MOTION_PHRASE_REGISTRY = byId(P32_MOTION_PHRASE_DEFINITIONS);
export const P32_CAMERA_REGISTRY = byId(P32_CAMERA_DEFINITIONS);
export const P32_SCENE_BRIDGE_REGISTRY = byId(P32_SCENE_BRIDGE_DEFINITIONS);

export const P32_VISUAL_REGISTRY_FINGERPRINTS = Object.freeze({
  patterns: hashVisualDocument(P32_VISUAL_PATTERN_DEFINITIONS),
  phrases: hashVisualDocument(P32_MOTION_PHRASE_DEFINITIONS),
  bridges: hashVisualDocument(P32_SCENE_BRIDGE_DEFINITIONS),
  cameras: hashVisualDocument(P32_CAMERA_DEFINITIONS),
});

export const P32_VISUAL_GRAMMAR_FINGERPRINT = hashVisualDocument({
  version: P32_VISUAL_GRAMMAR_VERSION,
  registries: P32_VISUAL_REGISTRY_FINGERPRINTS,
  physics: MOTION_PHYSICS_MAPPINGS,
  limits: DEFAULT_VISUAL_LIMITS,
});

export const P32_VISUAL_GRAMMAR = Object.freeze({
  version: P32_VISUAL_GRAMMAR_VERSION,
  fingerprint: P32_VISUAL_GRAMMAR_FINGERPRINT,
  registry_fingerprints: P32_VISUAL_REGISTRY_FINGERPRINTS,
  patterns: P32_VISUAL_PATTERN_REGISTRY,
  phrases: P32_MOTION_PHRASE_REGISTRY,
  cameras: P32_CAMERA_REGISTRY,
  bridges: P32_SCENE_BRIDGE_REGISTRY,
});

export function visualGrammarForVersion(version: string): typeof ACTIVE_VISUAL_GRAMMAR | typeof P32_VISUAL_GRAMMAR | null {
  if (version === ACTIVE_VISUAL_GRAMMAR.version) return ACTIVE_VISUAL_GRAMMAR;
  if (version === P32_VISUAL_GRAMMAR.version) return P32_VISUAL_GRAMMAR;
  return null;
}

export function assertRegistryVersionPolicy<T extends { id: string; version: string }>(
  current: readonly T[],
  baseline: readonly { id: string; version: string; sha256: string }[],
): void {
  const known = new Map(baseline.map((entry) => [`${entry.id}@${entry.version}`, entry.sha256]));
  for (const entry of current) {
    const expected = known.get(`${entry.id}@${entry.version}`);
    if (expected !== undefined && expected !== hashVisualDocument(entry)) {
      throw new Error(`visual.registry.version_not_bumped:${entry.id}@${entry.version}`);
    }
  }
}
