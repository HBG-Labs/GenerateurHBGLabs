import path from 'node:path';

import {
  P17_BEHAVIOR_REGISTRY,
  compilePipeline,
  loadStyleFile,
  resolveStyle,
  type CompilerPipelineResult,
  type ResolvedStyle,
} from '@motion-engine/core';
import type { CreativePlan } from '@motion-engine/creative-core';
import {
  compileVisualPlan,
  type VisualCompileResult,
} from '@motion-engine/visual-compiler';
import {
  P32_VISUAL_GRAMMAR,
  P32_VISUAL_PLAN_VERSION,
  VisualPlanSchema,
  buildVisualDiversityReport,
  visualStableId,
  type VisualPlan,
  type VisualScene,
} from '@motion-engine/visual-core';

import { pattern, platforms } from './p1.2-support.ts';
import { p14FontResources } from './p1.4-support.ts';
import { p31CreativePlan, p31VisualPlan } from './p3.1-support.ts';
import { FONT_LIBRARY, WORKSPACE } from './support.ts';

const patternInstance = (id: string, patternId: string, targetIds: string[], parameters: Record<string, string | number | boolean> = {}) => ({
  id, pattern_id: patternId, version: '1.0.0', target_ids: targetIds, parameters,
});

const phrase = (id: string, phraseId: string, targetIds: string[], intensity: 'LOW' | 'MEDIUM' | 'HIGH', direction: 'up' | 'down' | 'left' | 'right' | 'radial' | 'none') => ({
  id, phrase_id: phraseId, version: '1.0.0', target_ids: targetIds, intensity, direction,
});

function p32Scene(scene: VisualScene, index: number): unknown {
  const common = {
    ...scene,
    morph_chains: [] as unknown[],
    motion_events: [] as unknown[],
    causal_relations: [] as unknown[],
    layout_transitions: [] as unknown[],
    effects: [] as unknown[],
  };
  if (index === 0) return {
    ...common,
    patterns: [
      ...scene.patterns,
      patternInstance('hook_type_tracking', 'TYPE_TRACKING_BURST', ['hook_question'], { from_em: -0.035, to_em: 0.025 }),
      patternInstance('hook_type_weight', 'TYPE_WEIGHT_PULSE', ['hook_question'], { from: 420, to: 820 }),
      patternInstance('hook_type_width', 'TYPE_WIDTH_EXPANSION', ['hook_question'], { from: 72, to: 96 }),
    ],
    motion_phrases: [...scene.motion_phrases, phrase('hook_phrase_dynamic', 'TYPE_TRACKING_IMPACT', ['hook_question'], 'HIGH', 'up')],
    morph_chains: [{ id: 'hook_light_chain', entity_id: 'hook_light_path', kind: 'semantic', steps: [
      { id: 'hook_light_line', representation: 'line', phase: 'ENTER', scale: 0.2 },
      { id: 'hook_light_path_step', representation: 'path', phase: 'ACCENT', scale: 1 },
    ] }],
    motion_events: [
      { id: 'hook_event_type_impact', target_id: 'hook_question', phase: 'ACCENT', energy: 'outward', sync_anchor: 'IMPACT' },
      { id: 'hook_event_ray_departure', target_id: 'hook_light_path', phase: 'EXIT', energy: 'left_to_right', sync_anchor: 'REVEAL' },
    ],
    causal_relations: [{ id: 'hook_causal_type_to_ray', source_event_id: 'hook_event_type_impact', destination_event_id: 'hook_event_ray_departure', relation: 'TRIGGERS' }],
  };
  if (index === 1) return {
    ...common,
    patterns: [...scene.patterns, patternInstance('context_vector_assembly', 'VECTOR_ASSEMBLY', ['context_atmosphere', 'context_light_path'], { order: 'semantic' })],
    motion_phrases: [...scene.motion_phrases, phrase('context_depth_surge', 'CAMERA_DEPTH_SURGE', ['context_background_group', 'context_mid_group', 'context_foreground_group'], 'HIGH', 'none')],
    camera_moves: [...scene.camera_moves, { id: 'context_camera_background', camera_id: 'CAMERA_DEPTH_SURGE', version: '1.0.0', target_id: 'context_background_group', intensity: 0.18, phase: 'ENTER' }],
    motion_events: [
      { id: 'context_event_light_enter', target_id: 'context_light_path', phase: 'ENTER', energy: 'left_to_right', sync_anchor: 'REVEAL' },
      { id: 'context_event_depth_follow', target_id: 'context_foreground_group', phase: 'ACCENT', energy: 'inward', sync_anchor: 'IMPACT' },
    ],
    causal_relations: [{ id: 'context_causal_light_depth', source_event_id: 'context_event_light_enter', destination_event_id: 'context_event_depth_follow', relation: 'PREPARES' }],
  };
  if (index === 2) {
    const entities = scene.entities.map((entity) => entity.id === 'scatter_core' ? { ...entity, visual_entity_id: 'entity_atmosphere', persistent: true } : entity);
    const anchors = scene.anchors.map((entry) => entry.id === 'scatter_core_entry' ? { ...entry, visual_entity_id: 'entity_atmosphere' } : entry);
    return {
      ...common, entities, anchors,
      patterns: [
        ...scene.patterns.filter((entry) => entry.pattern_id !== 'MASK_TO_NEXT_SCENE'),
        patternInstance('scatter_causal_flow', 'DIAGRAM_CAUSAL_FLOW', ['scatter_ray_one', 'scatter_ray_two', 'scatter_ray_three', 'scatter_ray_four'], { order: 'radial' }),
        patternInstance('scatter_dot_orbit', 'DOT_TO_ORBIT', ['scatter_core', 'scatter_system'], { direction: 'radial' }),
        patternInstance('scatter_shape_mask', 'SHAPE_TO_MASK', ['scatter_core', 'scatter_transition_mask'], { direction: 'outward' }),
      ],
      motion_phrases: [
        ...scene.motion_phrases,
        phrase('scatter_phrase_causal', 'CAUSAL_PATH_IMPACT', ['scatter_ray_one', 'scatter_ray_two', 'scatter_ray_three', 'scatter_ray_four', 'scatter_core'], 'HIGH', 'radial'),
        phrase('scatter_phrase_morph', 'SEMANTIC_MORPH_CHAIN', ['scatter_core', 'scatter_transition_mask'], 'HIGH', 'radial'),
        phrase('scatter_phrase_follow', 'OVERLAP_FOLLOW_THROUGH', ['scatter_core', 'scatter_ray_one', 'scatter_ray_two'], 'MEDIUM', 'radial'),
      ],
      morph_chains: [{ id: 'scatter_semantic_chain', entity_id: 'scatter_core', kind: 'semantic', steps: [
        { id: 'scatter_step_dot', representation: 'dot', phase: 'ENTER', scale: 0.2 },
        { id: 'scatter_step_orbit', representation: 'ellipse', phase: 'ACCENT', scale: 0.8 },
        { id: 'scatter_step_mask', representation: 'mask', phase: 'EXIT', scale: 8 },
      ] }],
      motion_events: [
        { id: 'scatter_event_path', target_id: 'scatter_ray_one', phase: 'ENTER', energy: 'inward', sync_anchor: 'REVEAL' },
        { id: 'scatter_event_collision', target_id: 'scatter_core', phase: 'ACCENT', energy: 'radial', sync_anchor: 'IMPACT' },
        { id: 'scatter_event_mask', target_id: 'scatter_transition_mask', phase: 'EXIT', energy: 'outward', sync_anchor: 'BRIDGE_CROSS' },
      ],
      causal_relations: [
        { id: 'scatter_causal_path_collision', source_event_id: 'scatter_event_path', destination_event_id: 'scatter_event_collision', relation: 'TRIGGERS' },
        { id: 'scatter_causal_collision_mask', source_event_id: 'scatter_event_collision', destination_event_id: 'scatter_event_mask', relation: 'REVEALS' },
      ],
      layout_transitions: [{ id: 'scatter_layout_transform', from: 'RADIAL_FOCUS', to: 'FULL_BLEED', phase: 'EXIT', target_ids: ['scatter_core', 'scatter_transition_mask'] }],
    };
  }
  if (index === 3) return {
    ...common,
    patterns: [
      ...scene.patterns,
      patternInstance('spectrum_type_tracking', 'TYPE_TRACKING_BURST', ['spectrum_blue'], { from_em: -0.04, to_em: 0.018 }),
      patternInstance('spectrum_type_weight', 'TYPE_WEIGHT_PULSE', ['spectrum_blue'], { from: 440, to: 860 }),
      patternInstance('spectrum_type_width', 'TYPE_WIDTH_EXPANSION', ['spectrum_blue'], { from: 68, to: 98 }),
      patternInstance('spectrum_word_mask', 'WORD_TO_MASK', ['spectrum_blue'], { direction: 'outward' }),
    ],
    motion_phrases: [
      ...scene.motion_phrases,
      phrase('spectrum_phrase_dynamic', 'TYPE_TRACKING_IMPACT', ['spectrum_blue'], 'HIGH', 'right'),
      phrase('spectrum_phrase_axis', 'TYPE_AXIS_PULSE', ['spectrum_blue'], 'MEDIUM', 'none'),
      phrase('spectrum_phrase_mask', 'WORD_MASK_BRIDGE', ['spectrum_blue'], 'MEDIUM', 'right'),
    ],
    morph_chains: [{ id: 'spectrum_type_chain', entity_id: 'spectrum_blue', kind: 'semantic', steps: [
      { id: 'spectrum_step_type', representation: 'type', phase: 'ACCENT', scale: 1 },
      { id: 'spectrum_step_frame', representation: 'frame', phase: 'EXIT', scale: 8 },
    ] }],
    motion_events: [
      { id: 'spectrum_event_type', target_id: 'spectrum_blue', phase: 'ACCENT', energy: 'outward', sync_anchor: 'IMPACT' },
      { id: 'spectrum_event_frame', target_id: 'spectrum_color_field', phase: 'EXIT', energy: 'outward', sync_anchor: 'BRIDGE_CROSS' },
    ],
    causal_relations: [{ id: 'spectrum_causal_type_frame', source_event_id: 'spectrum_event_type', destination_event_id: 'spectrum_event_frame', relation: 'PREPARES' }],
  };
  if (index === 4) {
    const entities = scene.entities.map((entity) => entity.id === 'horizon_copy' ? { ...entity, visual_entity_id: 'entity_blue_word', persistent: true } : entity);
    return {
      ...common, entities,
      patterns: [...scene.patterns, patternInstance('horizon_portal', 'CIRCLE_TO_PORTAL', ['horizon_orb', 'horizon_camera_group'], { scale: 8 })],
      motion_phrases: [...scene.motion_phrases, phrase('horizon_phrase_portal', 'FRAME_PORTAL_TRANSFORM', ['horizon_orb', 'horizon_camera_group'], 'HIGH', 'none')],
      camera_moves: scene.camera_moves.map((entry) => entry.id === 'horizon_camera' ? { ...entry, camera_id: 'CAMERA_DEPTH_SURGE', intensity: 0.78 } : entry),
      anchors: [...scene.anchors, { id: 'horizon_type_entry', entity_id: 'horizon_copy', visual_entity_id: 'entity_blue_word', property: 'type', visible_ms: 700 }],
      morph_chains: [{ id: 'horizon_portal_chain', entity_id: 'horizon_orb', kind: 'semantic', steps: [
        { id: 'horizon_step_dot', representation: 'dot', phase: 'ENTER', scale: 0.18 },
        { id: 'horizon_step_orb', representation: 'ellipse', phase: 'HOLD', scale: 0.54 },
        { id: 'horizon_step_portal', representation: 'portal', phase: 'EXIT', scale: 8 },
      ] }],
      motion_events: [
        { id: 'horizon_event_hold_breath', target_id: 'horizon_breath', phase: 'HOLD', energy: 'still', sync_anchor: null },
        { id: 'horizon_event_portal', target_id: 'horizon_orb', phase: 'EXIT', energy: 'inward', sync_anchor: 'BRIDGE_CROSS' },
      ],
      causal_relations: [{ id: 'horizon_causal_breath_portal', source_event_id: 'horizon_event_hold_breath', destination_event_id: 'horizon_event_portal', relation: 'PREPARES' }],
    };
  }
  const payoffGroup = {
    id: 'payoff_camera_group', visual_entity_id: null, kind: 'group', semantic_role: 'payoff_camera_space', hierarchy: 'PRIMARY', region: 'full', parent_id: null,
    persistent: false, safe: false, text: null, shape: null, path: null, mask: null, asset_ref: null,
    style: { fill: 'background', stroke: 'accent', text: 'foreground' }, transform: { scale: 1, rotate_deg: 0, translate_x: 0, translate_y: 0 },
  };
  const entities = [payoffGroup, ...scene.entities.map((entity) => entity.id === 'payoff_field' ? entity : { ...entity, parent_id: 'payoff_camera_group' })];
  return {
    ...common, entities,
    patterns: [...scene.patterns, patternInstance('payoff_type_tracking', 'TYPE_TRACKING_BURST', ['payoff_type'], { from_em: -0.035, to_em: 0.02 }), patternInstance('payoff_type_weight', 'TYPE_WEIGHT_PULSE', ['payoff_type'], { from: 480, to: 840 })],
    motion_phrases: [...scene.motion_phrases, phrase('payoff_phrase_dynamic', 'TYPE_TRACKING_IMPACT', ['payoff_type'], 'HIGH', 'up')],
    camera_moves: [{ id: 'payoff_camera_settle', camera_id: 'CAMERA_SETTLE', version: '1.0.0', target_id: 'payoff_camera_group', intensity: 0.52, phase: 'SETTLE' }],
    motion_events: [
      { id: 'payoff_event_arrive', target_id: 'payoff_orb', phase: 'ENTER', energy: 'inward', sync_anchor: 'REVEAL' },
      { id: 'payoff_event_final', target_id: 'payoff_type', phase: 'ACCENT', energy: 'outward', sync_anchor: 'PAYOFF' },
    ],
    causal_relations: [{ id: 'payoff_causal_arrive_final', source_event_id: 'payoff_event_arrive', destination_event_id: 'payoff_event_final', relation: 'REVEALS' }],
  };
}

export function p32Style(): ResolvedStyle {
  const loaded = loadStyleFile(path.join(WORKSPACE, 'fixtures', 'p3.2', 'spectral-motion.style.json'), FONT_LIBRARY);
  const resolved = resolveStyle({ style: loaded });
  if (!resolved.ok) throw new Error(`Style P3.2 invalide : ${JSON.stringify(resolved.issues)}`);
  return resolved.value;
}

export function p32VisualPlan(): VisualPlan {
  const base = p31VisualPlan();
  const scenes = base.scenes.map(p32Scene);
  const [hook, context, scatter, spectrum, horizon, payoff] = scenes as Array<VisualScene>;
  if (!hook || !context || !scatter || !spectrum || !horizon || !payoff) throw new Error('La référence P3.2 exige les six scènes P3.1.');
  const originalBridges = base.bridges;
  const bridge = (id: string, value: Omit<VisualPlan['bridges'][number], 'id'>) => ({ id, ...value });
  const bridges = [
    originalBridges[0],
    bridge('bridge_context_scatter', { bridge_id: 'MATCH_SCALE', version: '1.0.0', source_scene_id: context.id, destination_scene_id: scatter.id, source_anchor_id: 'context_atmosphere_exit', destination_anchor_id: 'scatter_core_entry', visual_entity_id: 'entity_atmosphere', duration_ms: 620, easing: 'PRECISE', fallback_policy: 'exact_only' }),
    originalBridges[1] ? { ...originalBridges[1], bridge_id: 'FRAME_EXPANSION', fallback_policy: 'exact_only' as const } : null,
    bridge('bridge_spectrum_horizon', { bridge_id: 'TYPE_SCALE_THROUGH', version: '1.0.0', source_scene_id: spectrum.id, destination_scene_id: horizon.id, source_anchor_id: 'spectrum_blue_exit', destination_anchor_id: 'horizon_type_entry', visual_entity_id: 'entity_blue_word', duration_ms: 820, easing: 'IMPACTFUL', fallback_policy: 'compatible_simplified' }),
    originalBridges[2],
  ].filter((entry): entry is VisualPlan['bridges'][number] => entry !== undefined && entry !== null);
  const value = {
    ...base,
    schema_version: P32_VISUAL_PLAN_VERSION,
    plan_id: visualStableId('visual_plan', { parent: base.plan_id, phase: 'p3_2', grammar: P32_VISUAL_GRAMMAR.fingerprint }),
    grammar: { version: P32_VISUAL_GRAMMAR.version, fingerprints: { grammar: P32_VISUAL_GRAMMAR.fingerprint, ...P32_VISUAL_GRAMMAR.registry_fingerprints } },
    style_id: 'spectral_motion', scenes, bridges,
    camera_continuities: [
      { id: 'camera_continuity_context_scatter', source_scene_id: context.id, destination_scene_id: scatter.id, source_camera_id: 'context_camera_foreground', destination_camera_id: 'scatter_camera', energy: 'inward', velocity_intent: 'carry', scale_momentum: 'preserve' },
      { id: 'camera_continuity_horizon_payoff', source_scene_id: horizon.id, destination_scene_id: payoff.id, source_camera_id: 'horizon_camera', destination_camera_id: 'payoff_camera_settle', energy: 'inward', velocity_intent: 'settle', scale_momentum: 'expand' },
    ],
  };
  return VisualPlanSchema.parse(value);
}

export interface P32Pipeline {
  readonly creative_plan: CreativePlan;
  readonly visual_plan: VisualPlan;
  readonly visual_compile: VisualCompileResult;
  readonly p1: CompilerPipelineResult;
  readonly style: ResolvedStyle;
  readonly diversity: ReturnType<typeof buildVisualDiversityReport>;
}

export function buildP32Pipeline(renderScale = 0.5): P32Pipeline {
  const creativePlan = p31CreativePlan();
  const visualPlan = p32VisualPlan();
  const style = p32Style();
  const definition = pattern();
  const visualCompile = compileVisualPlan(visualPlan, { resolved_style: style, pattern: definition, target_platform: 'shorts', asset_refs: new Set() });
  if (!visualCompile.ok || !visualCompile.motion_spec) throw new Error(`Visual Compiler P3.2 invalide : ${JSON.stringify(visualCompile.diagnostics)}`);
  const p1 = compilePipeline({
    spec: visualCompile.motion_spec, resolvedStyle: style, platformPresets: platforms(), pattern: definition,
    fontResources: p14FontResources(style), assetResources: {}, behaviorRegistry: P17_BEHAVIOR_REGISTRY,
    config: { fps: 30, render_scale: renderScale, minimum_readable_size: renderScale === 1 ? 28 : 14 },
  });
  return { creative_plan: creativePlan, visual_plan: visualPlan, visual_compile: visualCompile, p1, style, diversity: buildVisualDiversityReport(visualPlan) };
}
