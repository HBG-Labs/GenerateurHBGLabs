import { describe, expect, it } from 'vitest';

import type { CreativeIntent } from './contracts/creative-intent.ts';
import type { PatternDefinition } from './contracts/pattern.ts';
import type { PlatformPresets } from './contracts/platform.ts';
import type { ResolvedStyle } from './contracts/resolved-style.ts';
import { compileMotionScene } from './compiler/compile.ts';
import { hashDocument } from './integrity/canonical.ts';
import { buildMotionSceneSpec } from './spec-builder/build-spec.ts';
import { readFixture, resolvedInk, resolvedSignal } from './test-support.ts';
import { validatePatternDefinition, validateRenderPlan, validateSpec } from './validation/validate.ts';

const pattern: PatternDefinition = {
  schema: 'pattern-definition',
  schema_version: '0.1.0',
  id: 'statement.interrupt',
  version: '0.1.0',
  intent: 'Interrompre par une affirmation immédiatement lisible.',
  background: 'color.surface.primary',
  layout: {
    kind: 'stack',
    region: 'safe',
    direction: 'vertical',
    align_x: 'start',
    align_y: 'center',
    gap: 'space.md',
  },
  slots: [
    {
      id: 'interrupt.marker',
      primitive: 'shape',
      role: 'interrupt_marker',
      order: 0,
      width: { kind: 'fill' },
      height: { kind: 'space', token: 'space.sm' },
      style: { fill: 'color.accent' },
    },
    {
      id: 'statement.primary',
      primitive: 'text',
      role: 'statement',
      order: 1,
      width: { kind: 'fill' },
      height: { kind: 'content' },
      style: { type: 'type.display.xl', color: 'color.text.primary', accent_color: 'color.accent' },
    },
  ],
  constraints: { min_lines: 2, max_lines: 3, explicit_line_breaks: true },
};

const intent = () => readFixture('moon.intent.json') as CreativeIntent;
const platforms = () => readFixture('platforms.json') as PlatformPresets;

function resources(style: ResolvedStyle) {
  return Object.fromEntries(
    Object.values(style.style.typography.families).flatMap((family) =>
      family.files.map((file) => [file.src, { file: `fixtures/${file.src.slice(4)}`, sha256: file.sha256 }]),
    ),
  );
}

function build(style = resolvedSignal()) {
  return buildMotionSceneSpec({
    intent: intent(),
    resolvedStyle: style,
    platformPresets: platforms(),
    platform: 'tiktok',
    pattern,
    content: { lines: [{ text: 'Une question' }, { text: 'change tout', accent: true }] },
  });
}

function compile(style: ResolvedStyle, allowStyleSubstitution = false) {
  return compileMotionScene({
    spec: build(),
    resolvedStyle: style,
    platformPresets: platforms(),
    pattern,
    fontResources: resources(style),
    config: { fps: 30, scene_duration_frames: 90 },
    allowStyleSubstitution,
  });
}

describe('PatternDefinition P1.2', () => {
  it('valide statement.interrupt', () => {
    expect(validatePatternDefinition(pattern).ok).toBe(true);
  });

  it('rejette un pattern ambigu', () => {
    const invalid = structuredClone(pattern);
    invalid.slots[1]!.order = 0;
    expect(validatePatternDefinition(invalid)).toMatchObject({ ok: false });
  });
});

describe('SpecBuilder P1.2', () => {
  it('est déterministe et produit une spec sémantique valide', () => {
    const first = build();
    const second = build();
    expect(hashDocument(first)).toBe(hashDocument(second));
    expect(first).toEqual(second);
    expect(validateSpec(first, resolvedSignal()).ok).toBe(true);
  });

  it('ne contient ni pixels, ni frames, ni CSS, ni JSX', () => {
    const json = JSON.stringify(build());
    expect(json).not.toMatch(/\b(px|pixels?|frames?|css|jsx|remotion)\b/i);
    const primitives = build().scenes.flatMap((scene) => scene.layers).map((layer) => layer.primitive);
    expect(primitives).toEqual(['group']);
  });
});

describe('Compiler P1.2', () => {
  it('est déterministe et résout dimensions, couleurs et polices', () => {
    const first = compile(resolvedSignal());
    const second = compile(resolvedSignal());
    expect(hashDocument(first)).toBe(hashDocument(second));
    expect(validateRenderPlan(first).ok).toBe(true);
    expect(first.canvas).toEqual({ width: 1080, height: 1920, fps: 30, duration_frames: 90 });
    expect(first.scenes[0]?.background).toBe('#FFE14D');
    expect(first.fonts).toHaveLength(1);
    expect(first.fonts[0]).toMatchObject({ css_name: 'fixture-signal-mono', weight: 700 });
  });

  it('rend la même spec différemment avec un autre style', () => {
    const signal = compile(resolvedSignal());
    const ink = compile(resolvedInk(), true);
    expect(hashDocument(signal)).not.toBe(hashDocument(ink));
    expect(signal.spec.sha256).toBe(ink.spec.sha256);
    expect(signal.scenes[0]?.background).not.toBe(ink.scenes[0]?.background);
    expect(signal.fonts[0]?.sha256).not.toBe(ink.fonts[0]?.sha256);
  });
});
