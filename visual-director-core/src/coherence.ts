import type { SequenceCoherenceReport, VisualDirectionPlan } from './contracts.ts';

function unique(values: readonly string[]): boolean {
  return new Set(values).size > 1;
}

export function buildSequenceCoherenceReport(plan: VisualDirectionPlan): SequenceCoherenceReport {
  const motifStates = plan.scenes.map((scene) => scene.motif_state);
  const motifResolved = !plan.motif.lifecycle_required
    || (motifStates.includes('INTRODUCE') && motifStates.includes('RESOLVE'));
  const layouts = plan.scenes.map((scene) => scene.layout_id ?? 'DEFAULT');
  const bridges = plan.bridges.map((bridge) => bridge.bridge_id);
  const focus = plan.scenes.map((scene) => scene.focus);
  const intensity = plan.global_intensity_arc.map((point) => point.intensity);
  const cameras = plan.scenes.map((scene) => scene.camera_id).filter((entry): entry is string => entry !== null);
  const assetMaterials = plan.scenes.flatMap((scene) => scene.asset_intents.map((asset) => asset.material));
  const observations: string[] = [];
  if (!motifResolved) observations.push('Le motif requis n’est pas résolu dans la séquence.');
  if (!unique(layouts)) observations.push('La même famille de layout domine toute la séquence.');
  if (!unique(focus)) observations.push('Le focus visuel ne progresse pas.');
  if (!unique(intensity)) observations.push('L’intensité globale reste plate.');
  if (plan.scenes.every((scene) => scene.motif_state !== 'ABSENT' && scene.visual_role !== 'BREATH')) observations.push('Le motif est présent sans respiration sur toutes les scènes.');
  return {
    schema: 'sequence-coherence-report', schema_version: '0.1.0', direction_plan_id: plan.direction_plan_id,
    motif_continuity: plan.motif.lifecycle_required ? (motifResolved ? 'coherent' : 'broken') : 'not_required',
    pacing_variety: unique(plan.scenes.map((scene) => `${scene.motion_intensity}:${scene.visual_density}`)) ? 'varied' : 'flat',
    layout_variety: unique(layouts) ? 'varied' : 'repetitive',
    bridge_variety: bridges.length === 0 ? 'none' : unique(bridges) ? 'varied' : 'repetitive',
    focus_progression: unique(focus) ? 'progressive' : 'repetitive',
    intensity_progression: unique(intensity) ? 'progressive' : 'flat',
    camera_coherence: cameras.length === 0 ? 'static' : plan.bridges.some((bridge) => bridge.camera_continuity) || plan.camera_strategy === 'MOSTLY_STATIC' ? 'coherent' : 'incoherent',
    asset_coherence: plan.art_direction.asset_coherence === 'MIXED_INTENTIONAL' ? 'mixed_intentionally' : unique(assetMaterials) && assetMaterials.length > 1 ? 'inconsistent' : 'coherent',
    observations,
  };
}
