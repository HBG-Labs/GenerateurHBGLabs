import type { CreativeDiagnostic } from '../contracts/diagnostics.ts';
import { deriveCreativeId } from '../stable-id.ts';
import type { NarrativeArchetype } from './archetypes.ts';
import type { InformationDensity, PlannerInput, PlanningDecision, SceneAllocation, StoryBeat } from './contracts.ts';
import type { PlannerLimits } from './limits.ts';

interface SceneGroup {
  readonly beats: readonly StoryBeat[];
  readonly split_index: number;
}

export interface DurationPlanResult {
  readonly scenes: readonly SceneAllocation[];
  readonly decisions: readonly PlanningDecision[];
  readonly diagnostics: readonly CreativeDiagnostic[];
}

const densityRank: Record<InformationDensity, number> = { minimal: 0, low: 1, medium: 2, high: 3 };

function highestDensity(beats: readonly StoryBeat[]): InformationDensity {
  return [...beats].sort(
    (left, right) => densityRank[right.information_density] - densityRank[left.information_density],
  )[0]!.information_density;
}

function integerAllocation(
  total: number,
  items: readonly { readonly id: string; readonly weight: number; readonly minimum: number }[],
): readonly number[] | null {
  const minimumTotal = items.reduce((sum, item) => sum + item.minimum, 0);
  if (minimumTotal > total) return null;
  const remaining = total - minimumTotal;
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const allocations = items.map((item) => item.minimum + Math.floor((remaining * item.weight) / totalWeight));
  const allocated = allocations.reduce((sum, value) => sum + value, 0);
  let leftover = total - allocated;
  const remainderOrder = items
    .map((item, index) => ({
      index,
      id: item.id,
      remainder: (remaining * item.weight) % totalWeight,
    }))
    .sort((left, right) => right.remainder - left.remainder || left.id.localeCompare(right.id, 'en'));
  let cursor = 0;
  while (leftover > 0) {
    allocations[remainderOrder[cursor % remainderOrder.length]!.index]! += 1;
    cursor += 1;
    leftover -= 1;
  }
  return allocations;
}

function mergeIntoGroups(beats: readonly StoryBeat[], count: number): SceneGroup[] {
  const baseSize = Math.floor(beats.length / count);
  let remainder = beats.length % count;
  const groups: SceneGroup[] = [];
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    const size = baseSize + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    groups.push({ beats: beats.slice(cursor, cursor + size), split_index: 0 });
    cursor += size;
  }
  return groups;
}

function splitIntoGroups(beats: readonly StoryBeat[], count: number, archetype: NarrativeArchetype): SceneGroup[] {
  const occurrences = new Map(beats.map((beat) => [beat.id, 1]));
  const candidates = beats
    .filter((beat) => beat.splittable)
    .sort(
      (left, right) =>
        right.importance * right.duration_weight - left.importance * left.duration_weight || left.id.localeCompare(right.id, 'en'),
    );
  let currentCount = beats.length;
  let cursor = 0;
  while (currentCount < count && candidates.length > 0) {
    const candidate = candidates[cursor % candidates.length]!;
    const existing = occurrences.get(candidate.id) ?? 1;
    if (existing < archetype.validation_rules.max_repeated_role_scenes) {
      occurrences.set(candidate.id, existing + 1);
      currentCount += 1;
    }
    cursor += 1;
    if (cursor > count * candidates.length * archetype.validation_rules.max_repeated_role_scenes) break;
  }
  return beats.flatMap((beat) =>
    Array.from({ length: occurrences.get(beat.id) ?? 1 }, (_, splitIndex) => ({ beats: [beat], split_index: splitIndex })),
  );
}

function constraintSceneRange(input: PlannerInput): { min: number; max: number } {
  const mins = input.constraints.filter((constraint) => constraint.kind === 'min_scenes').map((constraint) => constraint.value);
  const maxes = input.constraints.filter((constraint) => constraint.kind === 'max_scenes').map((constraint) => constraint.value);
  return {
    min: mins.length > 0 ? Math.max(...mins) : 1,
    max: maxes.length > 0 ? Math.min(...maxes) : Number.MAX_SAFE_INTEGER,
  };
}

export function allocateSceneDurations(
  input: PlannerInput,
  archetype: NarrativeArchetype,
  beats: readonly StoryBeat[],
  limits: PlannerLimits,
): DurationPlanResult {
  const diagnostics: CreativeDiagnostic[] = [];
  const decisions: PlanningDecision[] = [];
  if (beats.length === 0) {
    return {
      scenes: [],
      decisions,
      diagnostics: [
        {
          code: 'planner.structure_empty',
          severity: 'error',
          path: '$.narrative_archetype',
          message: 'Aucun beat narratif ne peut être planifié.',
          suggested_action: 'Vérifier l’archétype et les contraintes de rôles.',
        },
      ],
    };
  }

  const band =
    archetype.duration_strategy.scene_count_bands.find((candidate) => input.target_duration_ms <= candidate.max_duration_ms) ??
    archetype.duration_strategy.scene_count_bands.at(-1)!;
  const range = constraintSceneRange(input);
  const maxByDuration = Math.floor(input.target_duration_ms / archetype.duration_strategy.minimum_scene_ms);
  const absoluteMax = Math.min(maxByDuration, range.max, limits.max_scenes);
  const pacingAdjustment = { slow: -1, measured: 0, medium: 0, fast: 1, aggressive: 2 }[input.pacing];
  const desired = Math.min(Math.max(band.max_scenes + pacingAdjustment, range.min, 1), absoluteMax);
  if (absoluteMax < 1 || desired < range.min) {
    diagnostics.push({
      code: 'planner.duration_impossible',
      severity: 'error',
      path: '$.target_duration_ms',
      message: 'La durée ne permet pas de satisfaire le nombre minimal de scènes.',
      context: {
        duration_ms: input.target_duration_ms,
        minimum_scene_ms: archetype.duration_strategy.minimum_scene_ms,
        required_scenes: range.min,
      },
      suggested_action: 'Augmenter la durée ou réduire la contrainte min_scenes.',
    });
    return { scenes: [], decisions, diagnostics };
  }

  const groups =
    desired < beats.length
      ? mergeIntoGroups(beats, desired)
      : splitIntoGroups(beats, desired, archetype).slice(0, desired);
  if (groups.length > limits.max_scenes) {
    diagnostics.push({
      code: 'planner.limit.scenes_exceeded',
      severity: 'error',
      path: '$.target_duration_ms',
      message: 'Le nombre de scènes planifiées dépasse la limite.',
      context: { actual: groups.length, limit: limits.max_scenes },
      suggested_action: 'Réduire la durée, les contraintes ou la structure narrative.',
    });
    return { scenes: [], decisions, diagnostics };
  }

  const splitCounts = new Map<string, number>();
  groups.forEach((group) => {
    if (group.beats.length === 1) splitCounts.set(group.beats[0]!.id, (splitCounts.get(group.beats[0]!.id) ?? 0) + 1);
  });
  const weightedGroups = groups.map((group) => {
    const rawWeight = group.beats.reduce((sum, beat) => sum + beat.duration_weight, 0);
    const divisor = group.beats.length === 1 ? (splitCounts.get(group.beats[0]!.id) ?? 1) : 1;
    const id = deriveCreativeId('allocation', {
      input_id: input.input_id,
      archetype: archetype.id,
      beats: group.beats.map((beat) => beat.id),
      split_index: group.split_index,
    });
    return { id, weight: Math.max(1, Math.floor(rawWeight / divisor)), minimum: archetype.duration_strategy.minimum_scene_ms };
  });
  const allocated = integerAllocation(input.target_duration_ms, weightedGroups);
  if (!allocated) {
    diagnostics.push({
      code: 'planner.duration_impossible',
      severity: 'error',
      path: '$.target_duration_ms',
      message: 'Le budget ne couvre pas la durée minimale des scènes retenues.',
      context: { duration_ms: input.target_duration_ms, scene_count: groups.length },
      suggested_action: 'Augmenter la durée ou autoriser davantage de fusion de beats.',
    });
    return { scenes: [], decisions, diagnostics };
  }

  const scenes = groups.map((group, index): SceneAllocation => {
    const sceneId = deriveCreativeId('scene', {
      input_id: input.input_id,
      archetype: archetype.id,
      archetype_version: archetype.version,
      beat_ids: group.beats.map((beat) => beat.id),
      split_index: group.split_index,
    });
    if (group.beats.length > 1) {
      decisions.push({
        code: 'planner.scene.beats_merged',
        kind: 'merged',
        node_ids: [sceneId, ...group.beats.map((beat) => beat.id)],
        context: { scene_id: sceneId, beat_count: group.beats.length },
      });
    }
    if ((splitCounts.get(group.beats[0]!.id) ?? 1) > 1 && group.beats.length === 1) {
      decisions.push({
        code: 'planner.scene.beat_split',
        kind: 'split',
        node_ids: [sceneId, group.beats[0]!.id],
        context: { scene_id: sceneId, split_index: group.split_index },
      });
    }
    decisions.push({
      code: 'planner.duration.allocated',
      kind: 'allocated',
      node_ids: [sceneId],
      context: { duration_ms: allocated[index]!, weight: weightedGroups[index]!.weight },
    });
    return {
      scene_id: sceneId,
      beat_ids: group.beats.map((beat) => beat.id),
      primary_role: group.beats[0]!.role,
      duration_ms: allocated[index]!,
      information_density: highestDensity(group.beats),
      split_index: group.split_index,
    };
  });
  return { scenes, decisions, diagnostics };
}
