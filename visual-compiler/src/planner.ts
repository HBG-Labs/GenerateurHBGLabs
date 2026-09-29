import { hashCreativeDocument } from '@motion-engine/creative-core';
import type { CreativePlan, SceneIntent } from '@motion-engine/creative-core';
import {
  ACTIVE_VISUAL_GRAMMAR,
  VisualPlanSchema,
  visualStableId,
} from '@motion-engine/visual-core';
import type { VisualEntity, VisualPlan, VisualScene } from '@motion-engine/visual-core';

import type { CreativeToVisualOptions, VisualDirection, VisualSceneDirection } from './contracts.ts';

function hierarchy(scene: SceneIntent): VisualEntity['hierarchy'] {
  const source = scene.visual?.elements[0]?.hierarchy;
  return source === 'primary' ? 'HERO' : source === 'secondary' ? 'SECONDARY' : source === 'supporting' ? 'SUPPORT' : 'DECORATIVE';
}

function defaultText(scene: SceneIntent): string {
  return scene.content.on_screen[0]?.text
    ?? scene.content.spoken[0]?.text
    ?? scene.content.semantic_meaning
    ?? scene.semantic_purpose;
}

function defaultDirectionScene(scene: SceneIntent, index: number): VisualSceneDirection {
  const entityId = visualStableId('visual_entity', { scene: scene.id, role: 'focus' });
  const patternId = scene.narrative_role === 'hook' ? 'KINETIC_WORD_IMPACT' : 'EDITORIAL_SPLIT';
  const entity: VisualEntity = {
    id: entityId, visual_entity_id: null, kind: 'text', semantic_role: scene.narrative_role,
    hierarchy: hierarchy(scene), region: index % 2 === 0 ? 'center' : 'upper', parent_id: null,
    persistent: false, safe: true,
    text: { value: defaultText(scene).slice(0, 240), role: scene.narrative_role === 'hook' ? 'DISPLAY' : 'HEADLINE', accent_words: [], align: index % 2 === 0 ? 'center' : 'start' },
    shape: null, path: null, mask: null, asset_ref: null,
    style: { fill: 'background', stroke: 'accent', text: 'foreground' },
    transform: { scale: 1, rotate_deg: 0, translate_x: 0, translate_y: 0 },
  };
  return {
    source_scene_id: scene.id,
    narrative_role: scene.narrative_role,
    layout: index % 2 === 0 ? 'CENTER_HERO' : 'ASYMMETRIC_HERO',
    visual_focus_id: entity.id,
    entry_anchor_id: null,
    exit_anchor_id: null,
    complexity: 'LOW',
    motion_intensity: scene.motion?.intensity && scene.motion.intensity > 0.75 ? 'HIGH' : 'MEDIUM',
    information_density: scene.pacing?.information_density && scene.pacing.information_density > 0.66 ? 'DENSE' : 'BALANCED',
    background_role: index % 2 === 0 ? 'background' : 'inverse',
    entities: [entity], relations: [],
    patterns: [{ id: visualStableId('pattern', { scene: scene.id, patternId }), pattern_id: patternId, version: '1.0.0', target_ids: [entity.id], parameters: {} }],
    motion_phrases: [{ id: visualStableId('phrase', { scene: scene.id, id: 'VISUAL_BREATH' }), phrase_id: scene.narrative_role === 'hook' ? 'HERO_WORD_IMPACT' : 'VISUAL_BREATH', version: '1.0.0', target_ids: [entity.id], intensity: scene.narrative_role === 'hook' ? 'HIGH' : 'LOW', direction: 'up' }],
    camera_moves: [], anchors: [], depth_layers: [],
    choreography: [{ id: visualStableId('event', { scene: scene.id, phase: 'ENTER' }), phase: 'ENTER', target_id: entity.id, action_id: scene.narrative_role === 'hook' ? 'HERO_WORD_IMPACT' : 'VISUAL_BREATH', trigger: { relation: 'at_phase_start', event_id: null } }],
    reserved_regions: [],
  };
}

function sceneDuration(scene: SceneIntent): number {
  return Math.round((scene.pacing?.desired_duration?.preferred_seconds ?? 3) * 1_000);
}

function mapDirection(plan: CreativePlan, direction: VisualDirection): VisualPlan['scenes'] {
  const sourceScenes = new Map(plan.scenes.map((scene) => [scene.id, scene]));
  return direction.scenes.map((entry) => {
    const source = sourceScenes.get(entry.source_scene_id);
    if (!source) throw new Error(`visual.direction.source_scene_missing:${entry.source_scene_id}`);
    return {
      ...entry,
      id: visualStableId('vscene', { plan: plan.plan_id, source: source.id }),
      source_scene_id: source.id,
      duration_ms: sceneDuration(source),
    };
  });
}

export function compileCreativePlanToVisualPlan(plan: CreativePlan, options: CreativeToVisualOptions): VisualPlan {
  const scenes: VisualPlan['scenes'] = options.direction
    ? mapDirection(plan, options.direction)
    : plan.scenes.map((scene, index): VisualScene => ({
        ...defaultDirectionScene(scene, index),
        id: visualStableId('vscene', { plan: plan.plan_id, source: scene.id }),
        source_scene_id: scene.id,
        duration_ms: sceneDuration(scene),
      }));
  const sceneId = new Map(scenes.map((scene) => [scene.source_scene_id, scene.id]));
  const direction = options.direction;
  const bridges = direction?.bridges.map((bridge) => ({
    ...bridge,
    id: visualStableId('bridge', bridge),
    source_scene_id: sceneId.get(bridge.source_scene_id) ?? bridge.source_scene_id,
    destination_scene_id: sceneId.get(bridge.destination_scene_id) ?? bridge.destination_scene_id,
  })) ?? [];
  const targetDuration = scenes.reduce((sum, scene) => sum + scene.duration_ms, 0);
  const value = {
    schema: 'visual-plan' as const,
    schema_version: '0.1.0' as const,
    plan_id: visualStableId('visual_plan', { creative: plan.plan_id, style: options.style_id, direction: direction ?? null }),
    source: { creative_plan_id: plan.plan_id, creative_plan_sha256: hashCreativeDocument(plan), pipeline_path: 'visual_directed' as const },
    grammar: {
      version: ACTIVE_VISUAL_GRAMMAR.version,
      fingerprints: { grammar: ACTIVE_VISUAL_GRAMMAR.fingerprint, ...ACTIVE_VISUAL_GRAMMAR.registry_fingerprints },
    },
    target: { format: 'vertical_short_form' as const, duration_ms: targetDuration },
    style_id: options.style_id,
    scenes,
    bridges,
    motifs: direction?.motifs ?? [],
  };
  return VisualPlanSchema.parse(value);
}
