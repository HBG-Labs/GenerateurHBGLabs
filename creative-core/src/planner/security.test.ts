import { describe, expect, it } from 'vitest';

import { loadValidPlannerFixture } from '../test-support.ts';
import { DEFAULT_PLANNER_LIMITS } from './limits.ts';
import { planCreativeStory } from './plan.ts';
import { validatePlannerInput } from './validation.ts';

function nested(depth: number): unknown {
  let value: unknown = 'leaf';
  for (let index = 0; index < depth; index += 1) value = { value };
  return value;
}

describe('sécurité du PlannerInput', () => {
  it('refuse les clés de prototype pollution', () => {
    const input = JSON.parse('{"schema":"planner-input","__proto__":{"polluted":true}}') as unknown;
    const result = validatePlannerInput(input);
    expect(result.report.diagnostics.some((diagnostic) => diagnostic.code === 'planner.security.forbidden_property')).toBe(true);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('refuse un prototype hostile', () => {
    const input = { safe: true, __proto__: { polluted: true } };
    expect(validatePlannerInput(input).report.diagnostics.some((item) => item.code === 'planner.security.invalid_object_prototype')).toBe(true);
  });

  it('refuse les cycles', () => {
    const input: { self?: unknown } = {};
    input.self = input;
    expect(validatePlannerInput(input).report.diagnostics.some((item) => item.code === 'planner.security.cyclic_reference')).toBe(true);
  });

  it('refuse nombres non finis, chaînes gigantesques et profondeur excessive', () => {
    expect(validatePlannerInput({ value: Number.NaN }).report.diagnostics.some((item) => item.code === 'planner.security.non_finite_number')).toBe(true);
    expect(
      validatePlannerInput({ value: 'x'.repeat(DEFAULT_PLANNER_LIMITS.max_string_characters + 1) }).report.diagnostics.some(
        (item) => item.code === 'planner.security.string_too_long',
      ),
    ).toBe(true);
    expect(validatePlannerInput(nested(DEFAULT_PLANNER_LIMITS.max_depth + 1)).report.diagnostics.some((item) => item.code === 'planner.security.depth_exceeded')).toBe(true);
  });

  it('refuse une durée extrême avant toute planification', () => {
    const input = structuredClone(loadValidPlannerFixture());
    input.target_duration_ms = 3_600_000;
    const result = planCreativeStory(input);
    expect(result.ok).toBe(false);
    expect(result.creative_plan).toBeNull();
    expect(result.input_validation.diagnostics.some((item) => item.code === 'planner.duration_out_of_bounds')).toBe(true);
  });

  it('n’exécute aucune valeur de l’entrée', () => {
    let executed = false;
    const input = structuredClone(loadValidPlannerFixture()) as unknown as Record<string, unknown>;
    Object.defineProperty(input, 'unexpected', {
      enumerable: false,
      get: () => {
        executed = true;
        return true;
      },
    });
    validatePlannerInput(input);
    expect(executed).toBe(false);
  });
});
