import { describe, expect, it } from 'vitest';

import { DEFAULT_PLANNER_LIMITS } from './limits.ts';
import { validatePlannerInput } from './validation.ts';
import { loadPlannerFixture, loadValidPlannerFixture } from '../test-support.ts';

describe('PlannerInput 0.1.0', () => {
  it.each(['hypothetical-30s', 'explainer-30s', 'product-demo-20s', 'minimal-5s', 'long-60s'] as const)(
    'valide la fixture %s',
    (name) => {
      const result = validatePlannerInput(loadPlannerFixture(name));
      expect(result.ok, JSON.stringify(result.report.diagnostics, null, 2)).toBe(true);
      expect(result.report.status).toBe('pass');
      expect(result.report.planner_input_sha256).toMatch(/^[0-9a-f]{64}$/);
    },
  );

  it('retourne plusieurs diagnostics stables pour les contradictions', () => {
    const first = validatePlannerInput(loadPlannerFixture('invalid'));
    const second = validatePlannerInput(loadPlannerFixture('invalid'));
    expect(first.ok).toBe(false);
    expect(first.report).toEqual(second.report);
    expect(first.report.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        'planner.duration_out_of_bounds',
        'planner.cta_incompatible',
        'planner.id.duplicate',
        'planner.constraint.role_conflict',
        'planner.constraint.scene_count_conflict',
        'planner.constraint.narration_conflict',
        'planner.constraint.narration_content_conflict',
        'planner.constraint.asset_conflict',
        'planner.constraint.asset_none_conflict',
      ]),
    );
  });

  it('refuse les propriétés inconnues', () => {
    const input = { ...loadValidPlannerFixture(), provider_model: 'forbidden' };
    const result = validatePlannerInput(input);
    expect(result.ok).toBe(false);
    expect(result.report.diagnostics.some((diagnostic) => diagnostic.code === 'planner.schema.unknown_field')).toBe(true);
  });

  it('transporte fr et fr-FR sans traduire le sujet', () => {
    const input = loadValidPlannerFixture();
    const result = validatePlannerInput(input);
    expect(result.value?.language).toBe('fr');
    expect(result.value?.locale).toBe('fr-FR');
    expect(result.value?.topic).toBe(input.topic);
  });

  it('refuse une incohérence langue/locale', () => {
    const input = structuredClone(loadValidPlannerFixture());
    input.locale = 'en-US';
    expect(validatePlannerInput(input).report.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'planner.locale_language_mismatch',
    );
  });

  it('applique les limites exactes/+1 aux contraintes', () => {
    const input = structuredClone(loadValidPlannerFixture('minimal-5s'));
    input.constraints = Array.from({ length: DEFAULT_PLANNER_LIMITS.max_constraints }, (_, index) => ({
      id: `constraint_${index}`,
      kind: 'max_scenes' as const,
      value: 24,
    }));
    expect(validatePlannerInput(input).report.diagnostics.some((item) => item.code === 'planner.limit.constraints_exceeded')).toBe(false);
    input.constraints.push({ id: 'constraint_over', kind: 'max_scenes', value: 24 });
    expect(validatePlannerInput(input).report.diagnostics.some((item) => item.code === 'planner.limit.constraints_exceeded')).toBe(true);
  });
});
