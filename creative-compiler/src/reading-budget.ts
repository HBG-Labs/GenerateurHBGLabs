import {
  analyzeSubtitleTextFit,
  deriveSubtitleConcisionBudget,
  analyzeTemporalPlan,
  maximumReadableWords,
  minimumReadabilityMs,
  readabilityWordCount,
  resolveRenderGeometry,
  resolveSubtitleFittingContext,
  type FontResource,
  type Layer,
  type MotionSceneSpec,
  type PatternDefinition,
  type Platform,
  type PlatformPresets,
  type ResolvedStyle,
  type Scene,
  type SubtitleFittingContext,
  type SubtitleConcisionBudget,
  type SubtitleTextFitAnalysis,
  type TemporalDiagnostic,
  type TemporalResolution,
} from '@motion-engine/core';
import type {
  ContentSlot,
  CreativeDiagnostic,
  CreativePlan,
  PlanningReport,
} from '@motion-engine/creative-core';

import { compileCreativePlan } from './compiler.ts';
import {
  CREATIVE_TEXT_RUN_MAX_CHARACTERS,
  type CompilationProfile,
  type CreativeCompileProvenance,
  type CreativeResolution,
} from './contracts.ts';
import { creativeMotionFormat } from './profile.ts';
import {
  buildCreativeResolution,
  type ContentSlotValue,
} from './resolution.ts';
import { splitCreativeVoiceText } from './voice-text.ts';

export interface CreativeReadingPolicy {
  readonly profile: CompilationProfile;
  readonly resolved_style: ResolvedStyle;
  readonly pattern: PatternDefinition;
  readonly platform_presets: PlatformPresets;
  readonly font_resources: Readonly<Record<string, FontResource>>;
  readonly platform?: Platform;
  readonly render_scale?: number;
  readonly minimum_readable_size: number;
}

export interface CreativeSubtitleFitBudget {
  readonly scene_id: string;
  readonly preferred_size: number;
  readonly minimum_size: number;
  readonly max_lines: number;
  readonly available_width: number;
  readonly available_height: number;
}

export interface CreativeReadingBudget {
  readonly scene_id: string;
  readonly available_ms: number;
  readonly maximum_total_words: number;
  readonly maximum_recommended_characters_per_entry: number;
  readonly scene_purpose: Scene['purpose'];
}

export interface CreativeReadingIssue {
  readonly scene_id: string;
  readonly available_ms: number;
  readonly required_ms: number;
  readonly maximum_total_words: number;
}

export interface CreativeReadingBudgetResult {
  readonly ok: boolean;
  readonly budgets: readonly CreativeReadingBudget[];
  readonly subtitle_budgets: readonly CreativeSubtitleFitBudget[];
  readonly diagnostics: readonly CreativeDiagnostic[];
}

export interface CreativeReadingInspectionResult {
  readonly ok: boolean;
  readonly issues: readonly CreativeReadingIssue[];
  readonly slot_budgets: readonly CreativeSlotReadingBudget[];
  readonly diagnostics: readonly CreativeDiagnostic[];
}

export interface CreativeSlotReadingBudget {
  readonly slot_id: string;
  readonly scene_id: string;
  readonly available_scene_ms: number;
  readonly already_allocated_ms: number;
  readonly already_allocated_words: number;
  readonly remaining_slot_ms: number;
  readonly current_required_ms: number;
  readonly current_slot_required_ms: number;
  readonly maximum_total_words: number;
  readonly maximum_slot_words: number;
  readonly current_word_count: number;
}

export interface CreativeSubtitleFitIssue {
  readonly slot_id: string;
  readonly scene_id: string;
  readonly segment_index: number;
  readonly analysis: SubtitleTextFitAnalysis;
  readonly concision: SubtitleConcisionBudget;
}

export interface CreativeSubtitleInspectionResult {
  readonly ok: boolean;
  readonly issues: readonly CreativeSubtitleFitIssue[];
  readonly diagnostics: readonly CreativeDiagnostic[];
}

interface ReadingCandidateInput {
  readonly plan: CreativePlan;
  readonly planning_report: PlanningReport;
  readonly content_slots: readonly ContentSlot[];
  readonly content: readonly ContentSlotValue[];
  readonly policy: CreativeReadingPolicy;
}

interface CandidateAnalysis {
  readonly temporal: TemporalResolution | null;
  readonly temporal_diagnostics: readonly TemporalDiagnostic[];
  readonly diagnostics: readonly CreativeDiagnostic[];
  readonly resolution: CreativeResolution;
  readonly motion_spec: MotionSceneSpec | null;
  readonly provenance: CreativeCompileProvenance | null;
}

function subtitleContext(policy: CreativeReadingPolicy): SubtitleFittingContext {
  const geometry = resolveRenderGeometry({
    format: creativeMotionFormat(policy.profile, policy.platform),
    platform_presets: policy.platform_presets,
    resolved_style: policy.resolved_style,
    render_scale: policy.render_scale ?? 1,
  });
  return resolveSubtitleFittingContext({
    resolved_style: policy.resolved_style,
    canvas: geometry.canvas,
    safe_zone: geometry.safe_zone,
    font_resources: policy.font_resources,
    minimum_readable_size: policy.minimum_readable_size,
  });
}

function sceneRequiresSubtitles(plan: CreativePlan, sceneId: string): boolean {
  const scene = plan.scenes.find((entry) => entry.id === sceneId);
  return scene?.subtitles?.required ?? plan.global_intents.subtitles?.required ?? false;
}

function subtitleBudgets(plan: CreativePlan, policy: CreativeReadingPolicy): CreativeSubtitleFitBudget[] {
  const context = subtitleContext(policy);
  return plan.scenes.filter((scene) => sceneRequiresSubtitles(plan, scene.id)).map((scene) => ({
    scene_id: scene.id,
    preferred_size: context.preferred_size,
    minimum_size: context.minimum_size,
    max_lines: context.max_lines,
    available_width: context.box.w,
    available_height: context.box.h,
  }));
}

function placeholderAssets(plan: CreativePlan) {
  return plan.asset_intents.map((asset) => ({
    asset_slot: asset.slot,
    asset_ref: 'reading_budget_asset',
  }));
}

function analyzeCandidate(input: ReadingCandidateInput): CandidateAnalysis {
  const resolution = buildCreativeResolution({
    plan: input.plan,
    planning_report: input.planning_report,
    content_slots: input.content_slots,
    content: input.content,
    assets: placeholderAssets(input.plan),
  });
  const compiled = compileCreativePlan(input.plan, {
    resolution,
    profile: input.policy.profile,
    resolved_style: input.policy.resolved_style,
    pattern: input.policy.pattern,
  });
  if (!compiled.ok || !compiled.motion_spec) {
    return {
      temporal: null,
      temporal_diagnostics: [],
      diagnostics: compiled.report.diagnostics,
      resolution,
      motion_spec: null,
      provenance: null,
    };
  }
  const analysis = analyzeTemporalPlan({
    spec: compiled.motion_spec,
    resolvedStyle: input.policy.resolved_style,
    fps: input.policy.profile.fps,
  });
  return {
    temporal: analysis.resolution,
    temporal_diagnostics: analysis.diagnostics,
    diagnostics: [],
    resolution,
    motion_spec: compiled.motion_spec,
    provenance: compiled.provenance,
  };
}

function contentValue(slot: ContentSlot, text: string): ContentSlotValue {
  return {
    slot_id: slot.id,
    text,
    ...(slot.factual_requirement === 'source_required' ? { source_slot: 'reading_budget_source' } : {}),
  };
}

function budgetFor(
  sceneId: string,
  temporal: TemporalResolution,
  plan: CreativePlan,
  policy: CreativeReadingPolicy,
): CreativeReadingBudget | null {
  const timing = temporal.scenes.find((scene) => scene.scene_id === sceneId);
  const scene = plan.scenes.find((entry) => entry.id === sceneId);
  if (!timing || !scene) return null;
  const purpose = policy.profile.scene_purposes[scene.narrative_role] ?? 'proof';
  return {
    scene_id: sceneId,
    available_ms: timing.reading_available_ms,
    maximum_total_words: maximumReadableWords(
      timing.reading_available_ms,
      purpose,
      plan.audience.locale,
      policy.resolved_style.style.rhythm_personality.reading,
    ),
    maximum_recommended_characters_per_entry: CREATIVE_TEXT_RUN_MAX_CHARACTERS,
    scene_purpose: purpose,
  };
}

function temporalDiagnostic(
  entry: TemporalDiagnostic,
  plan: CreativePlan,
): CreativeDiagnostic {
  const match = /^scenes\[(\d+)\]/u.exec(entry.path);
  const scene = match ? plan.scenes[Number(match[1])] : undefined;
  return {
    code: `creative_reading.${entry.code}`,
    severity: 'error',
    path: entry.path,
    ...(scene ? { scene_id: scene.id } : {}),
    message: entry.message,
    ...(entry.details ? { context: { ...entry.details } } : {}),
    suggested_action: 'Corriger la politique temporelle ou la durée de scène avant de solliciter le provider.',
  };
}

export function deriveCreativeReadingBudgets(input: Omit<ReadingCandidateInput, 'content'>): CreativeReadingBudgetResult {
  const placeholderContent = input.content_slots
    .filter((slot) => slot.status === 'unresolved')
    .map((slot) => contentValue(slot, 'mot'));
  const candidate = analyzeCandidate({ ...input, content: placeholderContent });
  if (!candidate.temporal) return { ok: false, budgets: [], subtitle_budgets: [], diagnostics: candidate.diagnostics };
  const readingDiagnostics = candidate.temporal_diagnostics.filter((entry) => (
    entry.code === 'temporal.impossible_reading'
  ));
  if (readingDiagnostics.length > 0) {
    return {
      ok: false,
      budgets: [],
      subtitle_budgets: [],
      diagnostics: readingDiagnostics.map((entry) => temporalDiagnostic(entry, input.plan)),
    };
  }
  const budgets = input.plan.scenes.flatMap((scene) => {
    const budget = budgetFor(scene.id, candidate.temporal!, input.plan, input.policy);
    return budget ? [budget] : [];
  });
  try {
    return {
      ok: budgets.length === input.plan.scenes.length,
      budgets,
      subtitle_budgets: subtitleBudgets(input.plan, input.policy),
      diagnostics: candidate.diagnostics,
    };
  } catch (error) {
    return {
      ok: false,
      budgets,
      subtitle_budgets: [],
      diagnostics: [{
        code: 'creative_reading.subtitle_context_invalid',
        severity: 'error',
        path: '$.reading_policy',
        message: error instanceof Error ? error.message : 'Le contexte typographique des sous-titres est invalide.',
        suggested_action: 'Corriger le style, le preset plateforme ou les ressources de police avant Stage B.',
      }],
    };
  }
}

function textLayers(layers: readonly Layer[]): Array<{ readonly id: string; readonly text: string }> {
  return layers.flatMap((layer) => {
    const own = layer.primitive === 'text'
      ? [{ id: layer.id, text: layer.content.runs.map((run) => run.text).join(' ') }]
      : [];
    const children = layer.primitive === 'group' || layer.primitive === 'mask'
      ? textLayers(layer.children)
      : [];
    return [...own, ...children];
  });
}

function syntheticWords(count: number): string {
  return Array.from({ length: count }, () => 'mot').join(' ');
}

function slotReadingBudgets(
  input: ReadingCandidateInput,
  candidate: CandidateAnalysis,
  issue: CreativeReadingIssue,
): CreativeSlotReadingBudget[] {
  if (!candidate.motion_spec || !candidate.provenance) return [];
  const scene = candidate.motion_spec.scenes.find((entry) => entry.id === issue.scene_id);
  if (!scene) return [];
  const reading = input.policy.resolved_style.style.rhythm_personality.reading;
  const locale = input.plan.audience.locale;
  const activeLayer = textLayers(scene.layers).sort((left, right) => {
    const leftMs = minimumReadabilityMs(left.text, scene.purpose, locale, reading);
    const rightMs = minimumReadabilityMs(right.text, scene.purpose, locale, reading);
    return rightMs - leftMs || left.id.localeCompare(right.id);
  })[0];
  if (!activeLayer) return [];
  const sourceIds = new Set(candidate.provenance.layers.flatMap((entry) => (
    entry.creative_scene_id === issue.scene_id
      && entry.motion_layer_id === activeLayer.id
      && entry.source_kind === 'content'
      ? [entry.source_id]
      : []
  )));
  const totalWords = readabilityWordCount(activeLayer.text, locale);
  const totalMaximum = issue.maximum_total_words;
  return input.content.flatMap((entry) => {
    const slot = input.content_slots.find((candidateSlot) => candidateSlot.id === entry.slot_id);
    if (!slot?.constraints.channels.includes('on_screen')) return [];
    const applies = entry.scene_id === issue.scene_id
      || (entry.scene_id === undefined
        && input.planning_report.scenes.some((planned) => (
          planned.scene_id === issue.scene_id && planned.beat_ids.includes(slot.beat_id)
        )));
    if (!applies) return [];
    const resolved = candidate.resolution.content_slots.find((candidateSlot) => (
      candidateSlot.slot_id === entry.slot_id
      && candidateSlot.scene_id === issue.scene_id
    ));
    if (!resolved || resolved.status !== 'resolved' || !sourceIds.has(resolved.content_id)) return [];
    const currentWords = readabilityWordCount(resolved.text, locale);
    const otherWords = Math.max(0, totalWords - currentWords);
    const maximumSlotWords = Math.max(0, totalMaximum - otherWords);
    const alreadyAllocatedMs = otherWords === 0
      ? 0
      : minimumReadabilityMs(syntheticWords(otherWords), scene.purpose, locale, reading);
    const remainingSlotMs = maximumSlotWords === 0
      ? 0
      : minimumReadabilityMs(syntheticWords(maximumSlotWords), scene.purpose, locale, reading);
    return [{
      slot_id: entry.slot_id,
      scene_id: issue.scene_id,
      available_scene_ms: issue.available_ms,
      already_allocated_ms: alreadyAllocatedMs,
      already_allocated_words: otherWords,
      remaining_slot_ms: remainingSlotMs,
      current_required_ms: issue.required_ms,
      current_slot_required_ms: currentWords === 0
        ? 0
        : minimumReadabilityMs(resolved.text, scene.purpose, locale, reading),
      maximum_total_words: totalMaximum,
      maximum_slot_words: maximumSlotWords,
      current_word_count: currentWords,
    }];
  });
}

export function inspectCreativeReadingFeasibility(input: ReadingCandidateInput): CreativeReadingInspectionResult {
  const candidate = analyzeCandidate(input);
  if (!candidate.temporal) return { ok: false, issues: [], slot_budgets: [], diagnostics: candidate.diagnostics };
  const issues = candidate.temporal_diagnostics.flatMap((entry) => {
    if (entry.code !== 'temporal.impossible_reading') return [];
    const match = /^scenes\[(\d+)\]/u.exec(entry.path);
    const scene = match ? input.plan.scenes[Number(match[1])] : undefined;
    const available = entry.details?.['available_ms'];
    const required = entry.details?.['required_ms'];
    if (!scene || typeof available !== 'number' || typeof required !== 'number') return [];
    const budget = budgetFor(scene.id, candidate.temporal!, input.plan, input.policy);
    if (!budget) return [];
    return [{
      scene_id: scene.id,
      available_ms: available,
      required_ms: required,
      maximum_total_words: budget.maximum_total_words,
    }];
  });
  const slotBudgets = issues.flatMap((issue) => slotReadingBudgets(input, candidate, issue));
  return { ok: issues.length === 0, issues, slot_budgets: slotBudgets, diagnostics: candidate.diagnostics };
}

/** Vérifie chaque voice_segment P2.3 affiché simultanément avec le fitter P1 exact. */
export function inspectCreativeSubtitleFeasibility(input: ReadingCandidateInput): CreativeSubtitleInspectionResult {
  let context: SubtitleFittingContext;
  try {
    context = subtitleContext(input.policy);
  } catch (error) {
    return {
      ok: false,
      issues: [],
      diagnostics: [{
        code: 'creative_reading.subtitle_context_invalid',
        severity: 'error',
        path: '$.reading_policy',
        message: error instanceof Error ? error.message : 'Le contexte typographique des sous-titres est invalide.',
        suggested_action: 'Corriger le style, le preset plateforme ou les ressources de police avant Stage B.',
      }],
    };
  }
  const slotMap = new Map(input.content_slots.map((slot) => [slot.id, slot]));
  const scenesByBeat = new Map<string, string[]>();
  input.planning_report.scenes.forEach((scene) => scene.beat_ids.forEach((beatId) => {
    const values = scenesByBeat.get(beatId) ?? [];
    if (!values.includes(scene.scene_id)) values.push(scene.scene_id);
    scenesByBeat.set(beatId, values);
  }));
  const issues: CreativeSubtitleFitIssue[] = [];
  input.content.forEach((entry) => {
    const slot = slotMap.get(entry.slot_id);
    if (!slot?.constraints.channels.includes('spoken')) return;
    const targetScenes = entry.scene_id === undefined
      ? (scenesByBeat.get(slot.beat_id) ?? [])
      : [entry.scene_id];
    targetScenes.filter((sceneId) => sceneRequiresSubtitles(input.plan, sceneId)).forEach((sceneId) => {
      splitCreativeVoiceText(entry.text).forEach((segment, segmentIndex) => {
        const fittingInput = {
          context,
          source_id: `${entry.slot_id}_${sceneId}_${segmentIndex}`.slice(0, 64),
          text: segment,
          locale: input.plan.audience.locale,
        } as const;
        const analysis = analyzeSubtitleTextFit(fittingInput);
        if (!analysis.fits) issues.push({
          slot_id: entry.slot_id,
          scene_id: sceneId,
          segment_index: segmentIndex,
          analysis,
          concision: deriveSubtitleConcisionBudget(fittingInput),
        });
      });
    });
  });
  return { ok: issues.length === 0, issues, diagnostics: [] };
}
