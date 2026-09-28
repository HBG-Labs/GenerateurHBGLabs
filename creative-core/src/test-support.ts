import { readFileSync } from 'node:fs';

import type { CreativePlan } from './contracts/creative-plan.ts';
import type { PlannerInput } from './planner/contracts.ts';

export type FixtureName = 'hypothetical' | 'educational' | 'product-demo' | 'minimal' | 'invalid';

export function loadFixture(name: FixtureName): unknown {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}.creative-plan.json`, import.meta.url), 'utf8')) as unknown;
}

export function loadValidFixture(name: Exclude<FixtureName, 'invalid'> = 'minimal'): CreativePlan {
  return loadFixture(name) as CreativePlan;
}

export type PlannerFixtureName = 'hypothetical-30s' | 'explainer-30s' | 'product-demo-20s' | 'minimal-5s' | 'long-60s' | 'invalid';

export function loadPlannerFixture(name: PlannerFixtureName): unknown {
  return JSON.parse(readFileSync(new URL(`../fixtures/planner/${name}.planner-input.json`, import.meta.url), 'utf8')) as unknown;
}

export function loadValidPlannerFixture(
  name: Exclude<PlannerFixtureName, 'invalid'> = 'hypothetical-30s',
): PlannerInput {
  return loadPlannerFixture(name) as PlannerInput;
}
