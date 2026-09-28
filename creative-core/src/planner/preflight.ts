import type { CreativeDiagnostic } from '../contracts/diagnostics.ts';
import type { NarrativeArchetype } from './archetypes.ts';
import type { ContentSlot, PlannerInput, SceneAllocation, StoryBeat } from './contracts.ts';
import type { PlannerLimits } from './limits.ts';

export interface PlanningPreflightInput {
  readonly planner_input: PlannerInput;
  readonly archetype: NarrativeArchetype;
  readonly beats: readonly StoryBeat[];
  readonly scenes: readonly SceneAllocation[];
  readonly content_slots: readonly ContentSlot[];
  readonly asset_intent_count: number;
  readonly limits: PlannerLimits;
}

export function runPlanningPreflight(input: PlanningPreflightInput): CreativeDiagnostic[] {
  const diagnostics: CreativeDiagnostic[] = [];
  const beatIds = new Set(input.beats.map((beat) => beat.id));
  const sceneIds = new Set(input.scenes.map((scene) => scene.scene_id));
  const slotIds = new Set(input.content_slots.map((slot) => slot.id));
  const allocated = input.scenes.reduce((sum, scene) => sum + scene.duration_ms, 0);

  if (allocated !== input.planner_input.target_duration_ms) {
    diagnostics.push({
      code: 'planner.duration_not_exact',
      severity: 'error',
      path: '$.target_duration_ms',
      message: 'La somme des durées de scènes ne correspond pas exactement à la durée cible.',
      context: { target_ms: input.planner_input.target_duration_ms, allocated_ms: allocated },
      suggested_action: 'Réexécuter l’allocation entière sans arrondi flottant.',
    });
  }
  input.scenes.forEach((scene, index) => {
    if (scene.duration_ms < input.archetype.duration_strategy.minimum_scene_ms) {
      diagnostics.push({
        code: 'planner.scene_too_short',
        severity: 'error',
        path: `$.scenes[${index}].duration_ms`,
        scene_id: scene.scene_id,
        message: 'La scène est plus courte que la durée minimale de l’archétype.',
        context: { actual: scene.duration_ms, minimum: input.archetype.duration_strategy.minimum_scene_ms },
        suggested_action: 'Fusionner des scènes ou augmenter la durée cible.',
      });
    }
    scene.beat_ids.forEach((beatId) => {
      if (beatIds.has(beatId)) return;
      diagnostics.push({
        code: 'planner.reference.beat_missing',
        severity: 'error',
        path: `$.scenes[${index}].beat_ids`,
        node_id: beatId,
        scene_id: scene.scene_id,
        message: `Le beat « ${beatId} » référencé par la scène est absent.`,
        suggested_action: 'Corriger la référence stable.',
      });
    });
  });
  input.beats.forEach((beat) => {
    if (input.scenes.some((scene) => scene.beat_ids.includes(beat.id))) return;
    diagnostics.push({
      code: 'planner.beat_without_scene',
      severity: 'error',
      path: '$.beats',
      node_id: beat.id,
      message: `Le beat « ${beat.role} » n’est affecté à aucune scène.`,
      context: { role: beat.role },
      suggested_action: 'Affecter le beat à une scène, y compris après fusion.',
    });
  });
  for (const requiredRole of input.archetype.required_roles) {
    if (input.beats.some((beat) => beat.role === requiredRole)) continue;
    diagnostics.push({
      code: 'planner.required_role_missing',
      severity: 'error',
      path: '$.beats',
      message: `Le rôle obligatoire « ${requiredRole} » a disparu de la structure.`,
      context: { role: requiredRole, archetype: input.archetype.id },
      suggested_action: 'Conserver le rôle et fusionner sa scène si la durée est courte.',
    });
  }
  for (const ordering of input.archetype.ordering_constraints) {
    const before = input.beats.findIndex((beat) => beat.role === ordering.before);
    const after = input.beats.findIndex((beat) => beat.role === ordering.after);
    if (before < 0 || after < 0 || before < after) continue;
    diagnostics.push({
      code: 'planner.ordering_invalid',
      severity: 'error',
      path: '$.beats',
      message: `L’ordre ${ordering.before} → ${ordering.after} n’est pas respecté.`,
      context: { before: ordering.before, after: ordering.after },
      suggested_action: 'Respecter les contraintes d’ordre de l’archétype.',
    });
  }
  input.content_slots.forEach((slot, index) => {
    if (beatIds.has(slot.beat_id)) return;
    diagnostics.push({
      code: 'planner.reference.content_slot_beat_missing',
      severity: 'error',
      path: `$.content_slots[${index}].beat_id`,
      node_id: slot.id,
      message: 'Le content slot référence un beat absent.',
      context: { beat_id: slot.beat_id },
      suggested_action: 'Corriger la référence ou retirer le slot.',
    });
  });
  if (beatIds.size !== input.beats.length || sceneIds.size !== input.scenes.length || slotIds.size !== input.content_slots.length) {
    diagnostics.push({
      code: 'planner.id.duplicate_output',
      severity: 'error',
      path: '$',
      message: 'La sortie du planner contient des IDs structurants dupliqués.',
      suggested_action: 'Corriger la dérivation déterministe des IDs.',
    });
  }
  if (input.beats.length > input.limits.max_beats) {
    diagnostics.push({
      code: 'planner.limit.beats_exceeded',
      severity: 'error',
      path: '$.beats',
      message: 'Le nombre de beats dépasse la limite.',
      context: { actual: input.beats.length, limit: input.limits.max_beats },
      suggested_action: 'Réduire les rôles narratifs.',
    });
  }
  if (input.scenes.length > input.limits.max_scenes) {
    diagnostics.push({
      code: 'planner.limit.scenes_exceeded',
      severity: 'error',
      path: '$.scenes',
      message: 'Le nombre de scènes dépasse la limite.',
      context: { actual: input.scenes.length, limit: input.limits.max_scenes },
      suggested_action: 'Fusionner des scènes.',
    });
  }
  if (input.content_slots.length > input.limits.max_content_slots) {
    diagnostics.push({
      code: 'planner.limit.content_slots_exceeded',
      severity: 'error',
      path: '$.content_slots',
      message: 'Le nombre de content slots dépasse la limite.',
      context: { actual: input.content_slots.length, limit: input.limits.max_content_slots },
      suggested_action: 'Réduire la structure narrative.',
    });
  }
  if (input.asset_intent_count > input.limits.max_asset_intents) {
    diagnostics.push({
      code: 'planner.limit.asset_intents_exceeded',
      severity: 'error',
      path: '$.asset_intents',
      message: 'Le nombre d’intentions d’asset dépasse la limite.',
      context: { actual: input.asset_intent_count, limit: input.limits.max_asset_intents },
      suggested_action: 'Réduire les besoins d’assets.',
    });
  }
  return diagnostics;
}
