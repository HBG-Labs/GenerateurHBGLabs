import { describe, expect, it } from "vitest";

import { resolveProceduralAssetRequest } from "@motion-engine/procedural-asset-core";

import { PremiumDesignPlanSchema } from "./contracts.ts";
import { PREMIUM_DESIGN_LIMITS } from "./limits.ts";
import { buildPremiumDesignPreflight } from "./preflight.ts";
import {
  DESIGN_RECIPE_REGISTRY,
  PREMIUM_DESIGN_SYSTEM_FINGERPRINT,
} from "./registry.ts";
import { hashPremiumDesignPlan, resolvePremiumDesign } from "./resolver.ts";

function fixture() {
  const request = {
    request_id: "design_test_request",
    source_asset_intent_id: "design_test_intent",
    direction_plan_id: "design_test_direction",
    scene_id: "design_test_scene",
    family: "DASHBOARD" as const,
    variant: "CHART" as const,
    semantic_role: "hero",
    language: "UI" as const,
    system_identity: "PRODUCT_POLISHED" as const,
    material_language: "SOFT_DIMENSIONAL" as const,
    material: "GRADIENT_LAYERED" as const,
    density: "BALANCED" as const,
    emphasis: "PRIMARY" as const,
    choreography: "PRODUCT_HERO" as const,
    persistent: true,
    seed: 3360,
    copy: { title: "PROGRESSION", label: "CETTE SEMAINE", value: "72%" },
    data: [0.2, 0.4, 0.3, 0.7, 0.82],
  };
  const base = resolveProceduralAssetRequest(request);
  return resolvePremiumDesign(base, request, {
    selection_id: "design_test_selection",
    recipe: { id: "CLEAN_PRODUCT", version: "1.0.0" },
    density: "BALANCED",
    hierarchy: "CLEAR",
    canvas: "9:16",
    style_id: "precision_product",
  });
}

describe("Premium Design Core", () => {
  it("résout un plan strict, versionné, préflighté et déterministe", () => {
    const first = fixture();
    const second = fixture();
    expect(first).toEqual(second);
    expect(first.preflight.eligible_for_render).toBe(true);
    expect(hashPremiumDesignPlan(first.design_plan)).toBe(
      hashPremiumDesignPlan(second.design_plan),
    );
    expect(first.design_plan.registry_fingerprints.system).toBe(
      PREMIUM_DESIGN_SYSTEM_FINGERPRINT,
    );
  });

  it("ferme les recipes et rejette les champs inconnus", () => {
    expect(DESIGN_RECIPE_REGISTRY.size).toBe(4);
    const plan = structuredClone(fixture().design_plan) as Record<
      string,
      unknown
    >;
    plan["unknown"] = true;
    expect(PremiumDesignPlanSchema.safeParse(plan).success).toBe(false);
  });

  it("refuse un payload hostile et un nombre de décisions au-dessus de la limite", () => {
    const result = fixture();
    const hostile = { ...result.design_plan, command: "run" };
    expect(
      buildPremiumDesignPreflight(
        hostile,
        result.designed_asset_plan,
      ).diagnostics.some(
        (entry) =>
          entry.code === "design.security.executable_or_external_field",
      ),
    ).toBe(true);
    const duplicated = Array.from(
      { length: PREMIUM_DESIGN_LIMITS.max_decisions + 1 },
      (_, index) => ({
        ...result.design_plan.decisions[0]!,
        id: `decision_limit_${index}`,
      }),
    );
    const over = { ...result.design_plan, decisions: duplicated };
    const report = buildPremiumDesignPreflight(
      over,
      result.designed_asset_plan,
    );
    expect(report.eligible_for_render).toBe(false);
  });

  it("accepte exactement la limite critique de décisions au niveau du contrat", () => {
    const result = fixture();
    const item = result.design_plan.decisions[0]!;
    const atLimit = {
      ...result.design_plan,
      decisions: Array.from(
        { length: PREMIUM_DESIGN_LIMITS.max_decisions },
        (_, index) => ({ ...item, id: `decision_exact_${index}` }),
      ),
    };
    expect(PremiumDesignPlanSchema.safeParse(atLimit).success).toBe(true);
  });

  it("refuse les nombres non finis et les chaînes exécutables", () => {
    const result = fixture();
    expect(
      PremiumDesignPlanSchema.safeParse({
        ...result.design_plan,
        tokens: {
          ...result.design_plan.tokens,
          spacing: { ...result.design_plan.tokens.spacing, md: Number.NaN },
        },
      }).success,
    ).toBe(false);
    expect(
      buildPremiumDesignPreflight(
        { ...result.design_plan, svg: "<script />" },
        result.designed_asset_plan,
      ).eligible_for_render,
    ).toBe(false);
  });
});
