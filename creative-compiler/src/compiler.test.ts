import { describe, expect, it } from 'vitest';

import { hashDocument, validateSpec } from '@motion-engine/core';

import { compileCreativePlan } from './compiler.ts';
import { SHORT_FORM_DEFAULT_PROFILE } from './profile.ts';
import { deriveCreativeReadingBudgets, inspectCreativeReadingFeasibility, inspectCreativeSubtitleFeasibility } from './reading-budget.ts';
import { buildCreativeResolution } from './resolution.ts';
import { fontResources, genericPattern, hypotheticalFixture, nocturneStyle, plannerFixture, platformPresets, signalStyle } from './test-support.ts';

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

  it('dérive et vérifie les budgets de lecture avec la politique temporelle P1', () => {
    const fixture = hypotheticalFixture();
    const plan = fixture.planning.creative_plan!;
    const policy = {
      profile: SHORT_FORM_DEFAULT_PROFILE,
      resolved_style: signalStyle(),
      pattern: genericPattern(),
      platform_presets: platformPresets(),
      font_resources: fontResources(signalStyle()),
      render_scale: 1,
      minimum_readable_size: 28,
    };
    const derived = deriveCreativeReadingBudgets({
      plan,
      planning_report: fixture.planning.report!,
      content_slots: fixture.planning.content_slots,
      policy,
    });
    expect(derived.ok, JSON.stringify(derived.diagnostics)).toBe(true);
    expect(derived.budgets).toHaveLength(plan.scenes.length);
    expect(derived.budgets.every((budget) => budget.available_ms > 0 && budget.maximum_total_words > 0)).toBe(true);

    const content = fixture.resolution.content_slots.flatMap((slot, index) => slot.status === 'resolved'
      ? [{
          slot_id: slot.slot_id,
          scene_id: slot.scene_id,
          text: index === 0 ? Array.from({ length: 24 }, () => 'mot').join(' ') : slot.text,
          ...(slot.source_slot === undefined ? {} : { source_slot: slot.source_slot }),
        }]
      : []);
    const inspected = inspectCreativeReadingFeasibility({
      plan,
      planning_report: fixture.planning.report!,
      content_slots: fixture.planning.content_slots,
      content,
      policy,
    });
    expect(inspected.ok).toBe(false);
    expect(inspected.issues.length).toBeGreaterThan(0);
    expect(inspected.issues.every((issue) => issue.required_ms > issue.available_ms)).toBe(true);
    expect(inspected.slot_budgets.length).toBeGreaterThan(0);
    expect(inspected.slot_budgets.every((budget) => (
      budget.available_scene_ms > 0
      && budget.already_allocated_ms >= 0
      && budget.remaining_slot_ms >= 0
      && budget.current_required_ms > budget.available_scene_ms
      && budget.current_word_count > budget.maximum_slot_words
      && budget.maximum_slot_words + budget.already_allocated_words === budget.maximum_total_words
    ))).toBe(true);
  });

  it('refuse Stage B lorsque même le contenu minimal ne tient pas dans la fenêtre P1', () => {
    const fixture = hypotheticalFixture();
    const style = structuredClone(signalStyle());
    style.style.rhythm_personality.reading.min_hold_ms = 60_000;
    const derived = deriveCreativeReadingBudgets({
      plan: fixture.planning.creative_plan!,
      planning_report: fixture.planning.report!,
      content_slots: fixture.planning.content_slots,
      policy: {
        profile: SHORT_FORM_DEFAULT_PROFILE,
        resolved_style: style,
        pattern: genericPattern(),
        platform_presets: platformPresets(),
        font_resources: fontResources(style),
        render_scale: 1,
        minimum_readable_size: 28,
      },
    });

    expect(derived.ok).toBe(false);
    expect(derived.budgets).toEqual([]);
    expect(derived.diagnostics.some((entry) => (
      entry.code === 'creative_reading.temporal.impossible_reading'
    ))).toBe(true);
  });

  it('dérive les contraintes de sous-titres depuis Signal et Nocturne sans valeur magique', () => {
    const fixture = hypotheticalFixture();
    const derive = (style: ReturnType<typeof signalStyle>) => deriveCreativeReadingBudgets({
      plan: fixture.planning.creative_plan!,
      planning_report: fixture.planning.report!,
      content_slots: fixture.planning.content_slots,
      policy: {
        profile: SHORT_FORM_DEFAULT_PROFILE,
        resolved_style: style,
        pattern: genericPattern(),
        platform_presets: platformPresets(),
        font_resources: fontResources(style),
        render_scale: 1,
        minimum_readable_size: 28,
      },
    });
    const signal = derive(signalStyle());
    const nocturne = derive(nocturneStyle());
    expect(signal.ok, JSON.stringify(signal.diagnostics)).toBe(true);
    expect(nocturne.ok, JSON.stringify(nocturne.diagnostics)).toBe(true);
    expect(signal.subtitle_budgets.length).toBeGreaterThan(0);
    expect(nocturne.subtitle_budgets.length).toBeGreaterThan(0);
    expect(signal.subtitle_budgets.every((budget) => budget.max_lines === signalStyle().style.subtitle_style.max_lines)).toBe(true);
    expect(nocturne.subtitle_budgets.every((budget) => budget.max_lines === nocturneStyle().style.subtitle_style.max_lines)).toBe(true);
    expect(signal.subtitle_budgets[0]).not.toEqual(nocturne.subtitle_budgets[0]);
  });

  it('vérifie une résolution générique contre toutes les scènes d’un beat splitté', () => {
    const fixture = plannerFixture('long-60s');
    const plan = fixture.planning.creative_plan!;
    const report = fixture.planning.report!;
    const splitBeat = report.scenes.find((scene, index, scenes) => (
      scenes.some((candidate, other) => other !== index && candidate.beat_ids.some((id) => scene.beat_ids.includes(id)))
    ))!.beat_ids[0]!;
    const slot = fixture.planning.content_slots.find((entry) => (
      entry.beat_id === splitBeat && entry.constraints.channels.includes('spoken')
    ))!;
    const style = signalStyle();
    const policy = {
      profile: SHORT_FORM_DEFAULT_PROFILE,
      resolved_style: style,
      pattern: genericPattern(),
      platform_presets: platformPresets(),
      font_resources: fontResources(style),
      render_scale: 1,
      minimum_readable_size: 28,
    };
    const short = inspectCreativeSubtitleFeasibility({
      plan, planning_report: report, content_slots: fixture.planning.content_slots,
      content: [{ slot_id: slot.id, text: 'Une révélation concise.' }], policy,
    });
    expect(short.ok).toBe(true);
    const overflow = inspectCreativeSubtitleFeasibility({
      plan, planning_report: report, content_slots: fixture.planning.content_slots,
      content: [{ slot_id: slot.id, text: 'W'.repeat(120) }], policy,
    });
    const targetScenes = report.scenes.filter((scene) => scene.beat_ids.includes(splitBeat)).map((scene) => scene.scene_id).sort();
    expect([...new Set(overflow.issues.map((issue) => issue.scene_id))].sort()).toEqual(targetScenes);
  });

  it('dérive un budget de concision déterministe par fitting HarfBuzz du contenu courant', () => {
    const fixture = hypotheticalFixture();
    const plan = fixture.planning.creative_plan!;
    const report = fixture.planning.report!;
    const slot = fixture.planning.content_slots.find((entry) => entry.constraints.channels.includes('spoken'))!;
    const inspect = (style: ReturnType<typeof signalStyle>, text: string) => inspectCreativeSubtitleFeasibility({
      plan,
      planning_report: report,
      content_slots: fixture.planning.content_slots,
      content: [{ slot_id: slot.id, text }],
      policy: {
        profile: SHORT_FORM_DEFAULT_PROFILE,
        resolved_style: style,
        pattern: genericPattern(),
        platform_presets: platformPresets(),
        font_resources: fontResources(style),
        render_scale: 1,
        minimum_readable_size: 28,
      },
    });
    const wideText = Array.from({ length: 60 }, () => 'WWW').join(' ');
    const narrowText = Array.from({ length: 60 }, () => 'iii').join(' ');
    expect([...wideText]).toHaveLength([...narrowText].length);

    const wide = inspect(signalStyle(), wideText);
    const wideAgain = inspect(signalStyle(), wideText);
    const narrow = inspect(signalStyle(), narrowText);
    expect(wide.ok).toBe(false);
    expect(narrow.ok).toBe(false);
    expect(wide.issues[0]?.analysis.line_count).toBeGreaterThan(wide.issues[0]?.analysis.max_lines ?? 0);
    expect(wide.issues[0]?.concision).toEqual(wideAgain.issues[0]?.concision);
    expect(wide.issues[0]?.concision.basis).toBe('current_content_prefix_exact_fit');
    expect(wide.issues[0]?.concision.current_word_count).toBe(60);
    expect(wide.issues[0]?.concision.content_relative_maximum_words).toBeGreaterThan(0);
    expect(wide.issues[0]?.concision.content_relative_maximum_words).toBeLessThan(60);
    expect(wide.issues[0]?.concision.maximum_recommended_characters).toBeLessThan([...wideText].length);
    expect(narrow.issues[0]?.concision.current_character_count)
      .toBe(wide.issues[0]?.concision.current_character_count);

    const nocturne = inspect(nocturneStyle(), wideText);
    const nocturneNarrow = inspect(nocturneStyle(), narrowText);
    expect(nocturne.ok).toBe(false);
    expect(nocturneNarrow.ok).toBe(false);
    expect(nocturne.issues[0]?.concision.current_character_count)
      .toBe(nocturneNarrow.issues[0]?.concision.current_character_count);
    expect(nocturne.issues[0]?.concision.content_relative_maximum_words)
      .not.toBe(nocturneNarrow.issues[0]?.concision.content_relative_maximum_words);
    expect({
      fitting: nocturne.issues[0]?.concision,
      preferred: nocturne.issues[0]?.analysis.preferred_size,
      minimum: nocturne.issues[0]?.analysis.minimum_size,
      width: nocturne.issues[0]?.analysis.available_width,
    }).not.toEqual({
      fitting: wide.issues[0]?.concision,
      preferred: wide.issues[0]?.analysis.preferred_size,
      minimum: wide.issues[0]?.analysis.minimum_size,
      width: wide.issues[0]?.analysis.available_width,
    });
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
