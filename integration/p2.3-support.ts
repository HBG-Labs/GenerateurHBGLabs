import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  ImageAssetMetadataSchema,
  compilePipeline,
  loadStyleFile,
  resolveStyle,
  type CompilerPipelineResult,
  type ImageResource,
  type ResolvedStyle,
} from '@motion-engine/core';
import {
  planCreativeStory,
  type StoryPlanningResult,
} from '@motion-engine/creative-core';
import {
  SHORT_FORM_DEFAULT_PROFILE,
  buildCreativeResolution,
  compileCreativePlan,
  type AssetSlotValue,
  type ContentSlotValue,
  type CreativeCompileResult,
  type CreativeResolution,
} from '@motion-engine/creative-compiler';

import { pattern, platforms } from './p1.2-support.ts';
import { p14FontResources } from './p1.4-support.ts';
import { FONT_LIBRARY, WORKSPACE, loadNocturne, readJson } from './support.ts';

export type P23FixtureName = 'hypothetical-30s' | 'explainer-30s' | 'product-demo-20s' | 'minimal-5s' | 'long-60s';
export type P23StyleName = 'signal' | 'nocturne';

function signalStyle(): ResolvedStyle {
  const loaded = loadStyleFile(path.join(WORKSPACE, 'fixtures', 'p1.4', 'styles', 'p1-4-signal.style.json'), FONT_LIBRARY);
  const result = resolveStyle({ style: loaded });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}

function nocturneStyle(): ResolvedStyle {
  const result = resolveStyle({ style: loadNocturne() });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}

export function p23Style(name: P23StyleName): ResolvedStyle {
  return name === 'signal' ? signalStyle() : nocturneStyle();
}

export function p23Asset(): ImageResource {
  const metadata = ImageAssetMetadataSchema.parse(readJson('fixtures/p1.4/neutral.asset.json'));
  return {
    ...metadata,
    file: 'fixtures/p1.4/assets/neutral-landscape.png',
    data: readFileSync(path.join(WORKSPACE, 'fixtures', 'p1.4', 'assets', 'neutral-landscape.png')),
  };
}

interface ResolutionValues {
  readonly plan_id?: string;
  readonly content: readonly ContentSlotValue[];
  readonly assets: readonly AssetSlotValue[];
}

export interface P23CreativeFixture {
  readonly planning: StoryPlanningResult;
  readonly resolution: CreativeResolution;
}

export function buildP23CreativeFixture(name: P23FixtureName): P23CreativeFixture {
  const planning = planCreativeStory(readJson(`creative-core/fixtures/planner/${name}.planner-input.json`));
  if (!planning.ok || !planning.creative_plan || !planning.report) throw new Error(`Planning ${name} invalide.`);
  const values = readJson(`creative-compiler/fixtures/p2.3/${name}.resolution-values.json`) as ResolutionValues;
  if (values.plan_id !== undefined && values.plan_id !== planning.creative_plan.plan_id) {
    throw new Error(`La résolution ${name} ne cible plus son CreativePlan.`);
  }
  const resolution = buildCreativeResolution({
    plan: planning.creative_plan,
    planning_report: planning.report,
    content_slots: planning.content_slots,
    content: values.content,
    assets: values.assets,
  });
  return { planning, resolution };
}

export interface P23Pipeline {
  readonly creative: P23CreativeFixture;
  readonly creative_compile: CreativeCompileResult;
  readonly p1: CompilerPipelineResult;
  readonly style: ResolvedStyle;
  readonly asset: ImageResource;
}

export function buildP23Pipeline(name: P23FixtureName, styleName: P23StyleName, renderScale = 0.5): P23Pipeline {
  const creative = buildP23CreativeFixture(name);
  const style = p23Style(styleName);
  const definition = pattern();
  const creativeCompile = compileCreativePlan(creative.planning.creative_plan, {
    resolution: creative.resolution,
    profile: SHORT_FORM_DEFAULT_PROFILE,
    resolved_style: style,
    pattern: definition,
  });
  if (!creativeCompile.ok || !creativeCompile.motion_spec) {
    throw new Error(`Compilation créative ${name}/${styleName} invalide : ${JSON.stringify(creativeCompile.report.diagnostics)}`);
  }
  const asset = p23Asset();
  const p1 = compilePipeline({
    spec: creativeCompile.motion_spec,
    resolvedStyle: style,
    platformPresets: platforms(),
    pattern: definition,
    fontResources: p14FontResources(style),
    assetResources: { [asset.ref]: asset },
    config: {
      fps: SHORT_FORM_DEFAULT_PROFILE.fps,
      render_scale: renderScale,
      minimum_readable_size: renderScale === 1 ? 28 : 14,
    },
  });
  return { creative, creative_compile: creativeCompile, p1, style, asset };
}
