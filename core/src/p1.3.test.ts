import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { CreativeIntent } from './contracts/creative-intent.ts';
import type { Layer, MotionSceneSpec, TextLayer } from './contracts/motion-spec.ts';
import type { PatternDefinition } from './contracts/pattern.ts';
import type { PlatformPresets } from './contracts/platform.ts';
import type { RenderPlan, Track } from './contracts/render-plan.ts';
import type { ResolvedStyle } from './contracts/resolved-style.ts';
import { compileMotionScene } from './compiler/compile.ts';
import { hashDocument } from './integrity/canonical.ts';
import { assertNoTrackConflicts, MotionTrackError } from './motion/compile-tracks.ts';
import { P13_BEHAVIOR_DEFINITIONS, P13_BEHAVIOR_REGISTRY } from './motion/behavior-registry.ts';
import { buildMotionSceneSpec } from './spec-builder/build-spec.ts';
import { minimumReadabilityMs, resolveTemporalPlan, TemporalResolutionError } from './temporal/resolve.ts';
import { readFixture, resolvedInk, resolvedSignal } from './test-support.ts';
import { validateBehaviorDefinition, validateSpec } from './validation/validate.ts';

const pattern: PatternDefinition = {
  schema: 'pattern-definition', schema_version: '0.1.0', id: 'statement.interrupt', version: '0.1.0',
  intent: 'Interrompre par une affirmation générique.', background: 'color.surface.primary',
  layout: { kind: 'stack', region: 'safe', direction: 'vertical', align_x: 'start', align_y: 'center', gap: 'space.md' },
  slots: [
    { id: 'interrupt.marker', primitive: 'shape', role: 'interrupt_marker', order: 0, width: { kind: 'fill' }, height: { kind: 'space', token: 'space.sm' }, style: { fill: 'color.accent' } },
    { id: 'statement.primary', primitive: 'text', role: 'statement', order: 1, width: { kind: 'fill' }, height: { kind: 'content' }, style: { type: 'type.display.xl', color: 'color.text.primary', accent_color: 'color.accent' } },
  ],
  constraints: { min_lines: 2, max_lines: 3, explicit_line_breaks: true },
};

const platforms = () => readFixture('platforms.json') as PlatformPresets;
const intent = () => readFixture('moon.intent.json') as CreativeIntent;

function resources(style: ResolvedStyle) {
  return Object.fromEntries(Object.values(style.style.typography.families).flatMap((family) =>
    family.files.map((file) => [file.src, {
      file: `fixtures/${file.src.slice(4)}`,
      sha256: file.sha256,
      data: readFileSync(path.join(import.meta.dirname, '..', 'test-fixtures', 'fonts', file.src.slice(4).split('/').at(-1)!)),
    }])),
  );
}

function layers(spec: MotionSceneSpec): Layer[] {
  const result: Layer[] = [];
  const visit = (layer: Layer): void => {
    result.push(layer);
    if (layer.primitive === 'group' || layer.primitive === 'mask') layer.children.forEach(visit);
  };
  spec.scenes[0]!.layers.forEach(visit);
  return result;
}

function animatedSpec(): MotionSceneSpec {
  const style = resolvedSignal();
  const spec = buildMotionSceneSpec({
    intent: intent(), resolvedStyle: style, platformPresets: platforms(), platform: 'tiktok', pattern,
    content: { lines: [{ text: 'Une force' }, { text: 'reste visible', accent: true }] },
  });
  spec.scenes[0]!.timing = { anchor: { duration: { ms: 5_000 } }, min_hold: 'reading' };
  const text = layers(spec).find((layer): layer is TextLayer => layer.primitive === 'text')!;
  text.behaviors = [
    { id: 'reveal', behavior: 'REVEAL_TEXT', version: '1.0.0', params: { unit: 'line', stagger: 'style' }, at: { semantic: 'SCENE_START', offset: { ms: 200 } } },
    { id: 'accent', behavior: 'ACCENT_WORD', version: '1.0.0', target: { run: 'line_2' }, at: { semantic: 'AFTER_PREVIOUS' } },
    { id: 'settle', behavior: 'SETTLE', version: '1.0.0', target: { run: 'line_2' }, at: { semantic: 'AFTER_PREVIOUS' } },
    { id: 'exit', behavior: 'EXIT_CLEAR', version: '1.0.0', at: { semantic: 'BEFORE_NEXT' } },
  ];
  return spec;
}

function compile(spec = animatedSpec(), style = resolvedSignal(), reducedMotion = false): RenderPlan {
  return compileMotionScene({
    spec, resolvedStyle: style, platformPresets: platforms(), pattern, fontResources: resources(style),
    config: { fps: 30, render_scale: 0.5, reduced_motion: reducedMotion },
    behaviorRegistry: P13_BEHAVIOR_REGISTRY,
    allowStyleSubstitution: style.sources.style.id !== spec.style_binding.id,
  });
}

function tracks(plan: RenderPlan): Track[] {
  const result: Track[] = [];
  const visit = (node: RenderPlan['scenes'][number]['nodes'][number]): void => {
    result.push(...node.tracks);
    if (node.type === 'group' || node.type === 'mask') node.children.forEach(visit);
  };
  plan.scenes.forEach((scene) => scene.nodes.forEach(visit));
  return result;
}

describe('BehaviorDefinition et registre P1.3', () => {
  it('valide les cinq définitions strictes', () => {
    expect(P13_BEHAVIOR_DEFINITIONS.map((item) => item.id)).toEqual(['REVEAL_TEXT', 'ACCENT_WORD', 'SETTLE', 'EXIT_CLEAR', 'CUT']);
    expect(P13_BEHAVIOR_DEFINITIONS.every((item) => validateBehaviorDefinition(item).ok)).toBe(true);
  });

  it('rejette un behavior inconnu et une version non enregistrée', () => {
    const unknown = animatedSpec();
    const text = layers(unknown).find((layer): layer is TextLayer => layer.primitive === 'text')!;
    text.behaviors[0]!.behavior = 'UNKNOWN_BEHAVIOR';
    expect(validateSpec(unknown, resolvedSignal(), { registry: P13_BEHAVIOR_REGISTRY })).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: 'behavior.unknown' })]) });
    const mismatch = animatedSpec();
    const mismatchText = layers(mismatch).find((layer): layer is TextLayer => layer.primitive === 'text')!;
    mismatchText.behaviors[0]!.version = '9.0.0';
    expect(validateSpec(mismatch, resolvedSignal(), { registry: P13_BEHAVIOR_REGISTRY })).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: 'behavior.version' })]) });
  });

  it('rejette une primitive incompatible', () => {
    const spec = animatedSpec();
    const shape = layers(spec).find((layer) => layer.primitive === 'shape')!;
    shape.behaviors.push({ id: 'bad_reveal', behavior: 'REVEAL_TEXT', version: '1.0.0', at: { semantic: 'SCENE_START' } });
    expect(validateSpec(spec, resolvedSignal(), { registry: P13_BEHAVIOR_REGISTRY })).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: 'behavior.primitive' })]) });
  });
});

describe('Temporal Engine P1.3', () => {
  it('résout SCENE_START, AFTER_PREVIOUS et BEFORE_NEXT', () => {
    const timeline = resolveTemporalPlan({ spec: animatedSpec(), resolvedStyle: resolvedSignal(), fps: 30 });
    const list = timeline.scenes[0]!.behaviors;
    expect(list[0]!.start_ms).toBe(200);
    expect(list[1]!.start_ms).toBe(list[0]!.end_ms);
    expect(list[2]!.start_ms).toBe(list[1]!.end_ms);
    expect(list[3]!.end_ms).toBe(5_000);
  });

  it('résout WITH_LAYER et AFTER_LAYER', () => {
    const spec = animatedSpec();
    const [shape, text] = [layers(spec).find((layer) => layer.primitive === 'shape')!, layers(spec).find((layer): layer is TextLayer => layer.primitive === 'text')!];
    shape.behaviors = [{ id: 'cut_marker', behavior: 'CUT', version: '1.0.0', at: { semantic: 'SCENE_START', offset: { ms: 100 } } }];
    text.behaviors = [
      { id: 'with_marker', behavior: 'REVEAL_TEXT', version: '1.0.0', at: { layer: { id: shape.id, relation: 'WITH_LAYER' } } },
      { id: 'after_marker', behavior: 'REVEAL_TEXT', version: '1.0.0', at: { layer: { id: shape.id, relation: 'AFTER_LAYER' } } },
    ];
    const timeline = resolveTemporalPlan({ spec, resolvedStyle: resolvedSignal(), fps: 30 });
    expect(timeline.scenes[0]!.behaviors.map((item) => item.start_ms)).toEqual([100, 100, 100]);
  });

  it('refuse un timing impossible avec diagnostic structuré', () => {
    const spec = animatedSpec();
    spec.scenes[0]!.timing.anchor = { duration: { ms: 500 } };
    try {
      resolveTemporalPlan({ spec, resolvedStyle: resolvedSignal(), fps: 30 });
      throw new Error('le timing aurait dû être refusé');
    } catch (error) {
      expect(error).toBeInstanceOf(TemporalResolutionError);
      expect((error as TemporalResolutionError).diagnostics.map((issue) => issue.code)).toContain('temporal.impossible_reading');
    }
  });

  it('calcule une lecture configurable par texte, rôle et locale', () => {
    const reading = { ms_per_word: 250, min_hold_ms: 600 };
    expect(minimumReadabilityMs('Un texte court', 'hook', 'fr-FR', reading)).toBeGreaterThanOrEqual(600);
    expect(minimumReadabilityMs('Un texte nettement plus long à lire', 'signature', 'fr-FR', reading)).toBeGreaterThan(minimumReadabilityMs('Un texte court', 'hook', 'fr-FR', reading));
  });

  it('résout le rythme depuis le style', () => {
    const spec = animatedSpec();
    expect(resolveTemporalPlan({ spec, resolvedStyle: resolvedSignal(), fps: 30 }).scenes[0]!.beat_ms).toBe(300);
    expect(resolveTemporalPlan({ spec, resolvedStyle: resolvedInk(), fps: 30 }).scenes[0]!.beat_ms).toBe(650);
  });

  it('détecte un budget motion dépassé', () => {
    expect(() => resolveTemporalPlan({ spec: animatedSpec(), resolvedStyle: resolvedSignal(), fps: 30, maxAttentionCost: 1 })).toThrow(TemporalResolutionError);
  });

  it('refuse deux behaviors déclarés incompatibles sur le même intervalle', () => {
    const spec = animatedSpec();
    const text = layers(spec).find((layer): layer is TextLayer => layer.primitive === 'text')!;
    text.behaviors.push({ id: 'cut_conflict', behavior: 'CUT', version: '1.0.0', at: { semantic: 'SCENE_START', offset: { ms: 200 } } });
    try {
      resolveTemporalPlan({ spec, resolvedStyle: resolvedSignal(), fps: 30 });
      throw new Error('le conflit aurait dû être refusé');
    } catch (error) {
      expect(error).toBeInstanceOf(TemporalResolutionError);
      expect((error as TemporalResolutionError).diagnostics.map((issue) => issue.code)).toContain('behavior.incompatible');
    }
  });
});

describe('tracks P1.3', () => {
  it('refuse une police absente ou dont les octets ne correspondent pas au hash déclaré', () => {
    const spec = animatedSpec();
    const style = resolvedSignal();
    const base = {
      spec, resolvedStyle: style, platformPresets: platforms(), pattern,
      config: { fps: 30, render_scale: 0.5 }, behaviorRegistry: P13_BEHAVIOR_REGISTRY,
    } as const;
    expect(() => compileMotionScene({ ...base, fontResources: {} })).toThrow(/font\.missing/);
    const altered = resources(style);
    for (const key of Object.keys(altered)) altered[key] = { ...altered[key]!, data: Buffer.from([1, 2, 3]) };
    expect(() => compileMotionScene({ ...base, fontResources: altered })).toThrow(/font\.hash_mismatch/);
  });

  it('compile easing, stagger et keyframes ordonnées dans la scène', () => {
    const spec = animatedSpec();
    const plan = compile(spec);
    const list = tracks(plan);
    expect(list.find((track) => track.source === 'reveal')?.keys[0]?.ease).toEqual(resolvedSignal().style.motion_personality.easings['enter']);
    expect(list.some((track) => track.target?.line === 1 && track.keys[0]!.frame > 0)).toBe(true);
    for (const track of list) {
      expect(track.keys.map((key) => key.frame)).toEqual([...track.keys.map((key) => key.frame)].sort((a, b) => a - b));
      expect(track.keys.every((key) => key.frame >= 0 && key.frame < plan.scenes[0]!.to)).toBe(true);
    }
  });

  it('produit un stagger et un hash déterministes', () => {
    const first = compile();
    const second = compile();
    expect(hashDocument(first)).toBe(hashDocument(second));
    expect(tracks(first).filter((track) => track.source === 'reveal' && track.property === 'opacity').map((track) => track.keys[0]!.frame)).toEqual([6, 7]);
  });

  it('réduit le mouvement à l’opacité et aux changements instantanés', () => {
    const reduced = tracks(compile(animatedSpec(), resolvedSignal(), true));
    expect(reduced.some((track) => track.property === 'translate_y')).toBe(false);
    expect(reduced.filter((track) => track.source === 'reveal').every((track) => track.property === 'opacity')).toBe(true);
  });

  it('refuse deux tracks incompatibles sur le même intervalle', () => {
    const conflicting: Track[] = [
      { id: 'track_first', property: 'opacity', source: 'first', keys: [{ frame: 0, value: 0 }, { frame: 10, value: 1 }] },
      { id: 'track_second', property: 'opacity', source: 'second', keys: [{ frame: 5, value: 1 }, { frame: 15, value: 0 }] },
    ];
    expect(() => assertNoTrackConflicts('text', conflicting)).toThrow(MotionTrackError);
  });
});

describe('invariants temporels par classes de valeurs', () => {
  it('garde toutes les keyframes dans des scènes positives pour plusieurs durées', () => {
    for (const duration of [3_000, 4_000, 5_000, 8_000]) {
      const spec = animatedSpec();
      spec.scenes[0]!.timing.anchor = { duration: { ms: duration } };
      const plan = compile(spec);
      expect(plan.scenes[0]!.to).toBeGreaterThan(plan.scenes[0]!.from);
      expect(tracks(plan).every((track) => track.keys.every((key) => key.frame >= plan.scenes[0]!.from && key.frame < plan.scenes[0]!.to))).toBe(true);
    }
  });
});
