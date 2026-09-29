import type { CreativePlan } from '@motion-engine/creative-core';
import { hashVisualDocument } from '@motion-engine/visual-core';

import type { VisualDirectorContext } from './contracts.ts';
import {
  MOTION_IDENTITY_DEFINITIONS,
  SEQUENCE_STRATEGY_DEFINITIONS,
  TECHNIQUE_COMPOSITION_DEFINITIONS,
} from './registry.ts';

export const PROVIDER_MUTABLE_FIELDS = Object.freeze([
  'sequence_strategy', 'motion_identity', 'art_direction', 'motif', 'global_pacing', 'global_intensity_arc',
  'continuity_strategy', 'camera_strategy', 'depth_strategy', 'restraint_level', 'budget',
  'scenes.visual_role', 'scenes.semantic_role', 'scenes.focus', 'scenes.layout_id',
  'scenes.technique_composition_id', 'scenes.pattern_ids', 'scenes.phrase_ids', 'scenes.camera_mode',
  'scenes.camera_id', 'scenes.depth_intent', 'scenes.entry_strategy', 'scenes.exit_strategy',
  'scenes.asset_intents', 'scenes.motif_state', 'scenes.motion_intensity', 'scenes.complexity',
  'scenes.visual_density', 'bridges.bridge_id', 'bridges.motivation', 'bridges.persistent_entity_key',
  'bridges.camera_continuity',
]);

export const CANONICAL_IMMUTABLE_FIELDS = Object.freeze([
  'creative_plan_id', 'creative_plan_sha256', 'creative_scene_ids', 'scene_order', 'scene_ids',
  'director_context_sha256', 'registry_fingerprints', 'capabilities', 'registry_definitions',
  'engine_limits', 'factual_requirements', 'asset_availability', 'style_id',
]);

export interface VisualDirectorPlanningContext {
  readonly schema: 'visual-director-planning-context';
  readonly schema_version: '0.1.0';
  readonly canonical: {
    readonly creative_plan_id: string;
    readonly creative_plan_sha256: string;
    readonly scenes: readonly { readonly scene_id: string; readonly narrative_role: string; readonly semantic_purpose: string; readonly has_on_screen_text: boolean; readonly asset_slots: readonly string[] }[];
    readonly style_id: string;
    readonly canvas: VisualDirectorContext['canvas'];
    readonly asset_availability: VisualDirectorContext['available_asset_types'];
  };
  readonly choices: {
    readonly sequence_strategies: readonly string[];
    readonly motion_identities: readonly string[];
    readonly technique_compositions: readonly { readonly id: string; readonly status: string; readonly compatible_roles: readonly string[] }[];
    readonly capabilities: VisualDirectorContext['capabilities'];
  };
  readonly authority: { readonly mutable_fields: readonly string[]; readonly immutable_fields: readonly string[] };
}

export function buildVisualDirectorPlanningContext(plan: CreativePlan, context: VisualDirectorContext): VisualDirectorPlanningContext {
  return {
    schema: 'visual-director-planning-context', schema_version: '0.1.0',
    canonical: {
      creative_plan_id: context.creative_plan_id,
      creative_plan_sha256: context.creative_plan_sha256,
      scenes: plan.scenes.map((scene) => ({ scene_id: scene.id, narrative_role: scene.narrative_role, semantic_purpose: scene.semantic_purpose.slice(0, 500), has_on_screen_text: scene.content.on_screen.length > 0, asset_slots: scene.asset_slots })),
      style_id: context.style_id,
      canvas: context.canvas,
      asset_availability: context.available_asset_types,
    },
    choices: {
      sequence_strategies: SEQUENCE_STRATEGY_DEFINITIONS.filter((entry) => entry.compatible_archetypes.includes(context.narrative_archetype)).map((entry) => entry.id),
      motion_identities: MOTION_IDENTITY_DEFINITIONS.map((entry) => entry.id),
      technique_compositions: TECHNIQUE_COMPOSITION_DEFINITIONS.map((entry) => ({ id: entry.id, status: entry.status, compatible_roles: entry.compatible_roles })),
      capabilities: context.capabilities,
    },
    authority: { mutable_fields: PROVIDER_MUTABLE_FIELDS, immutable_fields: CANONICAL_IMMUTABLE_FIELDS },
  };
}

export function hashVisualDirectorPlanningContext(context: VisualDirectorPlanningContext): string {
  return hashVisualDocument(context);
}
