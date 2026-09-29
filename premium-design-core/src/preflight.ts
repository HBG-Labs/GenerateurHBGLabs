import {
  ProceduralAssetPlanSchema,
  type ProceduralAssetPlan,
} from "@motion-engine/procedural-asset-core";
import { hashVisualDocument } from "@motion-engine/visual-core";

import { PREMIUM_DESIGN_LIMITS } from "./limits.ts";
import {
  PremiumDesignPlanSchema,
  PremiumDesignPreflightReportSchema,
  type DesignDiagnostic,
  type PremiumDesignPlan,
  type PremiumDesignPreflightReport,
} from "./contracts.ts";
import {
  DESIGN_RECIPE_REGISTRY,
  PREMIUM_DESIGN_SYSTEM_FINGERPRINT,
} from "./registry.ts";

function issue(
  code: string,
  severity: DesignDiagnostic["severity"],
  property: string,
  actual: string,
  expected: string,
  correction: DesignDiagnostic["suggested_correction_class"],
  assetId: string | null = null,
  componentId: string | null = null,
  path = "$",
): DesignDiagnostic {
  return {
    code,
    severity,
    path,
    asset_id: assetId,
    component_id: componentId,
    property,
    expected_constraint: expected,
    actual_state: actual,
    suggested_correction_class: correction,
  };
}

function hostileScan(value: unknown): string | null {
  const seen = new Set<object>();
  const visit = (entry: unknown, depth: number): string | null => {
    if (depth > PREMIUM_DESIGN_LIMITS.max_design_payload_depth)
      return "design.security.excessive_payload_depth";
    if (entry === null || typeof entry !== "object")
      return typeof entry === "string" &&
        entry.length > PREMIUM_DESIGN_LIMITS.max_design_string_length
        ? "design.security.oversized_string"
        : null;
    if (seen.has(entry)) return "design.security.cyclic_payload";
    seen.add(entry);
    if (Array.isArray(entry) && entry.length > 512)
      return "design.security.oversized_array";
    for (const [key, nested] of Object.entries(entry)) {
      if (["__proto__", "prototype", "constructor"].includes(key))
        return "design.security.prototype_pollution";
      if (
        [
          "code",
          "script",
          "jsx",
          "css",
          "svg",
          "url",
          "filesystem_path",
          "command",
          "shader",
          "html",
        ].includes(key.toLowerCase())
      )
        return "design.security.executable_or_external_field";
      const found = visit(nested, depth + 1);
      if (found) return found;
    }
    seen.delete(entry);
    return null;
  };
  return visit(value, 0);
}

export function buildPremiumDesignPreflight(
  candidate: unknown,
  assetCandidate: unknown,
): PremiumDesignPreflightReport {
  const diagnostics: DesignDiagnostic[] = [];
  const hostile = hostileScan(candidate) ?? hostileScan(assetCandidate);
  if (hostile)
    diagnostics.push(
      issue(
        hostile,
        "error",
        "payload",
        "unsafe",
        "data-only bounded payload",
        "SECURITY",
      ),
    );
  const parsed = hostile ? null : PremiumDesignPlanSchema.safeParse(candidate);
  if (parsed && !parsed.success)
    for (const entry of parsed.error.issues.slice(0, 64))
      diagnostics.push(
        issue(
          "design.schema.invalid",
          "error",
          entry.path.join("."),
          entry.message,
          "PremiumDesignPlan 0.1.0 strict",
          "LIMIT",
          null,
          null,
          `$.${entry.path.join(".")}`,
        ),
      );
  const assetParsed = hostile
    ? null
    : ProceduralAssetPlanSchema.safeParse(assetCandidate);
  if (assetParsed && !assetParsed.success)
    for (const entry of assetParsed.error.issues.slice(0, 64))
      diagnostics.push(
        issue(
          "design.asset_plan.invalid",
          "error",
          entry.path.join("."),
          entry.message,
          "valid designed ProceduralAssetPlan",
          "LIMIT",
          null,
          null,
          `$.designed_asset.${entry.path.join(".")}`,
        ),
      );
  const plan: PremiumDesignPlan | null = parsed?.success ? parsed.data : null;
  const assetPlan: ProceduralAssetPlan | null = assetParsed?.success
    ? assetParsed.data
    : null;
  const checks = {
    schema: plan !== null && assetPlan !== null,
    registry: true,
    spacing: true,
    hierarchy: true,
    typography: true,
    surfaces: true,
    iconography: true,
    charts: true,
    composition: true,
    limits: true,
    security: hostile === null,
  };
  if (plan && assetPlan) {
    const recipe = DESIGN_RECIPE_REGISTRY.get(plan.selection.recipe.id);
    if (
      !recipe ||
      recipe.version !== plan.selection.recipe.version ||
      plan.registry_fingerprints.system !== PREMIUM_DESIGN_SYSTEM_FINGERPRINT
    ) {
      diagnostics.push(
        issue(
          "design.registry.mismatch",
          "error",
          "recipe",
          `${plan.selection.recipe.id}@${plan.selection.recipe.version}`,
          "active recipe and fingerprint",
          "LIMIT",
        ),
      );
      checks.registry = false;
    }
    if (!(
      plan.tokens.spacing.xs < plan.tokens.spacing.sm &&
      plan.tokens.spacing.sm < plan.tokens.spacing.md &&
      plan.tokens.spacing.md < plan.tokens.spacing.lg &&
      plan.tokens.spacing.lg < plan.tokens.spacing.xl
    )) {
      diagnostics.push(
        issue(
          "design.spacing.non_monotonic",
          "error",
          "spacing",
          JSON.stringify(plan.tokens.spacing),
          "strict ascending scale",
          "SPACING",
        ),
      );
      checks.spacing = false;
    }
    if (plan.decisions.length > PREMIUM_DESIGN_LIMITS.max_decisions) {
      diagnostics.push(
        issue(
          "design.limits.decisions",
          "error",
          "decisions",
          String(plan.decisions.length),
          `<=${PREMIUM_DESIGN_LIMITS.max_decisions}`,
          "LIMIT",
        ),
      );
      checks.limits = false;
    }
    for (const asset of assetPlan.assets) {
      if (
        asset.components.length >
        PREMIUM_DESIGN_LIMITS.max_designed_components_per_asset
      ) {
        diagnostics.push(
          issue(
            "design.limits.components",
            "error",
            "components",
            String(asset.components.length),
            `<=${PREMIUM_DESIGN_LIMITS.max_designed_components_per_asset}`,
            "LIMIT",
            asset.asset_id,
          ),
        );
        checks.limits = false;
      }
      const primaries = asset.components.filter(
        (entry) => entry.emphasis === "PRIMARY" && entry.focusable,
      );
      if (primaries.length === 0) {
        diagnostics.push(
          issue(
            "design.hierarchy.no_primary_focus",
            "error",
            "emphasis",
            "0 primary focus",
            "at least one primary focus",
            "HIERARCHY",
            asset.asset_id,
          ),
        );
        checks.hierarchy = false;
      }
      if (primaries.length > 6) {
        diagnostics.push(
          issue(
            "design.hierarchy.competing_primary",
            "warning",
            "emphasis",
            `${primaries.length} primary focusables`,
            "<=6 structured primary targets",
            "HIERARCHY",
            asset.asset_id,
          ),
        );
      }
      const decorativePrimary = asset.components.filter(
        (entry) => entry.decorative && entry.emphasis === "PRIMARY",
      );
      if (decorativePrimary.length > 0) {
        diagnostics.push(
          issue(
            "design.hierarchy.decorative_dominance",
            "error",
            "decorative",
            String(decorativePrimary.length),
            "0 decorative PRIMARY components",
            "HIERARCHY",
            asset.asset_id,
          ),
        );
        checks.hierarchy = false;
      }
      const icons = asset.components.filter((entry) =>
        entry.semantic_role.startsWith("icon_"),
      );
      if (icons.length > PREMIUM_DESIGN_LIMITS.max_icons_per_asset) {
        diagnostics.push(
          issue(
            "design.limits.icons",
            "error",
            "icons",
            String(icons.length),
            `<=${PREMIUM_DESIGN_LIMITS.max_icons_per_asset}`,
            "ICONOGRAPHY",
            asset.asset_id,
          ),
        );
        checks.iconography = false;
        checks.limits = false;
      }
      const gridLines = asset.components.filter(
        (entry) => entry.semantic_role === "chart_grid",
      );
      if (gridLines.length > PREMIUM_DESIGN_LIMITS.max_chart_grid_lines) {
        diagnostics.push(
          issue(
            "design.chart.excessive_grid",
            "error",
            "chart_grid",
            String(gridLines.length),
            `<=${PREMIUM_DESIGN_LIMITS.max_chart_grid_lines}`,
            "CHART",
            asset.asset_id,
          ),
        );
        checks.charts = false;
      }
      const surfaceRoles = new Set(
        asset.components
          .filter((entry) =>
            /surface|elevation|field|halo|highlight/u.test(entry.semantic_role),
          )
          .map((entry) => entry.semantic_role),
      );
      if (surfaceRoles.size > 18) {
        diagnostics.push(
          issue(
            "design.surface.excessive_layers",
            "warning",
            "surfaces",
            String(surfaceRoles.size),
            "controlled surface hierarchy",
            "SURFACE",
            asset.asset_id,
          ),
        );
        checks.surfaces = false;
      }
      const textNodes = asset.components.filter(
        (entry) => entry.kind === "text",
      );
      if (textNodes.length > 12) {
        diagnostics.push(
          issue(
            "design.typography.excessive_density",
            "warning",
            "text_nodes",
            String(textNodes.length),
            "<=12 text nodes per asset",
            "TYPOGRAPHY",
            asset.asset_id,
          ),
        );
        checks.typography = false;
      }
      const details = asset.components.filter((entry) => entry.decorative);
      if (details.length > plan.tokens.detail.maximum_per_asset) {
        diagnostics.push(
          issue(
            "design.composition.detail_density",
            "warning",
            "decorative_components",
            String(details.length),
            `<=${plan.tokens.detail.maximum_per_asset}`,
            "COMPOSITION",
            asset.asset_id,
          ),
        );
        checks.composition = false;
      }
    }
  }
  const errors = diagnostics.filter(
    (entry) => entry.severity === "error",
  ).length;
  const warnings = diagnostics.filter(
    (entry) => entry.severity === "warning",
  ).length;
  return PremiumDesignPreflightReportSchema.parse({
    schema: "premium-design-preflight-report",
    schema_version: "0.1.0",
    status: errors > 0 ? "fail" : warnings > 0 ? "warn" : "pass",
    eligible_for_render: errors === 0,
    premium_design_plan_sha256: plan
      ? hashVisualDocument(PremiumDesignPlanSchema.parse(plan))
      : null,
    diagnostics,
    summary: {
      errors,
      warnings,
      infos: diagnostics.length - errors - warnings,
    },
    checks,
  });
}
