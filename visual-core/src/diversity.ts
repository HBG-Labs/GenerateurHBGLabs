import { hashVisualDocument } from './canonical.ts';
import type { VisualPlan } from './contracts.ts';

export interface VisualDiversityReport {
  readonly schema: 'visual-diversity-report';
  readonly schema_version: '0.1.0';
  readonly visual_plan_sha256: string;
  readonly layouts: readonly string[];
  readonly patterns: readonly string[];
  readonly motion_phrases: readonly string[];
  readonly bridges: readonly string[];
  readonly camera_moves: readonly string[];
  readonly depth_strategies: readonly string[];
  readonly consecutive_repetitions: readonly { kind: string; value: string; scene_ids: readonly string[] }[];
  readonly declared_motifs: readonly string[];
  readonly morphs?: readonly string[];
  readonly camera_continuities?: readonly string[];
  readonly causal_chains?: readonly string[];
  readonly typography_phrases?: readonly string[];
  readonly intentional_cuts?: number;
  readonly degraded_transitions?: number;
}
function repetitions(plan: VisualPlan): VisualDiversityReport['consecutive_repetitions'] {
  const result: Array<{ kind: string; value: string; scene_ids: readonly string[] }> = [];
  const check = (kind: string, values: readonly { scene: string; value: string }[]): void => {
    let start = 0;
    while (start < values.length) {
      let end = start + 1;
      while (end < values.length && values[end]?.value === values[start]?.value) end += 1;
      if (end - start >= 2) result.push({ kind, value: values[start]!.value, scene_ids: values.slice(start, end).map((entry) => entry.scene) });
      start = end;
    }
  };
  check('layout', plan.scenes.map((scene) => ({ scene: scene.id, value: scene.layout })));
  check('pattern', plan.scenes.map((scene) => ({ scene: scene.id, value: scene.patterns[0]?.pattern_id ?? 'NONE' })));
  check('phrase', plan.scenes.map((scene) => ({ scene: scene.id, value: scene.motion_phrases[0]?.phrase_id ?? 'NONE' })));
  return result;
}

export function buildVisualDiversityReport(plan: VisualPlan): VisualDiversityReport {
  const unique = (values: readonly string[]): string[] => [...new Set(values)].sort();
  const base: VisualDiversityReport = {
    schema: 'visual-diversity-report', schema_version: '0.1.0', visual_plan_sha256: hashVisualDocument(plan),
    layouts: unique(plan.scenes.map((scene) => scene.layout)),
    patterns: unique(plan.scenes.flatMap((scene) => scene.patterns.map((entry) => entry.pattern_id))),
    motion_phrases: unique(plan.scenes.flatMap((scene) => scene.motion_phrases.map((entry) => entry.phrase_id))),
    bridges: unique(plan.bridges.map((entry) => entry.bridge_id)),
    camera_moves: unique(plan.scenes.flatMap((scene) => scene.camera_moves.map((entry) => entry.camera_id))),
    depth_strategies: unique(plan.scenes.flatMap((scene) => scene.depth_layers.map((entry) => entry.plane))),
    consecutive_repetitions: repetitions(plan),
    declared_motifs: unique(plan.motifs.map((entry) => entry.id)),
  };
  if (plan.schema_version === '0.1.0') return base;
  return {
    ...base,
    morphs: unique(plan.scenes.flatMap((scene) => (scene.morph_chains ?? []).map((entry) => `${entry.kind}:${entry.steps.map((step) => step.representation).join('>')}`))),
    camera_continuities: unique((plan.camera_continuities ?? []).map((entry) => `${entry.energy}:${entry.velocity_intent}:${entry.scale_momentum}`)),
    causal_chains: unique(plan.scenes.flatMap((scene) => (scene.causal_relations ?? []).map((entry) => entry.relation))),
    typography_phrases: unique(plan.scenes.flatMap((scene) => scene.motion_phrases.filter((entry) => entry.phrase_id.startsWith('TYPE_') || entry.phrase_id.includes('WORD_')).map((entry) => entry.phrase_id))),
    intentional_cuts: plan.scenes.reduce((sum, scene) => sum + scene.motion_phrases.filter((entry) => entry.phrase_id === 'IMPACT_CUT').length, 0),
    degraded_transitions: 0,
  };
}
