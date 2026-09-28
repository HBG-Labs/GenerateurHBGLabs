import { describe, expect, it } from 'vitest';

import { hashDocument } from '@motion-engine/core';
import { hashCreativeDocument } from '@motion-engine/creative-core';

import { compileCreativePlan } from './compiler.ts';
import { SHORT_FORM_DEFAULT_PROFILE } from './profile.ts';
import { genericPattern, hypotheticalFixture, signalStyle } from './test-support.ts';

function options() {
  const fixture = hypotheticalFixture();
  return {
    fixture,
    compile: {
      resolution: fixture.resolution,
      profile: SHORT_FORM_DEFAULT_PROFILE,
      resolved_style: signalStyle(),
      pattern: genericPattern(),
    },
  };
}

describe('Creative Compiler — sécurité et frontière stricte', () => {
  it('rejette les propriétés inconnues dans CreativeResolution', () => {
    const { fixture, compile } = options();
    const hostile = { ...compile.resolution, unexpected: true };
    const result = compileCreativePlan(fixture.planning.creative_plan, { ...compile, resolution: hostile });
    expect(result.ok).toBe(false);
    expect(result.report.diagnostics.some((entry) => entry.code === 'creative_compile.resolution_invalid')).toBe(true);
  });

  it('rejette un CreativePlan cyclique sans exécuter son contenu', () => {
    const { fixture, compile } = options();
    const cyclic: Record<string, unknown> = { ...fixture.planning.creative_plan! };
    cyclic['cycle'] = cyclic;
    const result = compileCreativePlan(cyclic, compile);
    expect(result.ok).toBe(false);
    expect(result.motion_spec).toBeNull();
  });

  it('rejette une résolution rattachée à un autre plan', () => {
    const { fixture, compile } = options();
    const result = compileCreativePlan(fixture.planning.creative_plan, {
      ...compile,
      resolution: { ...compile.resolution, plan_id: 'another_plan' },
    });
    expect(result.ok).toBe(false);
    expect(result.report.diagnostics.some((entry) => entry.code === 'creative_compile.resolution_plan_mismatch')).toBe(true);
  });

  it('bloque un SFX obligatoire sans cue explicitement résolu', () => {
    const { fixture, compile } = options();
    const plan = structuredClone(fixture.planning.creative_plan!);
    plan.scenes[0]!.audio!.sfx = 'required';
    const result = compileCreativePlan(plan, compile);
    expect(result.ok).toBe(false);
    expect(result.report.diagnostics.some((entry) => entry.code === 'creative_compile.audio_required_unresolved')).toBe(true);
  });

  it('réutilise la canonicalisation commune P1/P2 pour les documents JSON compatibles', () => {
    const { fixture } = options();
    expect(hashCreativeDocument(fixture.planning.creative_plan)).toBe(hashDocument(fixture.planning.creative_plan));
  });
});
