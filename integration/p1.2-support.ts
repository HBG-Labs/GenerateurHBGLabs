import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  buildMotionSceneSpec,
  buildReproducibilityManifest,
  compileMotionScene,
  loadPlatformPresetsFile,
  resolvedStyleHash,
  sha256Hex,
  validateIntent,
  validatePatternDefinition,
} from '@motion-engine/core';
import type {
  CreativeIntent,
  FontResource,
  MotionSceneSpec,
  PatternDefinition,
  RenderPlan,
  ReproducibilityManifest,
  ResolvedStyle,
} from '@motion-engine/core';

import { CORE, FONT_LIBRARY, WORKSPACE, loadCoreFixtureStyle, loadNocturne, mustResolve, readJson } from './support.ts';

function unwrap<T>(label: string, result: { ok: true; value: T } | { ok: false; issues: unknown[] }): T {
  if (!result.ok) throw new Error(`${label} invalide : ${JSON.stringify(result.issues)}`);
  return result.value;
}

export const pattern = () =>
  unwrap(
    'Pattern',
    validatePatternDefinition(readJson('packs/patterns/generic/statement.interrupt.json')),
  );

export const intent = () => unwrap('Intent', validateIntent(readJson('fixtures/p1.2/statement.intent.json')));

export const platforms = () => loadPlatformPresetsFile(path.join(WORKSPACE, 'packs', 'platforms', 'platforms.json'));

export const signal = () => mustResolve({ style: loadCoreFixtureStyle('fixture_signal') });
export const nocturne = () => mustResolve({ style: loadNocturne() });

function toRelative(file: string): string {
  return path.relative(WORKSPACE, file).replaceAll('\\', '/');
}

export function fontResources(style: ResolvedStyle, libraryRoot: string): Record<string, FontResource> {
  const result: Record<string, FontResource> = {};
  for (const family of Object.values(style.style.typography.families)) {
    for (const file of family.files) {
      if (!file.src.startsWith('lib:')) throw new Error(`P1.2 attend une police lib:, reçu ${file.src}`);
      const absolute = path.join(libraryRoot, file.src.slice('lib:'.length));
      if (sha256Hex(readFileSync(absolute)) !== file.sha256) {
        throw new Error(`Empreinte de police invalide : ${file.src}`);
      }
      result[file.src] = { file: toRelative(absolute), sha256: file.sha256 };
    }
  }
  return result;
}

export interface P12Pipeline {
  intent: CreativeIntent;
  pattern: PatternDefinition;
  spec: MotionSceneSpec;
  signalStyle: ResolvedStyle;
  nocturneStyle: ResolvedStyle;
  signalPlan: RenderPlan;
  nocturnePlan: RenderPlan;
  signalManifest: ReproducibilityManifest;
  nocturneManifest: ReproducibilityManifest;
}

function manifest(spec: MotionSceneSpec, style: ResolvedStyle, plan: RenderPlan, substitutionReason?: string) {
  return buildReproducibilityManifest({
    createdAt: '2026-09-27T00:00:00Z',
    engine: { name: '@motion-engine/core', version: '0.1.0', git_commit: null },
    spec,
    resolvedStyle: style,
    plan,
    platformPresets: platforms(),
    toolchain: { node: process.version, remotion: '4.0.529', chromium: null, ffmpeg: null },
    renderConfig: {
      width: plan.canvas.width,
      height: plan.canvas.height,
      fps: plan.canvas.fps,
      codec: 'png-still',
      crf: null,
      pixel_format: null,
    },
    ...(substitutionReason ? { substitutionReason } : {}),
  });
}

export function buildP12Pipeline(): P12Pipeline {
  const creativeIntent = intent();
  const definition = pattern();
  const signalStyle = signal();
  const nocturneStyle = nocturne();
  if (resolvedStyleHash(signalStyle) !== signalStyle.sha256 || resolvedStyleHash(nocturneStyle) !== nocturneStyle.sha256) {
    throw new Error('Empreinte de style invalide.');
  }
  const spec = buildMotionSceneSpec({
    intent: creativeIntent,
    resolvedStyle: signalStyle,
    platformPresets: platforms(),
    platform: 'tiktok',
    pattern: definition,
    content: { lines: [{ text: 'Une question' }, { text: 'change tout', accent: true }] },
  });
  const compile = (style: ResolvedStyle, resources: Record<string, FontResource>, allowStyleSubstitution: boolean) =>
    compileMotionScene({
      spec,
      resolvedStyle: style,
      platformPresets: platforms(),
      pattern: definition,
      fontResources: resources,
      config: { fps: 30, scene_duration_frames: 90 },
      allowStyleSubstitution,
    });
  const signalPlan = compile(signalStyle, fontResources(signalStyle, path.join(CORE, 'test-fixtures', 'fonts')), false);
  const nocturnePlan = compile(nocturneStyle, fontResources(nocturneStyle, FONT_LIBRARY.libraryRoot), true);
  return {
    intent: creativeIntent,
    pattern: definition,
    spec,
    signalStyle,
    nocturneStyle,
    signalPlan,
    nocturnePlan,
    signalManifest: manifest(spec, signalStyle, signalPlan),
    nocturneManifest: manifest(
      spec,
      nocturneStyle,
      nocturnePlan,
      'P1.2 : même MotionSceneSpecification, style de contrôle Nocturne',
    ),
  };
}
