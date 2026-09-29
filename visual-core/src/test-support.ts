import { hashCreativeDocument } from '@motion-engine/creative-core';

import { VisualPlanSchema } from './contracts.ts';
import type { VisualEntity, VisualPlan, VisualScene } from './contracts.ts';
import { ACTIVE_VISUAL_GRAMMAR } from './registry.ts';

function text(id: string, value: string, visualEntityId: string | null = null): VisualEntity {
  return {
    id, visual_entity_id: visualEntityId, kind: 'text', semantic_role: 'headline', hierarchy: 'HERO', region: 'center',
    parent_id: null, persistent: visualEntityId !== null, safe: true,
    text: { value, role: 'DISPLAY', accent_words: [value.split(' ')[0]!], align: 'center' }, shape: null, path: null, mask: null, asset_ref: null,
    style: { fill: 'background', stroke: 'accent', text: 'foreground' },
    transform: { scale: 1, rotate_deg: 0, translate_x: 0, translate_y: 0 },
  };
}
function scene(id: string, source: string, textId: string, value: string, anchorId: string, visualEntityId: string): VisualScene {
  const entity = text(textId, value, visualEntityId);
  return {
    id, source_scene_id: source, narrative_role: 'explanation', duration_ms: 2_000, layout: 'CENTER_HERO',
    visual_focus_id: entity.id, entry_anchor_id: anchorId, exit_anchor_id: anchorId,
    complexity: 'MEDIUM', motion_intensity: 'MEDIUM', information_density: 'BALANCED', background_role: 'background',
    entities: [entity], relations: [],
    patterns: [{ id: `${id}_pattern`, pattern_id: 'KINETIC_WORD_IMPACT', version: '1.0.0', target_ids: [entity.id], parameters: {} }],
    motion_phrases: [{ id: `${id}_phrase`, phrase_id: 'HERO_WORD_IMPACT', version: '1.0.0', target_ids: [entity.id], intensity: 'MEDIUM', direction: 'up' }],
    camera_moves: [],
    anchors: [{ id: anchorId, entity_id: entity.id, visual_entity_id: visualEntityId, property: 'scale', visible_ms: 400 }],
    depth_layers: [],
    choreography: [{ id: `${id}_event`, phase: 'ENTER', target_id: entity.id, action_id: 'HERO_WORD_IMPACT', trigger: { relation: 'at_phase_start', event_id: null } }],
    reserved_regions: [],
  };
}

export function minimalVisualPlan(): VisualPlan {
  const first = scene('visual_scene_one', 'creative_scene_one', 'visual_text_one', 'Une idée devient mouvement', 'anchor_one', 'entity_shared');
  const second = scene('visual_scene_two', 'creative_scene_two', 'visual_text_two', 'Le mouvement garde le sens', 'anchor_two', 'entity_shared');
  return VisualPlanSchema.parse({
    schema: 'visual-plan', schema_version: '0.1.0', plan_id: 'visual_plan_test',
    source: { creative_plan_id: 'creative_plan_test', creative_plan_sha256: hashCreativeDocument({ id: 'creative_plan_test' }), pipeline_path: 'visual_directed' },
    grammar: { version: ACTIVE_VISUAL_GRAMMAR.version, fingerprints: { grammar: ACTIVE_VISUAL_GRAMMAR.fingerprint, ...ACTIVE_VISUAL_GRAMMAR.registry_fingerprints } },
    target: { format: 'vertical_short_form', duration_ms: 4_000 }, style_id: 'generic_visual_style',
    scenes: [first, second],
    bridges: [{ id: 'bridge_shared', bridge_id: 'ELEMENT_CARRY', version: '1.0.0', source_scene_id: first.id, destination_scene_id: second.id, source_anchor_id: 'anchor_one', destination_anchor_id: 'anchor_two', visual_entity_id: 'entity_shared', duration_ms: 500, easing: 'PRECISE', fallback_policy: 'exact_only' }],
    motifs: [{ id: 'motif_shared', kind: 'visual_entity', entity_id: 'entity_shared', scene_ids: [first.id, second.id] }],
  });
}
