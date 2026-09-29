import { hashVisualDocument } from './canonical.ts';
import { VISUAL_GRAMMAR_VERSION } from './contracts.ts';
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
