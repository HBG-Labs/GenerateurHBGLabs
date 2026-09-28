import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  loadStyleFile,
  resolveStyle,
  validatePatternDefinition,
  type PatternDefinition,
  type ResolvedStyle,
} from '@motion-engine/core';
import {
  planCreativeStory,
  type PlannerInput,
  type StoryPlanningResult,
} from '@motion-engine/creative-core';

import { buildCreativeResolution, type AssetSlotValue, type ContentSlotValue } from './resolution.ts';
import type { CreativeResolution } from './contracts.ts';

export const WORKSPACE = path.resolve(import.meta.dirname, '..', '..');
const FONT_LIBRARY = { libraryRoot: path.join(WORKSPACE, 'packs', 'fonts') };

function readJson(relative: string): any {
  return JSON.parse(readFileSync(path.join(WORKSPACE, relative), 'utf8'));
}

function resolveStyleFile(relative: string): ResolvedStyle {
  const loaded = loadStyleFile(path.join(WORKSPACE, relative), FONT_LIBRARY);
  const result = resolveStyle({ style: loaded });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}

export function signalStyle(): ResolvedStyle {
  return resolveStyleFile('fixtures/p1.4/styles/p1-4-signal.style.json');
}

export function nocturneStyle(): ResolvedStyle {
  return resolveStyleFile('examples/control_nocturne/style.json');
}

export function genericPattern(): PatternDefinition {
  const result = validatePatternDefinition(readJson('packs/patterns/generic/statement.interrupt.json'));
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}

export interface HypotheticalFixture {
  readonly planning: StoryPlanningResult;
  readonly resolution: CreativeResolution;
}

export type CompilablePlannerFixture = 'hypothetical-30s' | 'explainer-30s' | 'product-demo-20s' | 'minimal-5s' | 'long-60s';

export function plannerFixture(name: CompilablePlannerFixture): HypotheticalFixture {
  const plannerInput = readJson(`creative-core/fixtures/planner/${name}.planner-input.json`) as PlannerInput;
  const planning = planCreativeStory(plannerInput);
  if (!planning.ok || !planning.creative_plan || !planning.report) throw new Error(`Fixture P2.2 ${name} invalide.`);
  const values = readJson(`creative-compiler/fixtures/p2.3/${name}.resolution-values.json`) as {
    plan_id?: string;
    content: ContentSlotValue[];
    assets: AssetSlotValue[];
  };
  if (values.plan_id !== undefined && values.plan_id !== planning.creative_plan.plan_id) {
    throw new Error('La fixture de résolution ne cible plus le plan canonique P2.2.');
  }
  const resolution = buildCreativeResolution({
    plan: planning.creative_plan,
    planning_report: planning.report,
    content_slots: planning.content_slots,
    content: values.content,
    assets: values.assets,
  });
  return { planning, resolution };
}

export function hypotheticalFixture(): HypotheticalFixture {
  return plannerFixture('hypothetical-30s');
}
