import { hashCreativeDocument } from '@motion-engine/creative-core';
import type { CreativePlan } from '@motion-engine/creative-core';
import { visualStableId } from '@motion-engine/visual-core';

import { VisualDirectionPlanSchema } from './contracts.ts';
import type { SceneDirection, VisualDirectionPlan, VisualDirectorContext } from './contracts.ts';
import { hashVisualDirectorContext } from './context.ts';

export interface FixtureSceneDecision extends Omit<SceneDirection, 'id' | 'scene_id' | 'asset_intents'> {
  readonly asset_intents: readonly Omit<SceneDirection['asset_intents'][number], 'id'>[];
}

export interface FixtureDirectionSpecification {
  readonly sequence_strategy_id: string;
  readonly motion_identity_id: string;
  readonly motif_category: VisualDirectionPlan['motif']['category'];
  readonly motif_lifecycle_required: boolean;
  readonly art_direction: VisualDirectionPlan['art_direction'];
  readonly global_pacing: VisualDirectionPlan['global_pacing'];
  readonly continuity_strategy: VisualDirectionPlan['continuity_strategy'];
  readonly camera_strategy: VisualDirectionPlan['camera_strategy'];
  readonly depth_strategy: VisualDirectionPlan['depth_strategy'];
  readonly restraint_level: VisualDirectionPlan['restraint_level'];
  readonly budget: VisualDirectionPlan['budget'];
  readonly scenes: readonly FixtureSceneDecision[];
  readonly bridges: readonly Omit<VisualDirectionPlan['bridges'][number], 'id' | 'source_scene_id' | 'destination_scene_id'>[];
}

export class DeterministicFixtureDirector {
  direct(plan: CreativePlan, context: VisualDirectorContext, specification: FixtureDirectionSpecification): VisualDirectionPlan {
    if (specification.scenes.length !== plan.scenes.length) throw new Error('visual_direction.fixture.scene_count_mismatch');
    if (specification.bridges.length > Math.max(0, plan.scenes.length - 1)) throw new Error('visual_direction.fixture.bridge_count_mismatch');
    const directionPlanId = visualStableId('visual_direction_plan', {
      creative_plan_id: plan.plan_id,
      context: hashVisualDirectorContext(context),
      specification,
    });
    const scenes = plan.scenes.map((scene, index) => {
      const decision = specification.scenes[index]!;
      return {
        ...decision,
        id: visualStableId('scene_direction', { direction: directionPlanId, scene: scene.id }),
        scene_id: scene.id,
        asset_intents: decision.asset_intents.map((asset, assetIndex) => ({
          ...asset,
          id: visualStableId('asset_intent', { direction: directionPlanId, scene: scene.id, assetIndex, type: asset.type, role: asset.role }),
        })),
      };
    });
    const bridges = specification.bridges.map((bridge, index) => {
      const source = plan.scenes[index];
      const destination = plan.scenes[index + 1];
      if (!source || !destination) throw new Error('visual_direction.fixture.bridge_topology');
      return { ...bridge, id: visualStableId('direction_bridge', { direction: directionPlanId, index, source: source.id, destination: destination.id }), source_scene_id: source.id, destination_scene_id: destination.id };
    });
    return VisualDirectionPlanSchema.parse({
      schema: 'visual-direction-plan', schema_version: '0.1.0', direction_plan_id: directionPlanId,
      source: {
        creative_plan_id: plan.plan_id,
        creative_plan_sha256: hashCreativeDocument(plan),
        creative_scene_ids: plan.scenes.map((scene) => scene.id),
        director_context_sha256: hashVisualDirectorContext(context),
        registry_fingerprints: context.registry_fingerprints,
      },
      style_id: context.style_id,
      sequence_strategy: { id: specification.sequence_strategy_id, version: '1.0.0' },
      motion_identity: { id: specification.motion_identity_id, version: '1.0.0' },
      art_direction: specification.art_direction,
      motif: { id: visualStableId('motif', { direction: directionPlanId, category: specification.motif_category }), category: specification.motif_category, lifecycle_required: specification.motif_lifecycle_required },
      global_pacing: specification.global_pacing,
      global_intensity_arc: scenes.map((scene) => ({ scene_id: scene.scene_id, intensity: scene.motion_intensity })),
      continuity_strategy: specification.continuity_strategy,
      camera_strategy: specification.camera_strategy,
      depth_strategy: specification.depth_strategy,
      restraint_level: specification.restraint_level,
      budget: specification.budget,
      scenes,
      bridges,
    });
  }
}
