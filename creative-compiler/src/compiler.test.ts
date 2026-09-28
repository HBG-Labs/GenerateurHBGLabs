import { describe, expect, it } from 'vitest';

import { hashDocument, validateSpec } from '@motion-engine/core';

import { compileCreativePlan } from './compiler.ts';
import { SHORT_FORM_DEFAULT_PROFILE } from './profile.ts';
import { buildCreativeResolution } from './resolution.ts';
import { genericPattern, hypotheticalFixture, nocturneStyle, plannerFixture, signalStyle } from './test-support.ts';

describe('Creative Compiler P2.3', () => {
  it('compile la fixture hypothétique résolue vers un MotionSpec P1 valide', () => {
    const fixture = hypotheticalFixture();
    const plan = fixture.planning.creative_plan!;
    const style = signalStyle();
    const result = compileCreativePlan(plan, {
      resolution: fixture.resolution,
      profile: SHORT_FORM_DEFAULT_PROFILE,
      resolved_style: style,
      pattern: genericPattern(),
    });

    expect(result.ok).toBe(true);
    expect(result.motion_spec?.schema_version).toBe('0.2.0');
    expect(result.motion_spec?.scenes).toHaveLength(7);
    expect(result.motion_spec?.scenes.reduce((sum, scene) => {
      if (!('duration' in scene.timing.anchor) || !('ms' in scene.timing.anchor.duration)) return sum;
      return sum + scene.timing.anchor.duration.ms;
    }, 0)).toBe(30_000);
    expect(result.provenance?.quantization.total_frames).toBe(900);
    expect(result.provenance?.scenes.every((entry) => entry.creative_scene_id === entry.motion_scene_id)).toBe(true);
    expect(result.compiler_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.report.summary.errors).toBe(0);
    expect(result.report.diagnostics.some((entry) => entry.code === 'creative_compile.transition_degraded_to_cut')).toBe(true);
    expect(validateSpec(result.motion_spec, style, {
      assetRefs: new Set(['neutral_landscape']),
    }).ok).toBe(true);
  });

  it('garde le même CreativePlan mais lie explicitement Signal ou Nocturne', () => {
    const fixture = hypotheticalFixture();
    const plan = fixture.planning.creative_plan!;
    const common = { resolution: fixture.resolution, profile: SHORT_FORM_DEFAULT_PROFILE, pattern: genericPattern() };
    const signal = compileCreativePlan(plan, { ...common, resolved_style: signalStyle() });
    const nocturne = compileCreativePlan(plan, { ...common, resolved_style: nocturneStyle() });

    expect(signal.ok).toBe(true);
    expect(nocturne.ok).toBe(true);
    expect(signal.motion_spec?.style_binding.id).toBe('p14_signal');
    expect(nocturne.motion_spec?.style_binding.id).toBe('control_nocturne');
    expect(signal.motion_spec?.scenes.map((scene) => scene.id)).toEqual(nocturne.motion_spec?.scenes.map((scene) => scene.id));
    expect(signal.report.hashes.creative_plan).toBe(nocturne.report.hashes.creative_plan);
    expect(signal.report.hashes.motion_spec).not.toBe(nocturne.report.hashes.motion_spec);
  });

  it('refuse tout contenu ou asset requis non résolu', () => {
    const fixture = hypotheticalFixture();
    const plan = fixture.planning.creative_plan!;
    const resolution = buildCreativeResolution({
      plan,
      planning_report: fixture.planning.report!,
      content_slots: fixture.planning.content_slots,
      content: [],
      assets: [],
    });
    const result = compileCreativePlan(plan, {
      resolution,
      profile: SHORT_FORM_DEFAULT_PROFILE,
      resolved_style: signalStyle(),
      pattern: genericPattern(),
    });

    expect(result.ok).toBe(false);
    expect(result.motion_spec).toBeNull();
    expect(result.report.diagnostics.some((entry) => entry.code === 'creative_compile.content_required_unresolved')).toBe(true);
    expect(result.report.diagnostics.some((entry) => entry.code === 'creative_compile.asset_required_unresolved')).toBe(true);
  });

  it('est déterministe et ne dépend d’aucune horloge', () => {
    const fixture = hypotheticalFixture();
    const options = {
      resolution: fixture.resolution,
      profile: SHORT_FORM_DEFAULT_PROFILE,
      resolved_style: signalStyle(),
      pattern: genericPattern(),
    };
    const first = compileCreativePlan(fixture.planning.creative_plan!, options);
    const second = compileCreativePlan(fixture.planning.creative_plan!, options);

    expect(hashDocument(first)).toBe(hashDocument(second));
    expect(first.compiler_fingerprint).toBe(second.compiler_fingerprint);
    expect(first.report.diagnostics).toEqual(second.report.diagnostics);
  });

  it('quantifie les frontières cumulées sans dérive pour une durée non alignée', () => {
    const fixture = hypotheticalFixture();
    const plan = structuredClone(fixture.planning.creative_plan!);
    plan.target.duration = { min_seconds: 30.017, preferred_seconds: 30.017, max_seconds: 30.017 };
    const result = compileCreativePlan(plan, {
      resolution: fixture.resolution,
      profile: SHORT_FORM_DEFAULT_PROFILE,
      resolved_style: signalStyle(),
      pattern: genericPattern(),
    });

    expect(result.ok).toBe(true);
    expect(result.provenance?.quantization.target_duration_ms).toBe(30_017);
    expect(result.provenance?.quantization.total_frames).toBe(Math.round(30_017 * 30 / 1_000));
    const scenes = result.provenance!.quantization.scenes;
    expect(scenes.slice(1).every((scene, index) => scene.from_frame === scenes[index]!.to_frame)).toBe(true);
  });

  it('diagnostique une intention sans mapping au lieu de l’inventer', () => {
    const fixture = hypotheticalFixture();
    const plan = structuredClone(fixture.planning.creative_plan!);
    plan.scenes[0]!.visual!.mode = 'unmapped_visual_mode';
    const result = compileCreativePlan(plan, {
      resolution: fixture.resolution,
      profile: SHORT_FORM_DEFAULT_PROFILE,
      resolved_style: signalStyle(),
      pattern: genericPattern(),
    });

    expect(result.ok).toBe(false);
    expect(result.report.diagnostics.some((entry) => entry.code === 'creative_compile.visual_intent_unsupported')).toBe(true);
  });

  it.each(['explainer-30s', 'product-demo-20s', 'minimal-5s', 'long-60s'] as const)(
    'compile la fixture %s sans génération implicite',
    (name) => {
      const fixture = plannerFixture(name);
      const result = compileCreativePlan(fixture.planning.creative_plan!, {
        resolution: fixture.resolution,
        profile: SHORT_FORM_DEFAULT_PROFILE,
        resolved_style: signalStyle(),
        pattern: genericPattern(),
      });
      expect(result.ok, JSON.stringify(result.report.diagnostics)).toBe(true);
      expect(result.motion_spec?.scenes).toHaveLength(fixture.planning.creative_plan!.scenes.length);
    },
  );
});
