import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  compileMotionScene,
  ImageAssetMetadataSchema,
  loadStyleFile,
  P14_BEHAVIOR_REGISTRY,
  resolveStyle,
  sha256Hex,
  validateSpec,
} from '@motion-engine/core';
import type { FontResource, ImageResource, MotionSceneSpec, RenderPlan, ResolvedStyle } from '@motion-engine/core';

import { pattern, platforms } from './p1.2-support.ts';
import { FONT_LIBRARY, WORKSPACE, loadNocturne, readJson } from './support.ts';

export interface P14Pipeline {
  spec: MotionSceneSpec;
  signalStyle: ResolvedStyle;
  nocturneStyle: ResolvedStyle;
  signalPlan: RenderPlan;
  nocturnePlan: RenderPlan;
  asset: ImageResource;
}

function p14Signal(): ResolvedStyle {
  const loaded = loadStyleFile(path.join(WORKSPACE, 'fixtures', 'p1.4', 'styles', 'p1-4-signal.style.json'), FONT_LIBRARY);
  const resolved = resolveStyle({ style: loaded });
  if (!resolved.ok) throw new Error(`Style Signal P1.4 invalide : ${JSON.stringify(resolved.issues)}`);
  return resolved.value;
}

function resources(style: ResolvedStyle): Record<string, FontResource> {
  const result: Record<string, FontResource> = {};
  for (const family of Object.values(style.style.typography.families)) {
    for (const file of family.files) {
      if (!file.src.startsWith('lib:')) throw new Error(`Police locale lib: attendue, reçu ${file.src}`);
      const absolute = path.join(FONT_LIBRARY.libraryRoot, file.src.slice(4));
      const data = readFileSync(absolute);
      if (sha256Hex(data) !== file.sha256) throw new Error(`Hash de police invalide : ${file.src}`);
      result[file.src] = { file: path.relative(WORKSPACE, absolute).replaceAll('\\', '/'), sha256: file.sha256, data };
    }
  }
  return result;
}

function neutralAsset(): ImageResource {
  const metadata = ImageAssetMetadataSchema.parse(readJson('fixtures/p1.4/neutral.asset.json'));
  const absolute = path.join(WORKSPACE, 'fixtures', 'p1.4', metadata.src.slice('pack:'.length));
  return { ...metadata, file: path.relative(WORKSPACE, absolute).replaceAll('\\', '/'), data: readFileSync(absolute) };
}

export function buildP14Pipeline(renderScale = 0.5): P14Pipeline {
  const specRaw = readJson('fixtures/p1.4/visual.spec.json');
  const signalStyle = p14Signal();
  const nocturneResolved = resolveStyle({ style: loadNocturne() });
  if (!nocturneResolved.ok) throw new Error(`Style Nocturne invalide : ${JSON.stringify(nocturneResolved.issues)}`);
  const nocturneStyle = nocturneResolved.value;
  const checked = validateSpec(specRaw, signalStyle, { registry: P14_BEHAVIOR_REGISTRY, assetRefs: new Set(['neutral_landscape']) });
  if (!checked.ok) throw new Error(`Spec P1.4 invalide : ${JSON.stringify(checked.issues)}`);
  const spec = checked.value;
  const asset = neutralAsset();
  const common = {
    spec,
    platformPresets: platforms(),
    pattern: pattern(),
    assetResources: { [asset.ref]: asset },
    behaviorRegistry: P14_BEHAVIOR_REGISTRY,
    config: { fps: 30, render_scale: renderScale, minimum_readable_size: renderScale === 1 ? 28 : 14 },
  } as const;
  const signalPlan = compileMotionScene({ ...common, resolvedStyle: signalStyle, fontResources: resources(signalStyle) });
  const nocturnePlan = compileMotionScene({
    ...common,
    resolvedStyle: nocturneStyle,
    fontResources: resources(nocturneStyle),
    allowStyleSubstitution: true,
  });
  return { spec, signalStyle, nocturneStyle, signalPlan, nocturnePlan, asset };
}
