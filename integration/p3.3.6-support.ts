import path from "node:path";

import {
  P17_BEHAVIOR_REGISTRY,
  compilePipeline,
  loadStyleFile,
  resolveStyle,
  type CompilerPipelineResult,
  type ResolvedStyle,
} from "@motion-engine/core";
import type { CreativePlan } from "@motion-engine/creative-core";
import {
  buildPremiumDesignSystemReport,
  hashPremiumDesignPlan,
  resolvePremiumDesign,
  type DesignDecisionTrace,
  type PremiumDesignPlan,
  type PremiumDesignPreflightReport,
  type PremiumDesignResolution,
} from "@motion-engine/premium-design-core";
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
} from "@motion-engine/procedural-asset-core";
import {
  compileVisualDirectionPlan,
  type VisualDirectionCompileResult,
} from "@motion-engine/visual-director-core";
import {
  compileVisualPlan,
  type VisualCompileResult,
} from "@motion-engine/visual-compiler";
import {
  buildVisualDiversityReport,
  type VisualPlan,
} from "@motion-engine/visual-core";

import { pattern, platforms } from "./p1.2-support.ts";
import { p14FontResources } from "./p1.4-support.ts";
import { buildP33ADirectionFixture } from "./p3.3a-support.ts";
import { FONT_LIBRARY, WORKSPACE } from "./support.ts";

const productFamilies: readonly ProceduralAssetRequest["family"][] = [
  "GENERIC_SMARTPHONE_FRAME",
  "APP_SCREEN",
  "DASHBOARD",
  "DATA_CHART",
];
const productPresentation = Object.freeze([
  {
    headline: "VOS PRIORITÉS. UN SEUL ESPACE.",
    title: "AUJOURD’HUI",
    label: "VUE D’ENSEMBLE",
    value: "08:42",
  },
  {
    headline: "CE QUI COMPTE, TOUT DE SUITE.",
    title: "PRIORITÉS",
    label: "À TRAITER",
    value: "12",
  },
  {
    headline: "CHAQUE PROJET. TOUJOURS LISIBLE.",
    title: "PROGRESSION",
    label: "CETTE SEMAINE",
    value: "72%",
  },
  {
    headline: "LA PROGRESSION DEVIENT ÉVIDENTE.",
    title: "IMPACT",
    label: "TEMPS GAGNÉ",
    value: "+18%",
  },
  {
    headline: "UNE JOURNÉE PLUS SIMPLE.",
    title: "RÉSULTAT",
    label: "FLUIDITÉ",
    value: "100%",
  },
] as const);

function variant(
  family: ProceduralAssetRequest["family"],
): ProceduralAssetRequest["variant"] {
  if (family === "GENERIC_SMARTPHONE_FRAME") return "PHONE";
  if (family === "APP_SCREEN") return "FEATURE";
  if (family === "DASHBOARD") return "CHART";
  return "LINE";
}

function material(
  family: ProceduralAssetRequest["family"],
): ProceduralAssetRequest["material"] {
  if (family === "GENERIC_SMARTPHONE_FRAME") return "SOFT_SHADOW";
  if (family === "APP_SCREEN") return "GLASS_LIKE_SIMPLIFIED";
  if (family === "DASHBOARD") return "GRADIENT_LAYERED";
  return "BORDERED";
}

export function p336Style(): ResolvedStyle {
  const loaded = loadStyleFile(
    path.join(WORKSPACE, "fixtures", "p3.3.6", "precision-product.style.json"),
    FONT_LIBRARY,
  );
  const resolved = resolveStyle({ style: loaded });
  if (!resolved.ok)
    throw new Error(
      `Style P3.3.6 invalide : ${JSON.stringify(resolved.issues)}`,
    );
  return resolved.value;
}

export interface P336Pipeline {
  readonly creative_plan: CreativePlan;
  readonly direction_compile: VisualDirectionCompileResult;
  readonly base_asset_plans: readonly ProceduralAssetPlan[];
  readonly design_resolutions: readonly PremiumDesignResolution[];
  readonly premium_design_plans: readonly PremiumDesignPlan[];
  readonly design_preflights: readonly PremiumDesignPreflightReport[];
  readonly decision_traces: readonly DesignDecisionTrace[];
  readonly procedural_asset_plans: readonly ProceduralAssetPlan[];
  readonly asset_preflights: readonly ProceduralAssetPreflightReport[];
  readonly asset_diversity: AssetDiversityReport;
  readonly design_system_report: ReturnType<
    typeof buildPremiumDesignSystemReport
  >;
  readonly visual_plan: VisualPlan;
  readonly visual_compile: VisualCompileResult;
  readonly p1: CompilerPipelineResult;
  readonly style: ResolvedStyle;
  readonly diversity: ReturnType<typeof buildVisualDiversityReport>;
  readonly hashes: {
    readonly premium_design: readonly string[];
    readonly procedural_assets: readonly string[];
  };
}

export interface P336CompileMetrics {
  readonly base_asset_resolution_ms: number;
  readonly premium_design_resolution_ms: number;
  readonly director_and_visual_plan_ms: number;
  readonly visual_plan_to_motion_spec_ms: number;
  readonly p1_compile_ms: number;
  readonly total_compile_ms: number;
}

export function profileP336Pipeline(renderScale = 0.5): {
  pipeline: P336Pipeline;
  metrics: P336CompileMetrics;
} {
  const totalStarted = performance.now();
  const fixture = buildP33ADirectionFixture("product");
  const basePlans: ProceduralAssetPlan[] = [];
  const resolutions: PremiumDesignResolution[] = [];
  let baseAssetMs = 0;
  let designMs = 0;
  const directorStarted = performance.now();
  const directionCompile = compileVisualDirectionPlan(
    fixture.direction_plan,
    fixture.creative_plan,
    fixture.context,
    {
      visual_plan_version: "0.3.0",
      visual_grammar_version: "0.3.0",
      resolve_scene_presentation: ({ scene_index }) => ({
        display_text:
          productPresentation[scene_index]?.headline ??
          "UN PRODUIT. UNE DIRECTION CLAIRE.",
        text_role: scene_index === 4 ? "HEADLINE" : "SUBHEAD",
        text_region: scene_index === 0 ? "left" : "top",
        text_align: scene_index === 0 ? "start" : "center",
        asset_led: scene_index < 4,
      }),
      resolve_asset_entities: ({
        asset_intent,
        source_scene,
        scene_direction,
        direction_plan,
        composition_root_id,
      }) => {
        const sceneAssetIndex = scene_direction.asset_intents
          .filter((entry) => entry.availability === "AVAILABLE")
          .findIndex((entry) => entry.id === asset_intent.id);
        const scenePosition = direction_plan.scenes.findIndex(
          (entry) => entry.id === scene_direction.id,
        );
        const globalIndex =
          direction_plan.scenes
            .slice(0, scenePosition)
            .reduce(
              (sum, entry) =>
                sum +
                entry.asset_intents.filter(
                  (asset) => asset.availability === "AVAILABLE",
                ).length,
              0,
            ) + Math.max(0, sceneAssetIndex);
        const family = productFamilies[globalIndex] ?? "UI_CARD";
        const copy = productPresentation[globalIndex] ?? productPresentation[4];
        const request: ProceduralAssetRequest = {
          request_id: `${asset_intent.id}_procedural`,
          source_asset_intent_id: asset_intent.id,
          direction_plan_id: direction_plan.direction_plan_id,
          scene_id: source_scene.id,
          family,
          variant: variant(family),
          semantic_role: asset_intent.role.toLowerCase(),
          language: family === "DATA_CHART" ? "DATA" : "UI",
          system_identity: "PRODUCT_POLISHED",
          material_language: "SOFT_DIMENSIONAL",
          material: material(family),
          density:
            scene_direction.visual_density === "SPARSE"
              ? "SPACIOUS"
              : scene_direction.visual_density === "DENSE"
                ? "COMPACT"
                : "BALANCED",
          emphasis:
            asset_intent.role === "DEVICE_FRAME" || asset_intent.role === "HERO"
              ? "PRIMARY"
              : "SECONDARY",
          choreography: family === "DATA_CHART" ? "DATA_HERO" : "PRODUCT_HERO",
          persistent: true,
          seed: 3360 + globalIndex * 101,
          copy: { title: copy.title, label: copy.label, value: copy.value },
          data: [0.22, 0.48, 0.37, 0.69, 0.82, 0.76],
        };
        const baseStarted = performance.now();
        const basePlan = resolveProceduralAssetRequest(request);
        baseAssetMs += performance.now() - baseStarted;
        basePlans.push(basePlan);
        const designStarted = performance.now();
        const resolution = resolvePremiumDesign(basePlan, request, {
          selection_id: `premium_selection_${globalIndex}`,
          recipe: { id: "CLEAN_PRODUCT", version: "1.0.0" },
          density: globalIndex === 2 ? "RICH" : "BALANCED",
          hierarchy: globalIndex === 3 ? "DRAMATIC" : "CLEAR",
          canvas: "9:16",
          style_id: "precision_product",
        });
        designMs += performance.now() - designStarted;
        resolutions.push(resolution);
        if (!resolution.preflight.eligible_for_render)
          throw new Error(
            `design.preflight.failed:${JSON.stringify(resolution.preflight.diagnostics)}`,
          );
        const compiled = compileProceduralAssetPlan(
          resolution.designed_asset_plan,
          composition_root_id,
        );
        if (!compiled.ok)
          throw new Error(
            `asset.compile.failed:${JSON.stringify(compiled.preflight.diagnostics)}`,
          );
        return compiled.entities;
      },
    },
  );
  const directorMs = performance.now() - directorStarted;
  if (!directionCompile.ok || !directionCompile.visual_plan)
    throw new Error(
      `Direction P3.3.6 invalide: ${JSON.stringify(directionCompile.direction_preflight.diagnostics)} / ${JSON.stringify(directionCompile.visual_preflight?.diagnostics)}`,
    );
  const style = p336Style();
  const visualStarted = performance.now();
  const visualCompile = compileVisualPlan(directionCompile.visual_plan, {
    resolved_style: style,
    pattern: pattern(),
    target_platform: "shorts",
    asset_refs: new Set(),
  });
  const visualMs = performance.now() - visualStarted;
  if (!visualCompile.ok || !visualCompile.motion_spec)
    throw new Error(
      `VisualPlan P3.3.6 invalide: ${JSON.stringify(visualCompile.diagnostics)}`,
    );
  const p1Started = performance.now();
  const p1 = compilePipeline({
    spec: visualCompile.motion_spec,
    resolvedStyle: style,
    platformPresets: platforms(),
    pattern: pattern(),
    fontResources: p14FontResources(style),
    assetResources: {},
    behaviorRegistry: P17_BEHAVIOR_REGISTRY,
    config: {
      fps: 30,
      render_scale: renderScale,
      minimum_readable_size: renderScale === 1 ? 20 : 10,
    },
  });
  const p1Ms = performance.now() - p1Started;
  const plans = resolutions.map((entry) => entry.designed_asset_plan);
  const designPlans = resolutions.map((entry) => entry.design_plan);
  return {
    pipeline: {
      creative_plan: fixture.creative_plan,
      direction_compile: directionCompile,
      base_asset_plans: basePlans,
      design_resolutions: resolutions,
      premium_design_plans: designPlans,
      design_preflights: resolutions.map((entry) => entry.preflight),
      decision_traces: resolutions.map((entry) => entry.decision_trace),
      procedural_asset_plans: plans,
      asset_preflights: plans.map(buildProceduralAssetPreflight),
      asset_diversity: buildAssetDiversityReport(plans),
      design_system_report: buildPremiumDesignSystemReport(designPlans),
      visual_plan: directionCompile.visual_plan,
      visual_compile: visualCompile,
      p1,
      style,
      diversity: buildVisualDiversityReport(directionCompile.visual_plan),
      hashes: {
        premium_design: designPlans.map(hashPremiumDesignPlan),
        procedural_assets: plans.map(hashProceduralAssetPlan),
      },
    },
    metrics: {
      base_asset_resolution_ms: baseAssetMs,
      premium_design_resolution_ms: designMs,
      director_and_visual_plan_ms: directorMs,
      visual_plan_to_motion_spec_ms: visualMs,
      p1_compile_ms: p1Ms,
      total_compile_ms: performance.now() - totalStarted,
    },
  };
}

export function buildP336Pipeline(renderScale = 0.5): P336Pipeline {
  return profileP336Pipeline(renderScale).pipeline;
}
