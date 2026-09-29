import { P17_BEHAVIOR_REGISTRY, compilePipeline, type CompilerPipelineResult, type ResolvedStyle } from '@motion-engine/core';
import type { CreativePlan } from '@motion-engine/creative-core';
import {
  buildAssetDiversityReport,
  buildProceduralAssetPreflight,
  compileProceduralAssetPlan,
  hashProceduralAssetPlan,
  resolveProceduralAssetRequest,
  type AssetDiversityReport,
  type ProceduralAssetPlan,
  type ProceduralAssetPreflightReport,
  type ProceduralAssetRequest,
} from '@motion-engine/procedural-asset-core';
import { compileVisualDirectionPlan, type VisualDirectionCompileResult } from '@motion-engine/visual-director-core';
import { compileVisualPlan, type VisualCompileResult } from '@motion-engine/visual-compiler';
import { buildVisualDiversityReport, type VisualPlan } from '@motion-engine/visual-core';

import { pattern, platforms } from './p1.2-support.ts';
import { p14FontResources } from './p1.4-support.ts';
import { buildP33ADirectionFixture } from './p3.3a-support.ts';
import { p32Style } from './p3.2-support.ts';

export type P335FixtureKind = 'science' | 'product' | 'editorial';

const familiesByKind: Readonly<Record<P335FixtureKind, readonly ProceduralAssetRequest['family'][]>> = Object.freeze({
  product: ['GENERIC_SMARTPHONE_FRAME', 'APP_SCREEN', 'DASHBOARD', 'DATA_CHART'],
  science: ['LIGHT_SYSTEM', 'LIGHT_SYSTEM', 'PROCESS_DIAGRAM', 'PROCESS_DIAGRAM'],
  editorial: ['POSTER_FRAME', 'DECORATIVE_SYSTEM'],
});

const productPresentation = Object.freeze([
  { headline: 'VOS PRIORITÉS. UN SEUL ESPACE.', title: 'AUJOURD’HUI', label: 'VUE D’ENSEMBLE', value: '08:42' },
  { headline: 'CE QUI COMPTE, TOUT DE SUITE.', title: 'PRIORITÉS', label: 'À TRAITER', value: '12' },
  { headline: 'CHAQUE PROJET. TOUJOURS LISIBLE.', title: 'PROGRESSION', label: 'CETTE SEMAINE', value: '72%' },
  { headline: 'LA PROGRESSION DEVIENT ÉVIDENTE.', title: 'IMPACT', label: 'TEMPS GAGNÉ', value: '+18%' },
  { headline: 'UNE JOURNÉE PLUS SIMPLE.', title: 'RÉSULTAT', label: 'FLUIDITÉ', value: '100%' },
] as const);

function variant(family: ProceduralAssetRequest['family']): ProceduralAssetRequest['variant'] {
  if (family === 'GENERIC_SMARTPHONE_FRAME') return 'PHONE';
  if (family === 'APP_SCREEN') return 'FEATURE';
  if (family === 'DASHBOARD') return 'CHART';
  if (family === 'DATA_CHART') return 'LINE';
  if (family === 'LIGHT_SYSTEM') return 'ATMOSPHERE';
  if (family === 'PROCESS_DIAGRAM') return 'PROCESS';
  if (family === 'POSTER_FRAME') return 'EDITORIAL';
  return 'GRID';
}

function language(family: ProceduralAssetRequest['family']): ProceduralAssetRequest['language'] {
  if (['GENERIC_SMARTPHONE_FRAME', 'APP_SCREEN', 'DASHBOARD'].includes(family)) return 'UI';
  if (['DATA_CHART', 'PROCESS_DIAGRAM'].includes(family)) return 'DATA';
  if (['LIGHT_SYSTEM', 'PARTICLE_FIELD', 'ORBIT_SYSTEM'].includes(family)) return 'PROCEDURAL_ENVIRONMENT';
  return 'EDITORIAL';
}

function material(kind: P335FixtureKind, family: ProceduralAssetRequest['family']): ProceduralAssetRequest['material'] {
  if (kind === 'product') {
    if (family === 'GENERIC_SMARTPHONE_FRAME') return 'SOFT_SHADOW';
    if (family === 'APP_SCREEN') return 'GLASS_LIKE_SIMPLIFIED';
    if (family === 'DASHBOARD') return 'GRADIENT_LAYERED';
    return 'BORDERED';
  }
  if (kind === 'science') return 'LUMINOUS';
  return 'PAPER_LIKE';
}

function choreography(kind: P335FixtureKind, family: ProceduralAssetRequest['family']): ProceduralAssetRequest['choreography'] {
  if (kind === 'science') return family === 'PROCESS_DIAGRAM' ? 'DATA_HERO' : 'ENVIRONMENT_FOCUS';
  if (kind === 'editorial') return 'EDITORIAL_RECOMPOSE';
  return family === 'DATA_CHART' ? 'DATA_HERO' : 'PRODUCT_HERO';
}

export interface P335Pipeline {
  readonly kind: P335FixtureKind;
  readonly creative_plan: CreativePlan;
  readonly direction_compile: VisualDirectionCompileResult;
  readonly procedural_asset_plans: readonly ProceduralAssetPlan[];
  readonly asset_preflights: readonly ProceduralAssetPreflightReport[];
  readonly asset_diversity: AssetDiversityReport;
  readonly visual_plan: VisualPlan;
  readonly visual_compile: VisualCompileResult;
  readonly p1: CompilerPipelineResult;
  readonly style: ResolvedStyle;
  readonly diversity: ReturnType<typeof buildVisualDiversityReport>;
  readonly hashes: { readonly procedural_assets: readonly string[] };
}

export interface P335CompileMetrics {
  readonly asset_resolution_ms: number;
  readonly director_and_visual_plan_ms: number;
  readonly visual_plan_to_motion_spec_ms: number;
  readonly p1_compile_ms: number;
  readonly total_compile_ms: number;
}

export function profileP335Pipeline(kind: P335FixtureKind, renderScale = 0.5): { pipeline: P335Pipeline; metrics: P335CompileMetrics } {
  const totalStarted = performance.now();
  const fixture = buildP33ADirectionFixture(kind);
  const plans: ProceduralAssetPlan[] = [];
  let assetMs = 0;
  const directorStarted = performance.now();
  const directionCompile = compileVisualDirectionPlan(fixture.direction_plan, fixture.creative_plan, fixture.context, {
    visual_plan_version: '0.3.0', visual_grammar_version: '0.3.0',
    resolve_scene_presentation: ({ scene_index }) => kind === 'product'
      ? { display_text: productPresentation[scene_index]?.headline ?? 'UN PRODUIT. UNE DIRECTION CLAIRE.', text_role: scene_index === 4 ? 'HEADLINE' : 'SUBHEAD', text_region: scene_index === 0 ? 'left' : 'top', text_align: scene_index === 0 ? 'start' : 'center', asset_led: scene_index < 4 }
      : { asset_led: true },
    resolve_asset_entities: ({ asset_intent, source_scene, scene_direction, direction_plan, composition_root_id }) => {
      const sceneAssetIndex = scene_direction.asset_intents.filter((entry) => entry.availability === 'AVAILABLE').findIndex((entry) => entry.id === asset_intent.id);
      const globalIndex = direction_plan.scenes.slice(0, direction_plan.scenes.findIndex((entry) => entry.id === scene_direction.id)).reduce((sum, entry) => sum + entry.asset_intents.filter((asset) => asset.availability === 'AVAILABLE').length, 0) + Math.max(0, sceneAssetIndex);
      const family = familiesByKind[kind][globalIndex] ?? (kind === 'product' ? 'UI_CARD' : kind === 'science' ? 'PROCESS_DIAGRAM' : 'POSTER_FRAME');
      const fixtureCopy = kind === 'product' ? productPresentation[globalIndex] : undefined;
      const copy = fixtureCopy?.title ?? source_scene.content.on_screen[0]?.text ?? source_scene.content.spoken[0]?.text ?? source_scene.semantic_purpose;
      const request: ProceduralAssetRequest = {
        request_id: `${asset_intent.id}_procedural`, source_asset_intent_id: asset_intent.id, direction_plan_id: direction_plan.direction_plan_id, scene_id: source_scene.id,
        family, variant: variant(family), semantic_role: asset_intent.role.toLowerCase(), language: language(family),
        system_identity: kind === 'product' ? 'PRODUCT_POLISHED' : kind === 'science' ? 'EXPLAINER_LUMINOUS' : 'EDITORIAL_PRECISE',
        material_language: kind === 'product' ? 'SOFT_DIMENSIONAL' : kind === 'science' ? 'LUMINOUS_TECH' : 'EDITORIAL_PAPER',
        material: material(kind, family), density: scene_direction.visual_density === 'SPARSE' ? 'SPACIOUS' : scene_direction.visual_density === 'DENSE' ? 'COMPACT' : 'BALANCED',
        emphasis: asset_intent.role === 'DEVICE_FRAME' || asset_intent.role === 'HERO' ? 'PRIMARY' : 'SECONDARY', choreography: choreography(kind, family),
        persistent: kind === 'product', seed: 3350 + globalIndex * 101,
        copy: { title: copy.slice(0, 80), label: fixtureCopy?.label ?? (globalIndex === 0 ? 'VUE D’ENSEMBLE' : globalIndex === 1 ? 'PRIORITÉ' : globalIndex === 2 ? 'PROGRESSION' : 'IMPACT'), value: fixtureCopy?.value ?? (globalIndex === 0 ? '08:42' : globalIndex === 1 ? '12 TÂCHES' : globalIndex === 2 ? '72%' : '+18%') },
        data: [0.22, 0.48, 0.37, 0.69, 0.82, 0.76],
      };
      const started = performance.now();
      const plan = resolveProceduralAssetRequest(request);
      const compiled = compileProceduralAssetPlan(plan, composition_root_id);
      assetMs += performance.now() - started;
      if (!compiled.ok) throw new Error(`asset.compile.failed:${JSON.stringify(compiled.preflight.diagnostics)}`);
      plans.push(plan);
      return compiled.entities;
    },
  });
  const directorMs = performance.now() - directorStarted;
  if (!directionCompile.ok || !directionCompile.visual_plan) throw new Error(`Direction P3.3.5 invalide (${kind}): ${JSON.stringify(directionCompile.direction_preflight.diagnostics)} / ${JSON.stringify(directionCompile.visual_preflight?.diagnostics)}`);
  const style = p32Style();
  const visualStarted = performance.now();
  const visualCompile = compileVisualPlan(directionCompile.visual_plan, { resolved_style: style, pattern: pattern(), target_platform: 'shorts', asset_refs: new Set() });
  const visualMs = performance.now() - visualStarted;
  if (!visualCompile.ok || !visualCompile.motion_spec) throw new Error(`VisualPlan P3.3.5 invalide (${kind}): ${JSON.stringify(visualCompile.diagnostics)}`);
  const p1Started = performance.now();
  const p1 = compilePipeline({ spec: visualCompile.motion_spec, resolvedStyle: style, platformPresets: platforms(), pattern: pattern(), fontResources: p14FontResources(style), assetResources: {}, behaviorRegistry: P17_BEHAVIOR_REGISTRY, config: { fps: 30, render_scale: renderScale, minimum_readable_size: renderScale === 1 ? 28 : 14 } });
  const p1Ms = performance.now() - p1Started;
  const assetPreflights = plans.map((plan) => buildProceduralAssetPreflight(plan));
  return {
    pipeline: { kind, creative_plan: fixture.creative_plan, direction_compile: directionCompile, procedural_asset_plans: plans, asset_preflights: assetPreflights, asset_diversity: buildAssetDiversityReport(plans), visual_plan: directionCompile.visual_plan, visual_compile: visualCompile, p1, style, diversity: buildVisualDiversityReport(directionCompile.visual_plan), hashes: { procedural_assets: plans.map(hashProceduralAssetPlan) } },
    metrics: { asset_resolution_ms: assetMs, director_and_visual_plan_ms: directorMs, visual_plan_to_motion_spec_ms: visualMs, p1_compile_ms: p1Ms, total_compile_ms: performance.now() - totalStarted },
  };
}

export function buildP335Pipeline(kind: P335FixtureKind, renderScale = 0.5): P335Pipeline {
  return profileP335Pipeline(kind, renderScale).pipeline;
}
