import {
  deriveCreativeId,
  type ContentSlot,
  type CreativePlan,
  type PlanningReport,
} from '@motion-engine/creative-core';

import {
  CreativeResolutionSchema,
  type CreativeResolution,
  type ResolvedContentSlot,
} from './contracts.ts';

export interface ContentSlotValue {
  readonly slot_id: string;
  readonly scene_id?: string;
  readonly text: string;
  readonly content_id?: string;
  readonly source_slot?: string;
}

export interface AssetSlotValue {
  readonly asset_slot: string;
  readonly asset_ref: string;
  readonly focus?: { readonly region: string } | { readonly point: { readonly x: number; readonly y: number } };
}

export interface BuildCreativeResolutionInput {
  readonly plan: CreativePlan;
  readonly planning_report: PlanningReport;
  readonly content_slots: readonly ContentSlot[];
  readonly content: readonly ContentSlotValue[];
  readonly assets: readonly AssetSlotValue[];
}

function scenesForBeat(report: PlanningReport, beatId: string): readonly string[] {
  return report.scenes.filter((scene) => scene.beat_ids.includes(beatId)).map((scene) => scene.scene_id);
}

export function buildCreativeResolution(input: BuildCreativeResolutionInput): CreativeResolution {
  const suppliedContent = new Map(input.content.map((entry) => [`${entry.slot_id}:${entry.scene_id ?? '*'}`, entry]));
  const contentSlots: ResolvedContentSlot[] = [];
  input.content_slots.forEach((slot) => {
    scenesForBeat(input.planning_report, slot.beat_id).forEach((sceneId) => {
      const supplied = suppliedContent.get(`${slot.id}:${sceneId}`) ?? suppliedContent.get(`${slot.id}:*`);
      const common = {
        slot_id: slot.id,
        scene_id: sceneId,
        role: slot.role,
        required: slot.required,
        channels: [...slot.constraints.channels],
        factual_requirement: slot.factual_requirement,
        max_characters: slot.constraints.max_characters,
      };
      if (supplied) {
        contentSlots.push({
          ...common,
          status: 'resolved' as const,
          content_id: supplied.content_id ?? deriveCreativeId('resolved_content', {
            plan_id: input.plan.plan_id,
            slot_id: slot.id,
            scene_id: sceneId,
            text: supplied.text,
          }),
          text: supplied.text,
          ...(supplied.source_slot === undefined ? {} : { source_slot: supplied.source_slot }),
        });
        return;
      }
      if (slot.status === 'resolved') {
        contentSlots.push({
          ...common,
          status: 'resolved' as const,
          content_id: deriveCreativeId('resolved_content', {
            plan_id: input.plan.plan_id,
            slot_id: slot.id,
            scene_id: sceneId,
            source_content_id: slot.resolved_content_id,
          }),
          text: slot.text,
          ...(slot.source_slot === undefined ? {} : { source_slot: slot.source_slot }),
        });
        return;
      }
      contentSlots.push({ ...common, status: 'unresolved' });
    });
  });

  const suppliedAssets = new Map(input.assets.map((entry) => [entry.asset_slot, entry]));
  const assetSlots = input.plan.asset_intents.map((intent) => {
    const supplied = suppliedAssets.get(intent.slot);
    const common = { asset_intent_id: intent.id, asset_slot: intent.slot, required: intent.required } as const;
    if (!supplied) return { ...common, status: 'unresolved' as const };
    return {
      ...common,
      status: 'resolved' as const,
      asset_ref: supplied.asset_ref,
      ...(supplied.focus === undefined ? {} : { focus: supplied.focus }),
    };
  });

  return CreativeResolutionSchema.parse({
    schema: 'creative-resolution',
    schema_version: '0.1.0',
    plan_id: input.plan.plan_id,
    content_slots: contentSlots,
    asset_slots: assetSlots,
    audio_events: [],
  });
}
