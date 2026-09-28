import { readFileSync } from 'node:fs';

import type { CreativePlan } from './contracts/creative-plan.ts';

export type FixtureName = 'hypothetical' | 'educational' | 'product-demo' | 'minimal' | 'invalid';

export function loadFixture(name: FixtureName): unknown {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}.creative-plan.json`, import.meta.url), 'utf8')) as unknown;
}

export function loadValidFixture(name: Exclude<FixtureName, 'invalid'> = 'minimal'): CreativePlan {
  return loadFixture(name) as CreativePlan;
}
