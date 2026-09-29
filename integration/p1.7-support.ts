import {
  compilePipeline,
  P17_BEHAVIOR_REGISTRY,
  resolveStyle,
  validateSpec,
} from '@motion-engine/core';
import type { CompilerPipelineResult, MotionSceneSpec, ResolvedStyle } from '@motion-engine/core';

import { p14FontResources } from './p1.4-support.ts';
import { buildP14Pipeline } from './p1.4-support.ts';
import { pattern, platforms } from './p1.2-support.ts';

export interface P17FixtureOptions {
  readonly text?: string;
  readonly tracking?: readonly [number, number];
  readonly wght?: readonly [number, number] | null;
  readonly wdth?: readonly [number, number] | null;
  readonly duration_ms?: number;
}

export interface P17Pipeline {
  readonly spec: MotionSceneSpec;
  readonly style: ResolvedStyle;
  readonly pipeline: CompilerPipelineResult;
}

export function buildP17Pipeline(options: P17FixtureOptions = {}, renderScale = 0.5): P17Pipeline {
  const base = buildP14Pipeline(renderScale);
  const styleProfile = structuredClone(base.signalStyle.style);
  styleProfile.id = 'p17_dynamic_typography';
  styleProfile.name = 'P1.7 Dynamic Typography';
  styleProfile.motion_personality.behaviors['TYPE_TRACKING'] = { allowed: true };
  styleProfile.motion_personality.behaviors['TYPE_AXIS'] = { allowed: true };
  const resolved = resolveStyle({ style: styleProfile });
  if (!resolved.ok) throw new Error(`Style P1.7 invalide : ${JSON.stringify(resolved.issues)}`);
  const style = resolved.value;

  const spec = structuredClone(base.spec);
  spec.spec_id = 'p17_dynamic_typography_proof';
  spec.created_from = { intent_id: 'p17_dynamic_typography', builder_version: '0.6.0' };
  spec.style_binding = { kind: 'style', id: style.style.id, version: style.style.version };
  const scene = spec.scenes[0]!;
  scene.timing = { anchor: { duration: { ms: options.duration_ms ?? 7_000 } }, min_hold: 'reading' };
  scene.subtitles = { mode: 'off', reason: 'Certification P1.7 muette.' };
  const root = scene.layers[0];
  if (!root || root.primitive !== 'group') throw new Error('Fixture P1.7 sans groupe racine.');
  const headline = root.children.find((layer) => layer.id === 'headline');
  if (!headline || headline.primitive !== 'text') throw new Error('Fixture P1.7 sans headline.');
  const clearBehaviors = (layer: typeof root.children[number]): void => {
    layer.behaviors = [];
    if (layer.primitive === 'group' || layer.primitive === 'mask') layer.children.forEach(clearBehaviors);
  };
  root.children.forEach(clearBehaviors);
  headline.content.runs = [{ id: 'dynamic_run', text: options.text ?? 'ÉLAN BLEU 2027 !', role: 'accent' }];
  headline.behaviors = [
    {
      id: 'dynamic_tracking', behavior: 'TYPE_TRACKING', version: '1.0.0',
      params: { from_em: options.tracking?.[0] ?? -0.04, to_em: options.tracking?.[1] ?? 0.08 },
      target: { run: 'dynamic_run' }, at: { semantic: 'SCENE_START' }, duration: { ms: 4_800 },
    },
  ];
  const wght = options.wght === undefined ? [360, 820] as const : options.wght;
  if (wght) headline.behaviors.push({ id: 'dynamic_wght', behavior: 'TYPE_AXIS', version: '1.0.0', params: { axis: 'wght', from: wght[0], to: wght[1] }, target: { run: 'dynamic_run' }, at: { semantic: 'SCENE_START' }, duration: { ms: 4_800 } });
  const wdth = options.wdth === undefined ? [72, 96] as const : options.wdth;
  if (wdth) headline.behaviors.push({ id: 'dynamic_wdth', behavior: 'TYPE_AXIS', version: '1.0.0', params: { axis: 'wdth', from: wdth[0], to: wdth[1] }, target: { run: 'dynamic_run' }, at: { semantic: 'SCENE_START' }, duration: { ms: 4_800 } });

  const checked = validateSpec(spec, style, { registry: P17_BEHAVIOR_REGISTRY, assetRefs: new Set([base.asset.ref]) });
  if (!checked.ok) throw new Error(`Spec P1.7 invalide : ${JSON.stringify(checked.issues)}`);
  const pipeline = compilePipeline({
    spec: checked.value, resolvedStyle: style, platformPresets: platforms(), pattern: pattern(),
    fontResources: p14FontResources(style), assetResources: { [base.asset.ref]: base.asset },
    behaviorRegistry: P17_BEHAVIOR_REGISTRY,
    config: { fps: 30, render_scale: renderScale, minimum_readable_size: renderScale === 1 ? 28 : 14 },
  });
  return { spec: checked.value, style, pipeline };
}
