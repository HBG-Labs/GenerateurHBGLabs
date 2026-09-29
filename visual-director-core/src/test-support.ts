import type { CreativePlan } from '@motion-engine/creative-core';
import { readFileSync } from 'node:fs';

import { createVisualDirectorContext } from './context.ts';
import { DeterministicFixtureDirector } from './fixture-director.ts';
import type { FixtureDirectionSpecification } from './fixture-director.ts';
import type { VisualDirectionPlan, VisualDirectorContext } from './contracts.ts';

export function testCreativePlan(): CreativePlan {
  return JSON.parse(readFileSync(new URL('../../creative-core/fixtures/educational.creative-plan.json', import.meta.url), 'utf8')) as CreativePlan;
}

export function testContext(plan = testCreativePlan()): VisualDirectorContext {
  return createVisualDirectorContext(plan, { narrative_archetype: 'EXPLAINER', style_id: 'spectral_motion', available_asset_types: ['PROCEDURAL_VECTOR', 'UI_SURFACE'], supported_materials: ['FLAT', 'GRADIENT', 'LUMINOUS'] });
}

export function testSpecification(): FixtureDirectionSpecification {
  return {
    sequence_strategy_id: 'BUILD_ESCALATE_BREATH_PAYOFF', motion_identity_id: 'EDITORIAL_PRECISE',
    motif_category: 'FRAME', motif_lifecycle_required: true,
    art_direction: { hierarchy: 'EDITORIAL', scale_hierarchy: 'CONTRASTED', negative_space: 'GENEROUS', visual_density: 'SPARSE', material_intent: 'FLAT', asset_coherence: 'COHERENT' },
    global_pacing: 'DELIBERATE', continuity_strategy: 'SEMANTIC', camera_strategy: 'MOSTLY_STATIC', depth_strategy: 'FLAT_EDITORIAL', restraint_level: 'HIGH',
    budget: { complexity: 'MEDIUM', render_cost: 'MEDIUM', external_assets_allowed: false },
    scenes: [
      { visual_role: 'BREATH', semantic_role: 'TYPOGRAPHIC_STATEMENT', focus: 'TYPE', technique_composition_id: 'BRAND_MOTION_RECIPE_SYSTEM', technique_composition_version: '1.0.0', pattern_ids: [], phrase_ids: ['VISUAL_BREATH'], camera_mode: 'STATIC', camera_id: null, depth_intent: 'FLAT', entry_strategy: 'REVEAL', exit_strategy: 'CARRY', asset_intents: [{ type: 'PROCEDURAL_VECTOR', role: 'SUPPORT', material: 'FLAT', availability: 'AVAILABLE', reason: 'VISUAL_BREATH' }], motif_state: 'INTRODUCE', motion_intensity: 'LOW', complexity: 'LOW', visual_density: 'SPARSE', reason: 'VISUAL_BREATH' },
      { visual_role: 'PAYOFF', semantic_role: 'PAYOFF', focus: 'TYPE', technique_composition_id: 'BUILD_COMPLEXITY_BREATH_PAYOFF', technique_composition_version: '1.0.0', pattern_ids: [], phrase_ids: [], camera_mode: 'INHERIT', camera_id: null, depth_intent: 'SUBTLE', entry_strategy: 'CARRY', exit_strategy: 'STATIC', asset_intents: [], motif_state: 'RESOLVE', motion_intensity: 'MEDIUM', complexity: 'MEDIUM', visual_density: 'BALANCED', reason: 'PAYOFF' },
    ],
    bridges: [{ bridge_id: 'MATCH_POSITION', bridge_version: '1.0.0', motivation: 'SEMANTIC_CONTINUITY', persistent_entity_key: null, camera_continuity: false, reason: 'SEMANTIC_CONTINUITY' }],
  };
}

export function testDirectionPlan(specification = testSpecification()): { plan: CreativePlan; context: VisualDirectorContext; direction: VisualDirectionPlan } {
  const plan = testCreativePlan();
  const context = testContext(plan);
  return { plan, context, direction: new DeterministicFixtureDirector().direct(plan, context, specification) };
}
