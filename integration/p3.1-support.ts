import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  compilePipeline,
  loadStyleFile,
  resolveStyle,
  type CompilerPipelineResult,
  type ResolvedStyle,
} from '@motion-engine/core';
import { planCreativeStory, type CreativePlan } from '@motion-engine/creative-core';
import {
  compileCreativePlanToVisualPlan,
  compileVisualPlan,
  type VisualCompileResult,
  type VisualDirection,
} from '@motion-engine/visual-compiler';
import {
  buildVisualDiversityReport,
  type CameraMove,
  type ChoreographyEvent,
  type ContinuityAnchor,
  type MotionPhraseInstance,
  type PatternInstance,
  type SceneBridge,
  type VisualEntity,
  type VisualPlan,
} from '@motion-engine/visual-core';

import { pattern, platforms } from './p1.2-support.ts';
import { p14FontResources } from './p1.4-support.ts';
import { FONT_LIBRARY, WORKSPACE, readJson } from './support.ts';

type Choreography = ChoreographyEvent;

const baseTransform = { scale: 1, rotate_deg: 0, translate_x: 0, translate_y: 0 } as const;
const baseStyle = { fill: 'background', stroke: 'accent', text: 'foreground' } as const;

function text(
  id: string,
  value: string,
  region: VisualEntity['region'],
  hierarchy: VisualEntity['hierarchy'],
  role: NonNullable<VisualEntity['text']>['role'],
  options: { parent?: string; visualEntity?: string; accent?: string[]; align?: 'start' | 'center' | 'end'; style?: VisualEntity['style']; transform?: VisualEntity['transform']; semantic?: string } = {},
): VisualEntity {
  return {
    id, visual_entity_id: options.visualEntity ?? null, kind: 'text', semantic_role: options.semantic ?? 'headline', hierarchy, region,
    parent_id: options.parent ?? null, persistent: options.visualEntity !== undefined, safe: true,
    text: { value, role, accent_words: options.accent ?? [], align: options.align ?? 'start' },
    shape: null, path: null, mask: null, asset_ref: null, style: options.style ?? baseStyle,
    transform: options.transform ?? baseTransform,
  };
}

function shape(
  id: string,
  kind: 'rect' | 'ellipse',
  region: VisualEntity['region'],
  hierarchy: VisualEntity['hierarchy'],
  options: { parent?: string; visualEntity?: string; style?: VisualEntity['style']; transform?: VisualEntity['transform']; semantic?: string; persistent?: boolean } = {},
): VisualEntity {
  return {
    id, visual_entity_id: options.visualEntity ?? null, kind: 'shape', semantic_role: options.semantic ?? 'graphic', hierarchy, region,
    parent_id: options.parent ?? null, persistent: options.persistent ?? options.visualEntity !== undefined, safe: false,
    text: null, shape: { kind }, path: null, mask: null, asset_ref: null, style: options.style ?? baseStyle,
    transform: options.transform ?? baseTransform,
  };
}

function pathEntity(
  id: string,
  points: Array<{ x: number; y: number }>,
  region: VisualEntity['region'],
  hierarchy: VisualEntity['hierarchy'],
  options: { parent?: string; visualEntity?: string; style?: VisualEntity['style']; transform?: VisualEntity['transform']; semantic?: string } = {},
): VisualEntity {
  return {
    id, visual_entity_id: options.visualEntity ?? null, kind: 'path', semantic_role: options.semantic ?? 'trajectory', hierarchy, region,
    parent_id: options.parent ?? null, persistent: options.visualEntity !== undefined, safe: false,
    text: null, shape: null, path: { points, closed: false }, mask: null, asset_ref: null,
    style: options.style ?? baseStyle, transform: options.transform ?? baseTransform,
  };
}

function container(
  id: string,
  kind: 'group' | 'mask',
  region: VisualEntity['region'],
  hierarchy: VisualEntity['hierarchy'],
  options: { parent?: string; visualEntity?: string; style?: VisualEntity['style']; direction?: NonNullable<VisualEntity['mask']>['direction']; semantic?: string } = {},
): VisualEntity {
  return {
    id, visual_entity_id: options.visualEntity ?? null, kind, semantic_role: options.semantic ?? 'composition', hierarchy, region,
    parent_id: options.parent ?? null, persistent: options.visualEntity !== undefined, safe: false,
    text: null, shape: null, path: null,
    mask: kind === 'mask' ? { shape: 'rect', direction: options.direction ?? 'left_to_right' } : null,
    asset_ref: null, style: options.style ?? baseStyle, transform: baseTransform,
  };
}

const patternInstance = (id: string, patternId: string, targets: string[], parameters: Record<string, string | number | boolean> = {}): PatternInstance => ({ id, pattern_id: patternId, version: '1.0.0', target_ids: targets, parameters });
const phrase = (id: string, phraseId: string, targets: string[], intensity: MotionPhraseInstance['intensity'], direction: MotionPhraseInstance['direction']): MotionPhraseInstance => ({ id, phrase_id: phraseId, version: '1.0.0', target_ids: targets, intensity, direction });
const camera = (id: string, cameraId: string, target: string, intensity: number, phase: CameraMove['phase']): CameraMove => ({ id, camera_id: cameraId, version: '1.0.0', target_id: target, intensity, phase });
const anchor = (id: string, entityId: string, visualEntityId: string, property: ContinuityAnchor['property']): ContinuityAnchor => ({ id, entity_id: entityId, visual_entity_id: visualEntityId, property, visible_ms: 600 });
const event = (id: string, phase: Choreography['phase'], target: string, action: string, after: string | null = null): Choreography => ({ id, phase, target_id: target, action_id: action, trigger: { relation: after ? 'after' : 'at_phase_start', event_id: after } });

function sceneBase(sourceSceneId: string, narrativeRole: string, input: Omit<VisualDirection['scenes'][number], 'source_scene_id' | 'narrative_role'>): VisualDirection['scenes'][number] {
  return { source_scene_id: sourceSceneId, narrative_role: narrativeRole, ...input };
}

function blueSkyDirection(plan: CreativePlan): VisualDirection {
  const [hook, context, explanationA, explanationB, example, takeaway] = plan.scenes;
  if (!hook || !context || !explanationA || !explanationB || !example || !takeaway) throw new Error('La fixture P3.1 exige six scènes P2.');

  const hookEntities: VisualEntity[] = [
    shape('hook_field', 'rect', 'full', 'BACKGROUND', { semantic: 'night_sky_field' }),
    pathEntity('hook_light_path', [{ x: 0.03, y: 0.78 }, { x: 0.36, y: 0.52 }, { x: 0.72, y: 0.32 }, { x: 0.98, y: 0.18 }], 'full', 'PRIMARY', { visualEntity: 'entity_light_ray', semantic: 'light_trajectory' }),
    text('hook_question', 'POURQUOI LE CIEL EST-IL BLEU ?', 'center', 'HERO', 'DISPLAY', { accent: ['BLEU'], align: 'center', semantic: 'question' }),
    text('hook_label', 'UNE QUESTION DE LUMIÈRE', 'bottom', 'SECONDARY', 'CAPTION', { align: 'center', semantic: 'setup' }),
  ];

  const contextEntities: VisualEntity[] = [
    container('context_background_group', 'group', 'full', 'BACKGROUND', { semantic: 'background_depth_plane' }),
    shape('context_background_field', 'rect', 'full', 'BACKGROUND', { parent: 'context_background_group', semantic: 'sky_field' }),
    container('context_mid_group', 'group', 'full', 'PRIMARY', { semantic: 'midground_depth_plane' }),
    text('context_light_word', 'LUMIÈRE', 'upper', 'SECONDARY', 'DECORATIVE_TYPE', { parent: 'context_mid_group', align: 'center', semantic: 'light_label', transform: { ...baseTransform, scale: 1.18 } }),
    shape('context_atmosphere', 'ellipse', 'center', 'PRIMARY', { parent: 'context_mid_group', visualEntity: 'entity_atmosphere', semantic: 'atmosphere' }),
    pathEntity('context_light_path', [{ x: 0.02, y: 0.78 }, { x: 0.34, y: 0.53 }, { x: 0.69, y: 0.34 }, { x: 0.98, y: 0.18 }], 'full', 'PRIMARY', { parent: 'context_mid_group', visualEntity: 'entity_light_ray', semantic: 'light_trajectory' }),
    container('context_foreground_group', 'group', 'full', 'PRIMARY', { semantic: 'foreground_depth_plane' }),
    shape('context_subject', 'ellipse', 'foreground', 'HERO', { parent: 'context_foreground_group', semantic: 'observer_silhouette', transform: { ...baseTransform, scale: 1.38, translate_y: 0.18 }, style: { fill: 'inverse', stroke: 'accent', text: 'foreground' } }),
    text('context_caption', 'LA LUMIÈRE BLANCHE CONTIENT TOUTES LES COULEURS', 'top', 'SECONDARY', 'SUBHEAD', { parent: 'context_foreground_group', align: 'center', semantic: 'premise' }),
  ];

  const scatterEntities: VisualEntity[] = [
    shape('scatter_field', 'rect', 'full', 'BACKGROUND', { semantic: 'atmosphere_field' }),
    container('scatter_system', 'group', 'full', 'PRIMARY', { semantic: 'scattering_diagram' }),
    shape('scatter_core', 'ellipse', 'center', 'HERO', { parent: 'scatter_system', visualEntity: 'entity_scatter_core', semantic: 'molecule_focus', transform: { ...baseTransform, scale: 0.45 } }),
    pathEntity('scatter_ray_one', [{ x: 0.5, y: 0.5 }, { x: 0.86, y: 0.12 }], 'full', 'PRIMARY', { parent: 'scatter_system', semantic: 'scattered_ray' }),
    pathEntity('scatter_ray_two', [{ x: 0.5, y: 0.5 }, { x: 0.95, y: 0.5 }], 'full', 'PRIMARY', { parent: 'scatter_system', semantic: 'scattered_ray' }),
    pathEntity('scatter_ray_three', [{ x: 0.5, y: 0.5 }, { x: 0.82, y: 0.91 }], 'full', 'PRIMARY', { parent: 'scatter_system', semantic: 'scattered_ray' }),
    pathEntity('scatter_ray_four', [{ x: 0.5, y: 0.5 }, { x: 0.17, y: 0.86 }], 'full', 'PRIMARY', { parent: 'scatter_system', semantic: 'scattered_ray' }),
    text('scatter_title', 'LE BLEU SE DISPERSE', 'top', 'SECONDARY', 'HEADLINE', { align: 'center', accent: ['BLEU'], semantic: 'explanation' }),
    container('scatter_transition_mask', 'mask', 'full', 'DECORATIVE', { visualEntity: 'entity_color_field', direction: 'left_to_right', semantic: 'transition_mask' }),
    shape('scatter_transition_fill', 'rect', 'full', 'DECORATIVE', { parent: 'scatter_transition_mask', semantic: 'transition_color', style: { fill: 'accent', stroke: 'accent', text: 'inverse' } }),
  ];

  const spectrumEntities: VisualEntity[] = [
    shape('spectrum_color_field', 'rect', 'full', 'BACKGROUND', { visualEntity: 'entity_color_field', semantic: 'color_field', style: { fill: 'accent', stroke: 'accent', text: 'inverse' } }),
    container('spectrum_lines', 'group', 'full', 'PRIMARY', { semantic: 'spectrum_system' }),
    pathEntity('spectrum_line_one', [{ x: 0.02, y: 0.22 }, { x: 0.98, y: 0.22 }], 'full', 'SECONDARY', { parent: 'spectrum_lines', style: { fill: 'background', stroke: 'inverse', text: 'inverse' }, transform: { ...baseTransform, translate_y: -0.12 }, semantic: 'spectrum_band' }),
    pathEntity('spectrum_line_two', [{ x: 0.02, y: 0.42 }, { x: 0.98, y: 0.42 }], 'full', 'SECONDARY', { parent: 'spectrum_lines', style: { fill: 'background', stroke: 'inverse', text: 'inverse' }, semantic: 'spectrum_band' }),
    pathEntity('spectrum_line_three', [{ x: 0.02, y: 0.62 }, { x: 0.98, y: 0.62 }], 'full', 'SECONDARY', { parent: 'spectrum_lines', style: { fill: 'background', stroke: 'inverse', text: 'inverse' }, transform: { ...baseTransform, translate_y: 0.12 }, semantic: 'spectrum_band' }),
    text('spectrum_blue', 'BLEU', 'left', 'HERO', 'DISPLAY', { align: 'center', style: { fill: 'accent', stroke: 'inverse', text: 'inverse' }, semantic: 'keyword' }),
    text('spectrum_explanation', 'PLUS COURT. PLUS DISPERSÉ.', 'right', 'PRIMARY', 'SUBHEAD', { align: 'center', style: { fill: 'accent', stroke: 'inverse', text: 'inverse' }, semantic: 'contrast' }),
  ];

  const horizonEntities: VisualEntity[] = [
    shape('horizon_field', 'rect', 'full', 'BACKGROUND', { semantic: 'sunset_field', style: { fill: 'inverse', stroke: 'accent', text: 'inverse' } }),
    container('horizon_camera_group', 'group', 'full', 'PRIMARY', { semantic: 'camera_space' }),
    shape('horizon_orb', 'ellipse', 'right', 'HERO', { parent: 'horizon_camera_group', visualEntity: 'entity_orb', semantic: 'sun_orb', style: { fill: 'accent', stroke: 'accent', text: 'inverse' }, transform: { ...baseTransform, scale: 0.54 } }),
    pathEntity('horizon_line', [{ x: 0, y: 0.68 }, { x: 1, y: 0.68 }], 'full', 'PRIMARY', { parent: 'horizon_camera_group', visualEntity: 'entity_horizon', semantic: 'horizon' }),
    text('horizon_copy', 'QUAND LE TRAJET S’ALLONGE, LE ROUGE DOMINE.', 'left', 'PRIMARY', 'HEADLINE', { parent: 'horizon_camera_group', align: 'start', semantic: 'example', style: { fill: 'inverse', stroke: 'accent', text: 'inverse' } }),
    text('horizon_breath', 'UN INSTANT À L’HORIZON', 'bottom', 'SECONDARY', 'CAPTION', { align: 'center', semantic: 'visual_breath', style: { fill: 'inverse', stroke: 'accent', text: 'inverse' } }),
  ];

  const payoffEntities: VisualEntity[] = [
    shape('payoff_field', 'rect', 'full', 'BACKGROUND', { semantic: 'resolved_sky' }),
    text('payoff_type', 'BLEU', 'center', 'SECONDARY', 'DISPLAY', { align: 'center', accent: ['BLEU'], semantic: 'payoff_word', transform: { ...baseTransform, scale: 1.32 } }),
    shape('payoff_orb', 'ellipse', 'center', 'HERO', { visualEntity: 'entity_orb', semantic: 'atmosphere_orb', style: { fill: 'background', stroke: 'accent', text: 'foreground' }, transform: { ...baseTransform, scale: 0.58 } }),
    pathEntity('payoff_horizon', [{ x: 0, y: 0.68 }, { x: 1, y: 0.68 }], 'full', 'PRIMARY', { visualEntity: 'entity_horizon', semantic: 'horizon' }),
    text('payoff_copy', 'L’AIR DIFFUSE LE BLEU — ET LE CIEL NOUS L’ENVOIE DE PARTOUT.', 'bottom', 'PRIMARY', 'SUBHEAD', { align: 'center', accent: ['BLEU'], semantic: 'takeaway' }),
  ];

  const scenes: VisualDirection['scenes'] = [
    sceneBase(hook.id, hook.narrative_role, {
      layout: 'DIAGONAL_FLOW', visual_focus_id: 'hook_question', entry_anchor_id: null, exit_anchor_id: 'hook_ray_exit', complexity: 'MEDIUM', motion_intensity: 'HIGH', information_density: 'SPARSE', background_role: 'background',
      entities: hookEntities, relations: [{ id: 'hook_relation_ray', subject: 'hook_light_path', relation: 'follows', object: 'hook_question' }],
      patterns: [patternInstance('hook_pattern_type', 'KINETIC_WORD_IMPACT', ['hook_question'], { mask: true }), patternInstance('hook_pattern_path', 'PATH_DRAW_EXPLANATION', ['hook_light_path'])],
      motion_phrases: [phrase('hook_phrase_impact', 'HERO_WORD_IMPACT', ['hook_question'], 'HIGH', 'up'), phrase('hook_phrase_path', 'PATH_CAUSAL_REVEAL', ['hook_light_path'], 'MEDIUM', 'right')],
      camera_moves: [], anchors: [anchor('hook_ray_exit', 'hook_light_path', 'entity_light_ray', 'path')], depth_layers: [],
      choreography: [event('hook_event_enter', 'ENTER', 'hook_question', 'HERO_WORD_IMPACT'), event('hook_event_path', 'ACCENT', 'hook_light_path', 'PATH_CAUSAL_REVEAL', 'hook_event_enter'), event('hook_event_hold', 'HOLD', 'hook_question', 'VISUAL_BREATH', 'hook_event_path')],
      reserved_regions: [{ id: 'hook_negative_space', region: 'top', reason: 'Préserver une respiration avant la question.' }],
    }),
    sceneBase(context.id, context.narrative_role, {
      layout: 'DEPTH_STACK', visual_focus_id: 'context_subject', entry_anchor_id: 'context_ray_entry', exit_anchor_id: 'context_atmosphere_exit', complexity: 'HIGH', motion_intensity: 'MEDIUM', information_density: 'BALANCED', background_role: 'background',
      entities: contextEntities.map((entry) => {
        if (entry.id === 'context_light_word') return { ...entry, region: 'lower' as const, transform: { ...entry.transform, scale: 0.72, translate_y: 0.18 } };
        if (entry.id === 'context_title' && entry.text) return { ...entry, text: { ...entry.text, value: 'BLANCHE = TOUTES LES COULEURS' } };
        return entry;
      }),
      relations: [
        { id: 'context_relation_type', subject: 'context_light_word', relation: 'behind', object: 'context_subject' },
        { id: 'context_relation_ray', subject: 'context_light_path', relation: 'inside', object: 'context_atmosphere' },
        { id: 'context_relation_subject', subject: 'context_subject', relation: 'in_front_of', object: 'context_light_word' },
      ],
      patterns: [patternInstance('context_pattern_depth', 'DEPTH_PARALLAX_HERO', ['context_mid_group', 'context_foreground_group']), patternInstance('context_pattern_type', 'TYPE_BEHIND_SUBJECT', ['context_light_word', 'context_subject']), patternInstance('context_pattern_path', 'PATH_DRAW_EXPLANATION', ['context_light_path'])],
      motion_phrases: [phrase('context_phrase_depth', 'DEPTH_CAMERA_SETTLE', ['context_mid_group', 'context_foreground_group'], 'MEDIUM', 'none'), phrase('context_phrase_path', 'PATH_CAUSAL_REVEAL', ['context_light_path'], 'MEDIUM', 'right')],
      camera_moves: [camera('context_camera_mid', 'CAMERA_PUSH_IN', 'context_mid_group', 0.35, 'ENTER'), camera('context_camera_foreground', 'CAMERA_PUSH_IN', 'context_foreground_group', 0.85, 'ENTER')],
      anchors: [anchor('context_ray_entry', 'context_light_path', 'entity_light_ray', 'path'), anchor('context_atmosphere_exit', 'context_atmosphere', 'entity_atmosphere', 'scale')],
      depth_layers: [
        { entity_id: 'context_background_group', plane: 'BACKGROUND', parallax_factor: 0.2, occludes: [] },
        { entity_id: 'context_mid_group', plane: 'MIDGROUND', parallax_factor: 0.65, occludes: ['context_background_group'] },
        { entity_id: 'context_foreground_group', plane: 'FOREGROUND', parallax_factor: 1.2, occludes: ['context_mid_group', 'context_background_group'] },
      ],
      choreography: [event('context_event_camera', 'ENTER', 'context_mid_group', 'DEPTH_CAMERA_SETTLE'), event('context_event_path', 'ACCENT', 'context_light_path', 'PATH_CAUSAL_REVEAL', 'context_event_camera'), event('context_event_settle', 'SETTLE', 'context_foreground_group', 'DEPTH_CAMERA_SETTLE', 'context_event_path')], reserved_regions: [],
    }),
    sceneBase(explanationA.id, explanationA.narrative_role, {
      layout: 'RADIAL_FOCUS', visual_focus_id: 'scatter_core', entry_anchor_id: 'scatter_core_entry', exit_anchor_id: 'scatter_mask_exit', complexity: 'HIGH', motion_intensity: 'HIGH', information_density: 'BALANCED', background_role: 'background',
      entities: scatterEntities,
      relations: [
        { id: 'scatter_relation_one', subject: 'scatter_ray_one', relation: 'around', object: 'scatter_core' },
        { id: 'scatter_relation_two', subject: 'scatter_ray_two', relation: 'around', object: 'scatter_core' },
        { id: 'scatter_relation_three', subject: 'scatter_ray_three', relation: 'around', object: 'scatter_core' },
      ],
      patterns: [patternInstance('scatter_pattern_paths', 'PATH_DRAW_EXPLANATION', ['scatter_ray_one', 'scatter_ray_two', 'scatter_ray_three', 'scatter_ray_four']), patternInstance('scatter_pattern_mask', 'MASK_TO_NEXT_SCENE', ['scatter_transition_mask'], { direction: 'left_to_right' })],
      motion_phrases: [phrase('scatter_phrase_paths', 'PATH_CAUSAL_REVEAL', ['scatter_ray_one', 'scatter_ray_two', 'scatter_ray_three', 'scatter_ray_four'], 'HIGH', 'radial'), phrase('scatter_phrase_title', 'STAGGERED_REVEAL', ['scatter_title'], 'MEDIUM', 'up')],
      camera_moves: [camera('scatter_camera', 'CAMERA_PUNCH_IN', 'scatter_system', 0.55, 'ACCENT')],
      anchors: [anchor('scatter_core_entry', 'scatter_core', 'entity_scatter_core', 'scale'), anchor('scatter_mask_exit', 'scatter_transition_mask', 'entity_color_field', 'mask')],
      depth_layers: [],
      choreography: [event('scatter_event_enter', 'ENTER', 'scatter_title', 'STAGGERED_REVEAL'), event('scatter_event_rays', 'ACCENT', 'scatter_ray_one', 'PATH_CAUSAL_REVEAL', 'scatter_event_enter'), event('scatter_event_mask', 'EXIT', 'scatter_transition_mask', 'MASK_TO_NEXT_SCENE', 'scatter_event_rays')], reserved_regions: [],
    }),
    sceneBase(explanationB.id, explanationB.narrative_role, {
      layout: 'EDITORIAL_SPLIT', visual_focus_id: 'spectrum_blue', entry_anchor_id: 'spectrum_field_entry', exit_anchor_id: 'spectrum_blue_exit', complexity: 'MEDIUM', motion_intensity: 'MEDIUM', information_density: 'BALANCED', background_role: 'accent',
      entities: spectrumEntities,
      relations: [{ id: 'spectrum_relation_text', subject: 'spectrum_blue', relation: 'left_of', object: 'spectrum_explanation' }],
      patterns: [patternInstance('spectrum_pattern_split', 'EDITORIAL_SPLIT', ['spectrum_blue', 'spectrum_explanation']), patternInstance('spectrum_pattern_lines', 'PATH_DRAW_EXPLANATION', ['spectrum_line_one', 'spectrum_line_two', 'spectrum_line_three'])],
      motion_phrases: [phrase('spectrum_phrase_type', 'HERO_WORD_IMPACT', ['spectrum_blue'], 'HIGH', 'up'), phrase('spectrum_phrase_lines', 'PATH_CAUSAL_REVEAL', ['spectrum_line_one', 'spectrum_line_two', 'spectrum_line_three'], 'MEDIUM', 'right')],
      camera_moves: [], anchors: [anchor('spectrum_field_entry', 'spectrum_color_field', 'entity_color_field', 'color'), anchor('spectrum_blue_exit', 'spectrum_blue', 'entity_blue_word', 'scale')], depth_layers: [],
      choreography: [event('spectrum_event_enter', 'ENTER', 'spectrum_color_field', 'VISUAL_BREATH'), event('spectrum_event_lines', 'ACCENT', 'spectrum_line_one', 'PATH_CAUSAL_REVEAL', 'spectrum_event_enter'), event('spectrum_event_word', 'SETTLE', 'spectrum_blue', 'HERO_WORD_IMPACT', 'spectrum_event_lines')], reserved_regions: [],
    }),
    sceneBase(example.id, example.narrative_role, {
      layout: 'ASYMMETRIC_HERO', visual_focus_id: 'horizon_orb', entry_anchor_id: 'horizon_orb_entry', exit_anchor_id: 'horizon_orb_exit', complexity: 'MEDIUM', motion_intensity: 'LOW', information_density: 'SPARSE', background_role: 'inverse',
      entities: horizonEntities,
      relations: [{ id: 'horizon_relation_orb', subject: 'horizon_orb', relation: 'above', object: 'horizon_line' }, { id: 'horizon_relation_copy', subject: 'horizon_copy', relation: 'left_of', object: 'horizon_orb' }],
      patterns: [patternInstance('horizon_pattern_foreground', 'FOREGROUND_OCCLUSION', ['horizon_camera_group']), patternInstance('horizon_pattern_split', 'EDITORIAL_SPLIT', ['horizon_copy', 'horizon_orb'])],
      motion_phrases: [phrase('horizon_phrase_breath', 'VISUAL_BREATH', ['horizon_breath'], 'LOW', 'none'), phrase('horizon_phrase_path', 'PATH_CAUSAL_REVEAL', ['horizon_line'], 'LOW', 'right')],
      camera_moves: [camera('horizon_camera', 'CAMERA_CONTINUOUS_ZOOM', 'horizon_camera_group', 0.38, 'HOLD')],
      anchors: [anchor('horizon_orb_entry', 'horizon_orb', 'entity_orb', 'position'), anchor('horizon_orb_exit', 'horizon_orb', 'entity_orb', 'scale')],
      depth_layers: [{ entity_id: 'horizon_field', plane: 'BACKGROUND', parallax_factor: 0.15, occludes: [] }, { entity_id: 'horizon_camera_group', plane: 'MIDGROUND', parallax_factor: 0.7, occludes: ['horizon_field'] }, { entity_id: 'horizon_breath', plane: 'FOREGROUND', parallax_factor: 1.1, occludes: ['horizon_camera_group'] }],
      choreography: [event('horizon_event_enter', 'ENTER', 'horizon_line', 'PATH_CAUSAL_REVEAL'), event('horizon_event_hold', 'HOLD', 'horizon_breath', 'VISUAL_BREATH', 'horizon_event_enter'), event('horizon_event_exit', 'EXIT', 'horizon_orb', 'CAMERA_CONTINUOUS_ZOOM', 'horizon_event_hold')], reserved_regions: [{ id: 'horizon_breath_region', region: 'bottom', reason: 'Moment de respiration avant le payoff.' }],
    }),
    sceneBase(takeaway.id, takeaway.narrative_role, {
      layout: 'LAYERED_POSTER', visual_focus_id: 'payoff_orb', entry_anchor_id: 'payoff_orb_entry', exit_anchor_id: null, complexity: 'HIGH', motion_intensity: 'HIGH', information_density: 'BALANCED', background_role: 'background',
      entities: payoffEntities,
      relations: [{ id: 'payoff_relation_type', subject: 'payoff_type', relation: 'behind', object: 'payoff_orb' }, { id: 'payoff_relation_horizon', subject: 'payoff_horizon', relation: 'behind', object: 'payoff_orb' }],
      patterns: [patternInstance('payoff_pattern_type', 'TYPE_BEHIND_SUBJECT', ['payoff_type', 'payoff_orb']), patternInstance('payoff_pattern_impact', 'KINETIC_WORD_IMPACT', ['payoff_type'])],
      motion_phrases: [phrase('payoff_phrase_impact', 'HERO_WORD_IMPACT', ['payoff_type'], 'HIGH', 'up'), phrase('payoff_phrase_settle', 'VISUAL_BREATH', ['payoff_orb', 'payoff_copy'], 'LOW', 'none')],
      camera_moves: [],
      anchors: [anchor('payoff_orb_entry', 'payoff_orb', 'entity_orb', 'scale')],
      depth_layers: [{ entity_id: 'payoff_field', plane: 'BACKGROUND', parallax_factor: 0.1, occludes: [] }, { entity_id: 'payoff_type', plane: 'MIDGROUND', parallax_factor: 0.6, occludes: ['payoff_field'] }, { entity_id: 'payoff_orb', plane: 'FOREGROUND', parallax_factor: 1.15, occludes: ['payoff_type', 'payoff_field'] }],
      choreography: [event('payoff_event_enter', 'ENTER', 'payoff_type', 'HERO_WORD_IMPACT'), event('payoff_event_impact', 'ACCENT', 'payoff_type', 'HERO_WORD_IMPACT', 'payoff_event_enter'), event('payoff_event_settle', 'SETTLE', 'payoff_copy', 'VISUAL_BREATH', 'payoff_event_impact'), event('payoff_event_hold', 'HOLD', 'payoff_orb', 'VISUAL_BREATH', 'payoff_event_settle')], reserved_regions: [],
    }),
  ];

  const bridge = (value: Omit<SceneBridge, 'id'>): Omit<SceneBridge, 'id'> => value;
  return {
    style_id: 'aurora_visual', scenes,
    bridges: [
      bridge({ bridge_id: 'PATH_CONTINUE', version: '1.0.0', source_scene_id: hook.id, destination_scene_id: context.id, source_anchor_id: 'hook_ray_exit', destination_anchor_id: 'context_ray_entry', visual_entity_id: 'entity_light_ray', duration_ms: 600, easing: 'PRECISE', fallback_policy: 'compatible_simplified' }),
      bridge({ bridge_id: 'MASK_EXPANSION', version: '1.0.0', source_scene_id: explanationA.id, destination_scene_id: explanationB.id, source_anchor_id: 'scatter_mask_exit', destination_anchor_id: 'spectrum_field_entry', visual_entity_id: 'entity_color_field', duration_ms: 900, easing: 'IMPACTFUL', fallback_policy: 'compatible_simplified' }),
      bridge({ bridge_id: 'ELEMENT_CARRY', version: '1.0.0', source_scene_id: example.id, destination_scene_id: takeaway.id, source_anchor_id: 'horizon_orb_exit', destination_anchor_id: 'payoff_orb_entry', visual_entity_id: 'entity_orb', duration_ms: 720, easing: 'PRECISE', fallback_policy: 'exact_only' }),
    ],
    motifs: [
      { id: 'motif_light_path', kind: 'path', entity_id: 'entity_light_ray', scene_ids: [hook.id, context.id] },
      { id: 'motif_orb', kind: 'visual_entity', entity_id: 'entity_orb', scene_ids: [example.id, takeaway.id] },
      { id: 'motif_cyan_accent', kind: 'color', entity_id: null, scene_ids: plan.scenes.map((scene) => scene.id) },
    ],
  };
}

export function p31Style(): ResolvedStyle {
  const loaded = loadStyleFile(path.join(WORKSPACE, 'fixtures', 'p3.1', 'aurora.style.json'), FONT_LIBRARY);
  const resolved = resolveStyle({ style: loaded });
  if (!resolved.ok) throw new Error(`Style P3.1 invalide : ${JSON.stringify(resolved.issues)}`);
  return resolved.value;
}

export function p31CreativePlan(): CreativePlan {
  const planned = planCreativeStory(readJson('visual-compiler/fixtures/p3.1/blue-sky.planner-input.json'));
  if (!planned.ok || !planned.creative_plan) throw new Error(`CreativePlan P3.1 invalide : ${JSON.stringify(planned.report?.diagnostics)}`);
  return planned.creative_plan;
}

export function p31VisualPlan(): VisualPlan {
  const creativePlan = p31CreativePlan();
  return compileCreativePlanToVisualPlan(creativePlan, { style_id: 'aurora_visual', direction: blueSkyDirection(creativePlan) });
}

export interface P31Pipeline {
  readonly creative_plan: CreativePlan;
  readonly visual_plan: VisualPlan;
  readonly visual_compile: VisualCompileResult;
  readonly p1: CompilerPipelineResult;
  readonly style: ResolvedStyle;
  readonly diversity: ReturnType<typeof buildVisualDiversityReport>;
}

export function buildP31Pipeline(renderScale = 0.5): P31Pipeline {
  const creativePlan = p31CreativePlan();
  const visualPlan = compileCreativePlanToVisualPlan(creativePlan, { style_id: 'aurora_visual', direction: blueSkyDirection(creativePlan) });
  const style = p31Style();
  const definition = pattern();
  const visualCompile = compileVisualPlan(visualPlan, { resolved_style: style, pattern: definition, target_platform: 'shorts', asset_refs: new Set() });
  if (!visualCompile.ok || !visualCompile.motion_spec) throw new Error(`Visual Compiler P3.1 invalide : ${JSON.stringify(visualCompile.diagnostics)}`);
  const p1 = compilePipeline({
    spec: visualCompile.motion_spec, resolvedStyle: style, platformPresets: platforms(), pattern: definition,
    fontResources: p14FontResources(style), assetResources: {},
    config: { fps: 30, render_scale: renderScale, minimum_readable_size: renderScale === 1 ? 28 : 14 },
  });
  return { creative_plan: creativePlan, visual_plan: visualPlan, visual_compile: visualCompile, p1, style, diversity: buildVisualDiversityReport(visualPlan) };
}

export function p31FontBytes(): number {
  return readFileSync(path.join(WORKSPACE, 'packs', 'fonts', 'noto_sans_mono', 'noto-sans-mono-wdth-wght.ttf')).byteLength;
}
