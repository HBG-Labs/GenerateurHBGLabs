import type { PremiumDesignPlan } from "./contracts.ts";

export interface PremiumDesignSystemReport {
  readonly schema: "premium-design-system-report";
  readonly schema_version: "0.1.0";
  readonly design_plan_ids: readonly string[];
  readonly recipes: readonly string[];
  readonly spacing_scales: readonly string[];
  readonly materials: readonly string[];
  readonly icon_roles: readonly string[];
  readonly chart_languages: readonly string[];
  readonly surface_levels: readonly string[];
  readonly decision_counts: Readonly<Record<string, number>>;
}

export function buildPremiumDesignSystemReport(
  plans: readonly PremiumDesignPlan[],
): PremiumDesignSystemReport {
  const counts: Record<string, number> = {};
  for (const decision of plans.flatMap((plan) => plan.decisions))
    counts[decision.category] = (counts[decision.category] ?? 0) + 1;
  return {
    schema: "premium-design-system-report",
    schema_version: "0.1.0",
    design_plan_ids: plans.map((plan) => plan.design_plan_id),
    recipes: [...new Set(plans.map((plan) => plan.selection.recipe.id))].sort(),
    spacing_scales: ["xs", "sm", "md", "lg", "xl"],
    materials: [
      "MATTE_DEPTH",
      "LAYERED_GRADIENT_SIMPLIFIED",
      "SOFT_ELEVATION",
      "GLASS_EDGE_SIMPLIFIED",
      "ACCENT_FIELD",
    ],
    icon_roles: [
      "navigation",
      "status",
      "analytics",
      "communication",
      "productivity",
      "time",
      "document",
      "team",
    ],
    chart_languages: ["FOCAL_LINE", "METRIC_SPARK", "COMPARISON_BARS"],
    surface_levels: [
      "BACKGROUND",
      "SURFACE_1",
      "SURFACE_2",
      "FLOATING",
      "FOCAL",
    ],
    decision_counts: counts,
  };
}
