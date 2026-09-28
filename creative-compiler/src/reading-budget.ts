import {
  analyzeTemporalPlan,
  maximumReadableWords,
  type PatternDefinition,
  type ResolvedStyle,
  type Scene,
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
} from './contracts.ts';
import {
  buildCreativeResolution,
  type ContentSlotValue,
} from './resolution.ts';

export interface CreativeReadingPolicy {
  readonly profile: CompilationProfile;
  readonly resolved_style: ResolvedStyle;
  readonly pattern: PatternDefinition;
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
  readonly diagnostics: readonly CreativeDiagnostic[];
}

export interface CreativeReadingInspectionResult {
  readonly ok: boolean;
  readonly issues: readonly CreativeReadingIssue[];
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
    return { temporal: null, temporal_diagnostics: [], diagnostics: compiled.report.diagnostics };
  }
  const analysis = analyzeTemporalPlan({
    spec: compiled.motion_spec,
    resolvedStyle: input.policy.resolved_style,
    fps: input.policy.profile.fps,
  });
  return { temporal: analysis.resolution, temporal_diagnostics: analysis.diagnostics, diagnostics: [] };
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
  if (!candidate.temporal) return { ok: false, budgets: [], diagnostics: candidate.diagnostics };
  const readingDiagnostics = candidate.temporal_diagnostics.filter((entry) => (
    entry.code === 'temporal.impossible_reading'
  ));
  if (readingDiagnostics.length > 0) {
    return {
      ok: false,
      budgets: [],
      diagnostics: readingDiagnostics.map((entry) => temporalDiagnostic(entry, input.plan)),
    };
  }
  const budgets = input.plan.scenes.flatMap((scene) => {
    const budget = budgetFor(scene.id, candidate.temporal!, input.plan, input.policy);
    return budget ? [budget] : [];
  });
  return { ok: budgets.length === input.plan.scenes.length, budgets, diagnostics: candidate.diagnostics };
}

export function inspectCreativeReadingFeasibility(input: ReadingCandidateInput): CreativeReadingInspectionResult {
  const candidate = analyzeCandidate(input);
  if (!candidate.temporal) return { ok: false, issues: [], diagnostics: candidate.diagnostics };
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
  return { ok: issues.length === 0, issues, diagnostics: candidate.diagnostics };
}
