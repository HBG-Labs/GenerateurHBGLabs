import { describe, expect, it } from "vitest";

import {
  PREMIUM_DESIGN_LIMITS,
  PREMIUM_DESIGN_SYSTEM_FINGERPRINT,
  resolvePremiumDesign,
} from "@motion-engine/premium-design-core";
import { resolveProceduralAssetRequest } from "@motion-engine/procedural-asset-core";

import { buildP336Pipeline } from "./p3.3.6-support.ts";

describe("P3.3.6 — Premium Procedural Design System", () => {
  it("résout Product/App jusqu’au RenderPlan avec 0 ERROR", () => {
    const pipeline = buildP336Pipeline(0.25);
    expect(pipeline.premium_design_plans).toHaveLength(4);
    expect(
      pipeline.design_preflights.every((report) => report.summary.errors === 0),
    ).toBe(true);
    expect(
      pipeline.asset_preflights.every((report) => report.summary.errors === 0),
    ).toBe(true);
    expect(pipeline.visual_compile.preflight.summary.errors).toBe(0);
    expect(pipeline.p1.preflight.summary?.errors ?? 0).toBe(0);
    expect(pipeline.p1.render_plan.canvas).toMatchObject({
      width: 270,
      height: 480,
      fps: 30,
    });
  });

  it("enrichit plusieurs dimensions de design sans changer le vocabulaire motion", () => {
    const pipeline = buildP336Pipeline(0.25);
    const assets = pipeline.procedural_asset_plans.flatMap(
      (plan) => plan.assets,
    );
    expect(assets.every((asset) => asset.version === "2.0.0")).toBe(true);
    expect(
      assets.reduce((sum, asset) => sum + asset.components.length, 0),
    ).toBeGreaterThan(70);
    expect(
      assets
        .flatMap((asset) => asset.components)
        .filter((entry) => entry.semantic_role.startsWith("icon_")).length,
    ).toBeGreaterThan(5);
    expect(
      assets.some((asset) =>
        asset.components.some(
          (entry) => entry.semantic_role === "chart_series_primary",
        ),
      ),
    ).toBe(true);
    expect(
      assets.some((asset) =>
        asset.components.some(
          (entry) => entry.semantic_role === "workspace_elevation",
        ),
      ),
    ).toBe(true);
    expect(
      new Set(
        pipeline.premium_design_plans.flatMap((plan) =>
          plan.decisions.map((entry) => entry.category),
        ),
      ).size,
    ).toBeGreaterThanOrEqual(8);
  });

  it("publie des empreintes et respecte les limites mesurées", () => {
    const pipeline = buildP336Pipeline(0.25);
    expect(PREMIUM_DESIGN_SYSTEM_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/u);
    expect(
      Math.max(
        ...pipeline.procedural_asset_plans.flatMap((plan) =>
          plan.assets.map((asset) => asset.components.length),
        ),
      ),
    ).toBeLessThanOrEqual(
      PREMIUM_DESIGN_LIMITS.max_designed_components_per_asset,
    );
    expect(
      pipeline.hashes.premium_design.every((hash) =>
        /^[a-f0-9]{64}$/u.test(hash),
      ),
    ).toBe(true);
  });

  it("différencie deux DesignRecipes sur plusieurs dimensions", () => {
    const request = {
      request_id: "recipe_ab_request",
      source_asset_intent_id: "recipe_ab_intent",
      direction_plan_id: "recipe_ab_direction",
      scene_id: "recipe_ab_scene",
      family: "UI_CARD" as const,
      variant: "METRIC" as const,
      semantic_role: "ui_card",
      language: "UI" as const,
      system_identity: "PRODUCT_POLISHED" as const,
      material_language: "SOFT_DIMENSIONAL" as const,
      material: "SOFT_SHADOW" as const,
      density: "BALANCED" as const,
      emphasis: "PRIMARY" as const,
      choreography: "PRODUCT_HERO" as const,
      persistent: false,
      seed: 3366,
      copy: { title: "SYNTHÈSE", label: "PROGRESSION", value: "72%" },
      data: [0.2, 0.4, 0.7],
    };
    const base = resolveProceduralAssetRequest(request);
    const clean = resolvePremiumDesign(base, request, {
      selection_id: "selection_clean",
      recipe: { id: "CLEAN_PRODUCT", version: "1.0.0" },
      density: "BALANCED",
      hierarchy: "CLEAR",
      canvas: "9:16",
      style_id: "precision_product",
    });
    const data = resolvePremiumDesign(base, request, {
      selection_id: "selection_data",
      recipe: { id: "DATA_FOCUSED", version: "1.0.0" },
      density: "RICH",
      hierarchy: "CLEAR",
      canvas: "9:16",
      style_id: "precision_product",
    });
    expect(clean.design_plan.tokens.spacing).not.toEqual(
      data.design_plan.tokens.spacing,
    );
    expect(clean.design_plan.tokens.data).not.toEqual(
      data.design_plan.tokens.data,
    );
    expect(clean.design_plan.tokens.detail).not.toEqual(
      data.design_plan.tokens.detail,
    );
    expect(clean.design_plan.designed_asset_plan_sha256).not.toBe(
      data.design_plan.designed_asset_plan_sha256,
    );
    const structuralSignature = (resolution: typeof clean) =>
      resolution.designed_asset_plan.assets[0]!.components.map((entry) => ({
        role: entry.semantic_role,
        depth: entry.depth,
        scale: entry.transform.scale,
        x: entry.transform.translate_x,
        opacity: entry.surface.opacity,
        decorative: entry.decorative,
      }));
    expect(structuralSignature(clean)).not.toEqual(structuralSignature(data));
    expect(
      data.designed_asset_plan.assets[0]!.components.find(
        (entry) => entry.semantic_role === "chart_series_primary",
      )!.transform.scale,
    ).toBeGreaterThan(
      clean.designed_asset_plan.assets[0]!.components.find(
        (entry) => entry.semantic_role === "chart_series_primary",
      )!.transform.scale,
    );
  });
});
