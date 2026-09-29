import { hashVisualDocument } from "@motion-engine/visual-core";

import type { ResolvedDesignTokens } from "./contracts.ts";

const productTokens: ResolvedDesignTokens = {
  spacing: { xs: 6, sm: 12, md: 22, lg: 36, xl: 56 },
  radius: { xs: 4, sm: 10, md: 18, lg: 28, xl: 40 },
  border: { hairline: 1, emphasis: 2 },
  elevation: { flat: 0, raised: 0.18, floating: 0.3 },
  typography: { display_ratio: 2.8, body_ratio: 1, metadata_ratio: 0.66 },
  icon: { sm: 0.08, md: 0.13, lg: 0.19 },
  data: { grid_opacity: 0.13, primary_weight: 4, secondary_weight: 1.5 },
  detail: { maximum_per_asset: 14, opacity: 0.56 },
};

export const DESIGN_RECIPE_DEFINITIONS = Object.freeze([
  {
    id: "CLEAN_PRODUCT",
    version: "1.0.0",
    compatible_languages: ["UI", "DATA"],
    density: "BALANCED",
    hierarchy: "CLEAR",
    surface_character: "soft_layered",
    material_tendencies: ["SOFT_ELEVATION", "GLASS_EDGE_SIMPLIFIED"],
    icon_treatment: "rounded_outline",
    chart_treatment: "focal_series",
    cost: "MEDIUM",
    tokens: productTokens,
  },
  {
    id: "EDITORIAL_CONTRAST",
    version: "1.0.0",
    compatible_languages: ["EDITORIAL", "UI"],
    density: "RESTRAINED",
    hierarchy: "EDITORIAL",
    surface_character: "flat_selective",
    material_tendencies: ["MATTE_DEPTH"],
    icon_treatment: "minimal_outline",
    chart_treatment: "annotation_first",
    cost: "LOW",
    tokens: {
      ...productTokens,
      spacing: { xs: 8, sm: 16, md: 30, lg: 48, xl: 72 },
      radius: { xs: 2, sm: 4, md: 8, lg: 12, xl: 16 },
      detail: { maximum_per_asset: 7, opacity: 0.46 },
    },
  },
  {
    id: "DATA_FOCUSED",
    version: "1.0.0",
    compatible_languages: ["DATA", "UI"],
    density: "RICH",
    hierarchy: "CLEAR",
    surface_character: "precise_dense",
    material_tendencies: ["MATTE_DEPTH", "ACCENT_FIELD"],
    icon_treatment: "precise_outline",
    chart_treatment: "context_then_focus",
    cost: "MEDIUM",
    tokens: {
      ...productTokens,
      spacing: { xs: 5, sm: 10, md: 18, lg: 28, xl: 42 },
      data: { grid_opacity: 0.18, primary_weight: 5, secondary_weight: 1.25 },
      detail: { maximum_per_asset: 20, opacity: 0.62 },
    },
  },
  {
    id: "SPATIAL_TECH",
    version: "1.0.0",
    compatible_languages: ["PROCEDURAL_ENVIRONMENT", "UI", "DATA"],
    density: "BALANCED",
    hierarchy: "DRAMATIC",
    surface_character: "luminous_depth",
    material_tendencies: ["LAYERED_GRADIENT_SIMPLIFIED", "ACCENT_FIELD"],
    icon_treatment: "geometric_outline",
    chart_treatment: "spatial_focus",
    cost: "HIGH",
    tokens: {
      ...productTokens,
      elevation: { flat: 0, raised: 0.24, floating: 0.38 },
      radius: { xs: 6, sm: 14, md: 22, lg: 34, xl: 48 },
    },
  },
] as const);

export const PREMIUM_MATERIAL_DEFINITIONS = Object.freeze([
  {
    id: "MATTE_DEPTH",
    version: "1.0.0",
    support: "SUPPORTED",
    implementation: "layered_solid_surfaces",
    cost: "LOW",
  },
  {
    id: "LAYERED_GRADIENT_SIMPLIFIED",
    version: "1.0.0",
    support: "SIMPLIFIED",
    implementation: "overlapping_translucent_fields",
    cost: "LOW",
  },
  {
    id: "SOFT_ELEVATION",
    version: "1.0.0",
    support: "SUPPORTED",
    implementation: "bounded_offset_layers",
    cost: "LOW",
  },
  {
    id: "GLASS_EDGE_SIMPLIFIED",
    version: "1.0.0",
    support: "SIMPLIFIED",
    implementation: "translucent_surface_and_highlight",
    cost: "MEDIUM",
  },
  {
    id: "ACCENT_FIELD",
    version: "1.0.0",
    support: "SUPPORTED",
    implementation: "bounded_accent_layers",
    cost: "LOW",
  },
] as const);

export const PREMIUM_ICON_DEFINITIONS = Object.freeze(
  [
    "HOME",
    "GRID",
    "TASK",
    "CALENDAR",
    "CLOCK",
    "SEARCH",
    "BELL",
    "USER",
    "TEAM",
    "MESSAGE",
    "DOCUMENT",
    "FOLDER",
    "CHECK",
    "ARROW",
    "TREND",
    "CHART",
    "TARGET",
    "SPARK",
    "PIN",
    "FILTER",
  ].map((id) => ({
    id,
    version: "1.0.0",
    source: "internal_normalized_path",
    style: "rounded_outline",
  })),
);

export const CHART_LANGUAGE_DEFINITIONS = Object.freeze([
  {
    id: "FOCAL_LINE",
    version: "1.0.0",
    context: "minimal_grid",
    focus: "latest_value",
    labels: "selective",
  },
  {
    id: "METRIC_SPARK",
    version: "1.0.0",
    context: "none",
    focus: "trend",
    labels: "summary",
  },
  {
    id: "COMPARISON_BARS",
    version: "1.0.0",
    context: "baseline",
    focus: "selected_bar",
    labels: "direct",
  },
] as const);

export const DESIGN_RECIPE_REGISTRY = new Map(
  DESIGN_RECIPE_DEFINITIONS.map((entry) => [entry.id, entry]),
);
export const PREMIUM_DESIGN_FINGERPRINTS = Object.freeze({
  recipes: hashVisualDocument(DESIGN_RECIPE_DEFINITIONS),
  materials: hashVisualDocument(PREMIUM_MATERIAL_DEFINITIONS),
  icons: hashVisualDocument(PREMIUM_ICON_DEFINITIONS),
  charts: hashVisualDocument(CHART_LANGUAGE_DEFINITIONS),
});
export const PREMIUM_DESIGN_SYSTEM_FINGERPRINT = hashVisualDocument({
  version: "0.1.0",
  ...PREMIUM_DESIGN_FINGERPRINTS,
});
