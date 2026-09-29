import { describe, expect, it } from 'vitest';

import { hashVisualDocument } from '@motion-engine/visual-core';

import { buildP33ADirectionFixture, buildP33APipeline } from './p3.3a-support.ts';

describe('P3.3A — Visual Director Core pipeline', () => {
  it('résout quatre directions distinctes avec diagnostics cumulatifs sans erreur', () => {
    const fixtures = (['science', 'product', 'problem_solution', 'editorial'] as const).map(buildP33ADirectionFixture);
    for (const fixture of fixtures) {
      expect(fixture.direction_compile.direction_preflight.summary.errors, `${fixture.kind}: ${JSON.stringify(fixture.direction_compile.direction_preflight.diagnostics)}`).toBe(0);
      expect(fixture.direction_compile.ok).toBe(true);
      expect(fixture.direction_compile.visual_preflight?.summary.errors).toBe(0);
    }
    expect(new Set(fixtures.map((entry) => entry.direction_plan.sequence_strategy.id)).size).toBe(4);
    expect(new Set(fixtures.map((entry) => entry.direction_plan.motion_identity.id)).size).toBe(4);
    expect(new Set(fixtures.map((entry) => hashVisualDocument(entry.direction_compile.visual_plan))).size).toBe(4);
  });

  it('atteint MotionSpec et RenderPlan pour Science, Product et Editorial', () => {
    for (const kind of ['science', 'product', 'editorial'] as const) {
      const pipeline = buildP33APipeline(kind);
      expect(pipeline.visual_compile.preflight.summary.errors).toBe(0);
      expect(pipeline.p1.preflight.summary?.errors ?? 0).toBe(0);
      expect(pipeline.p1.render_plan).not.toBeNull();
    }
  });

  it('atteint au moins RenderPlan pour Problem/Solution', () => {
    const pipeline = buildP33APipeline('problem_solution');
    expect(pipeline.p1.preflight.summary?.errors ?? 0).toBe(0);
  });
});
