import {
  PlannerInputSchema,
  hashCreativeDocument,
  planCreativeStory,
  type ContentSlot,
  type CreativePlan,
  type PlannerInput,
  type PlanningReport,
  type PlannerOptions,
  type StoryPlanningResult,
} from '@motion-engine/creative-core';
import {
  buildCreativeResolution,
  type CreativeResolution,
} from '@motion-engine/creative-compiler';

import type {
  CreativeGenerationRequest,
  GatewayAssetBinding,
  GatewaySourceVerification,
  PlanningGenerationOutput,
  ResolutionGenerationOutput,
} from './contracts.ts';

export function planningOutputToPlannerInput(
  request: CreativeGenerationRequest,
  output: PlanningGenerationOutput,
): PlannerInput {
  const mergedConstraints = [...request.constraints, ...output.suggested_constraints];
  return PlannerInputSchema.parse({
    schema: 'planner-input',
    schema_version: '0.1.0',
    input_id: `planner_${hashCreativeDocument({ request: request.request_id, output }).slice(0, 16)}`,
    topic: output.normalized_topic,
    creative_goal: output.creative_goal,
    audience: output.audience,
    language: output.language,
    locale: output.locale,
    target_duration_ms: output.target_duration_ms,
    target_format: output.target_format,
    tone: output.tone,
    pacing: output.pacing,
    information_density: output.information_density,
    ...(output.narrative_archetype === undefined ? {} : { narrative_archetype: output.narrative_archetype }),
    desired_reaction: output.desired_reaction,
    factual_mode: output.factual_mode,
    cta: output.cta,
    constraints: mergedConstraints,
    provided_content: [],
  });
}

export function planAcceptedOutput(
  request: CreativeGenerationRequest,
  output: PlanningGenerationOutput,
  options: PlannerOptions = {},
): { readonly planner_input: PlannerInput; readonly planning: StoryPlanningResult } {
  const plannerInput = planningOutputToPlannerInput(request, output);
  return { planner_input: plannerInput, planning: planCreativeStory(plannerInput, options) };
}

export interface ResolutionBuildInput {
  readonly plan: CreativePlan;
  readonly planning_report: PlanningReport;
  readonly content_slots: readonly ContentSlot[];
  readonly output: ResolutionGenerationOutput;
  readonly asset_bindings: readonly GatewayAssetBinding[];
  readonly source_verifications: readonly GatewaySourceVerification[];
}

export function resolutionOutputToCreativeResolution(input: ResolutionBuildInput): CreativeResolution {
  const verifications = new Map(input.source_verifications.map((entry) => [entry.slot_id, entry]));
  return buildCreativeResolution({
    plan: input.plan,
    planning_report: input.planning_report,
    content_slots: input.content_slots,
    content: input.output.content.map((entry) => ({
      slot_id: entry.slot_id,
      ...(entry.scene_id === undefined ? {} : { scene_id: entry.scene_id }),
      text: entry.text,
      ...(verifications.get(entry.slot_id) === undefined
        ? {}
        : { source_slot: verifications.get(entry.slot_id)!.source_slot }),
    })),
    assets: input.asset_bindings.map((entry) => ({
      asset_slot: entry.asset_slot,
      asset_ref: entry.asset_ref,
      ...(entry.focus === undefined ? {} : { focus: entry.focus }),
    })),
  });
}
