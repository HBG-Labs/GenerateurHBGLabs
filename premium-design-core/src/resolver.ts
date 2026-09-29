import {
  ProceduralAssetPlanSchema,
  ProceduralAssetRequestSchema,
  hashProceduralAssetPlan,
  type ProceduralAsset,
  type ProceduralAssetPlan,
  type ProceduralAssetRequest,
  type ProceduralComponent,
} from "@motion-engine/procedural-asset-core";
import { hashVisualDocument, visualStableId } from "@motion-engine/visual-core";

import {
  DesignDecisionTraceSchema,
  PREMIUM_DESIGN_PLAN_VERSION,
  PREMIUM_DESIGN_SYSTEM_VERSION,
  PremiumDesignPlanSchema,
  PremiumDesignSelectionSchema,
  ResolvedDesignTokensSchema,
  type DesignDecision,
  type DesignDecisionTrace,
  type PremiumDesignPlan,
  type PremiumDesignSelection,
  type PremiumIconId,
  type ResolvedDesignTokens,
} from "./contracts.ts";
import { buildPremiumDesignPreflight } from "./preflight.ts";
import {
  DESIGN_RECIPE_REGISTRY,
  PREMIUM_DESIGN_FINGERPRINTS,
  PREMIUM_DESIGN_SYSTEM_FINGERPRINT,
} from "./registry.ts";

const baseTransform = {
  scale: 1,
  rotate_deg: 0,
  translate_x: 0,
  translate_y: 0,
} as const;
const baseStyle = {
  fill: "muted",
  stroke: "foreground",
  text: "foreground",
} as const;
type IconId = PremiumIconId;

type ComponentOptions = {
  readonly hierarchy?: ProceduralComponent["hierarchy"];
  readonly region?: ProceduralComponent["region"];
  readonly emphasis?: ProceduralComponent["emphasis"];
  readonly focusable?: boolean;
  readonly decorative?: boolean;
  readonly group_key?: string | null;
  readonly motion_order?: number;
  readonly depth?: ProceduralComponent["depth"];
  readonly style?: ProceduralComponent["style"];
  readonly surface?: ProceduralComponent["surface"];
  readonly transform?: ProceduralComponent["transform"];
  readonly text?: ProceduralComponent["text"];
  readonly shape?: ProceduralComponent["shape"];
  readonly path?: ProceduralComponent["path"];
  readonly mask?: ProceduralComponent["mask"];
  readonly icon_id?: ProceduralComponent["icon_id"];
  readonly affordances?: ProceduralComponent["affordances"];
};

function component(
  assetId: string,
  local: string,
  parentId: string | null,
  role: string,
  kind: ProceduralComponent["kind"],
  options: ComponentOptions = {},
): ProceduralComponent {
  return {
    id: visualStableId("premium_component", { asset: assetId, local }),
    parent_id: parentId,
    semantic_role: role,
    kind,
    hierarchy: options.hierarchy ?? "SUPPORT",
    region: options.region ?? "center",
    emphasis: options.emphasis ?? "SUPPORTING",
    focusable: options.focusable ?? false,
    decorative: options.decorative ?? false,
    group_key: options.group_key ?? null,
    motion_order: options.motion_order ?? 0,
    depth: options.depth ?? "MIDGROUND",
    style: options.style ?? baseStyle,
    surface: options.surface ?? { opacity: 1, radius: "none", stroke: "none" },
    transform: options.transform ?? baseTransform,
    text: options.text ?? null,
    shape: options.shape ?? null,
    path: options.path ?? null,
    mask: options.mask ?? null,
    icon_id: options.icon_id ?? null,
    affordances: options.affordances ?? [],
  };
}

function group(
  assetId: string,
  local: string,
  parentId: string | null,
  role: string,
  region: ProceduralComponent["region"],
  order: number,
  options: ComponentOptions = {},
): ProceduralComponent {
  return component(assetId, local, parentId, role, "group", {
    region,
    motion_order: order,
    group_key: visualStableId("premium_group", { asset: assetId, local }),
    affordances: ["ASSEMBLE"],
    ...options,
  });
}

function shape(
  assetId: string,
  local: string,
  parentId: string,
  role: string,
  region: ProceduralComponent["region"],
  order: number,
  options: ComponentOptions = {},
): ProceduralComponent {
  return component(assetId, local, parentId, role, "shape", {
    region,
    motion_order: order,
    shape: { kind: "rect" },
    affordances: ["ASSEMBLE"],
    ...options,
  });
}

function text(
  assetId: string,
  local: string,
  parentId: string,
  role: string,
  value: string,
  typeRole: NonNullable<ProceduralComponent["text"]>["role"],
  region: ProceduralComponent["region"],
  order: number,
  options: ComponentOptions = {},
): ProceduralComponent {
  return component(assetId, local, parentId, role, "text", {
    region,
    motion_order: order,
    hierarchy: options.hierarchy ?? "SECONDARY",
    emphasis: options.emphasis ?? "SUPPORTING",
    text: {
      value: value.slice(0, 120),
      role: typeRole,
      align: options.text?.align ?? "start",
    },
    style: options.style ?? {
      fill: "background",
      stroke: "accent",
      text: "foreground",
    },
    affordances: options.affordances ?? ["ASSEMBLE"],
    focusable: options.focusable ?? false,
    transform: options.transform ?? baseTransform,
    decorative: options.decorative ?? false,
    depth: options.depth ?? "MIDGROUND",
    group_key: options.group_key ?? null,
  });
}

function path(
  assetId: string,
  local: string,
  parentId: string,
  role: string,
  points: readonly { x: number; y: number }[],
  region: ProceduralComponent["region"],
  order: number,
  options: ComponentOptions = {},
): ProceduralComponent {
  return component(assetId, local, parentId, role, "path", {
    region,
    motion_order: order,
    path: { points: [...points], closed: false },
    affordances: ["ASSEMBLE", "DRAW"],
    ...options,
  });
}

const iconPoints: Readonly<
  Record<IconId, readonly { x: number; y: number }[]>
> = Object.freeze({
  HOME: [
    { x: 0.12, y: 0.52 },
    { x: 0.5, y: 0.18 },
    { x: 0.88, y: 0.52 },
    { x: 0.78, y: 0.52 },
    { x: 0.78, y: 0.84 },
    { x: 0.22, y: 0.84 },
    { x: 0.22, y: 0.52 },
  ],
  GRID: [
    { x: 0.18, y: 0.18 },
    { x: 0.42, y: 0.18 },
    { x: 0.42, y: 0.42 },
    { x: 0.18, y: 0.42 },
    { x: 0.18, y: 0.18 },
    { x: 0.58, y: 0.18 },
    { x: 0.82, y: 0.18 },
    { x: 0.82, y: 0.42 },
    { x: 0.58, y: 0.42 },
  ],
  TASK: [
    { x: 0.16, y: 0.26 },
    { x: 0.34, y: 0.44 },
    { x: 0.58, y: 0.18 },
    { x: 0.84, y: 0.18 },
    { x: 0.84, y: 0.82 },
    { x: 0.16, y: 0.82 },
    { x: 0.16, y: 0.26 },
  ],
  CALENDAR: [
    { x: 0.16, y: 0.26 },
    { x: 0.84, y: 0.26 },
    { x: 0.84, y: 0.84 },
    { x: 0.16, y: 0.84 },
    { x: 0.16, y: 0.26 },
    { x: 0.16, y: 0.42 },
    { x: 0.84, y: 0.42 },
  ],
  CLOCK: [
    { x: 0.5, y: 0.14 },
    { x: 0.78, y: 0.28 },
    { x: 0.86, y: 0.56 },
    { x: 0.72, y: 0.82 },
    { x: 0.42, y: 0.86 },
    { x: 0.16, y: 0.68 },
    { x: 0.14, y: 0.38 },
    { x: 0.34, y: 0.16 },
    { x: 0.5, y: 0.14 },
    { x: 0.5, y: 0.5 },
    { x: 0.7, y: 0.62 },
  ],
  SEARCH: [
    { x: 0.2, y: 0.38 },
    { x: 0.32, y: 0.18 },
    { x: 0.58, y: 0.18 },
    { x: 0.72, y: 0.38 },
    { x: 0.64, y: 0.62 },
    { x: 0.4, y: 0.7 },
    { x: 0.2, y: 0.56 },
    { x: 0.2, y: 0.38 },
    { x: 0.64, y: 0.62 },
    { x: 0.84, y: 0.84 },
  ],
  BELL: [
    { x: 0.24, y: 0.68 },
    { x: 0.32, y: 0.6 },
    { x: 0.32, y: 0.36 },
    { x: 0.5, y: 0.18 },
    { x: 0.68, y: 0.36 },
    { x: 0.68, y: 0.6 },
    { x: 0.76, y: 0.68 },
    { x: 0.24, y: 0.68 },
    { x: 0.44, y: 0.78 },
    { x: 0.56, y: 0.78 },
  ],
  USER: [
    { x: 0.5, y: 0.18 },
    { x: 0.64, y: 0.3 },
    { x: 0.5, y: 0.46 },
    { x: 0.36, y: 0.3 },
    { x: 0.5, y: 0.18 },
    { x: 0.22, y: 0.82 },
    { x: 0.78, y: 0.82 },
  ],
  TEAM: [
    { x: 0.34, y: 0.2 },
    { x: 0.5, y: 0.36 },
    { x: 0.34, y: 0.5 },
    { x: 0.18, y: 0.36 },
    { x: 0.34, y: 0.2 },
    { x: 0.56, y: 0.3 },
    { x: 0.72, y: 0.44 },
    { x: 0.56, y: 0.58 },
    { x: 0.18, y: 0.82 },
    { x: 0.82, y: 0.82 },
  ],
  MESSAGE: [
    { x: 0.16, y: 0.22 },
    { x: 0.84, y: 0.22 },
    { x: 0.84, y: 0.68 },
    { x: 0.48, y: 0.68 },
    { x: 0.3, y: 0.84 },
    { x: 0.3, y: 0.68 },
    { x: 0.16, y: 0.68 },
    { x: 0.16, y: 0.22 },
  ],
  DOCUMENT: [
    { x: 0.24, y: 0.14 },
    { x: 0.62, y: 0.14 },
    { x: 0.78, y: 0.3 },
    { x: 0.78, y: 0.86 },
    { x: 0.24, y: 0.86 },
    { x: 0.24, y: 0.14 },
    { x: 0.62, y: 0.14 },
    { x: 0.62, y: 0.3 },
    { x: 0.78, y: 0.3 },
  ],
  FOLDER: [
    { x: 0.14, y: 0.3 },
    { x: 0.4, y: 0.3 },
    { x: 0.5, y: 0.4 },
    { x: 0.86, y: 0.4 },
    { x: 0.78, y: 0.82 },
    { x: 0.18, y: 0.82 },
    { x: 0.14, y: 0.3 },
  ],
  CHECK: [
    { x: 0.16, y: 0.52 },
    { x: 0.4, y: 0.74 },
    { x: 0.84, y: 0.24 },
  ],
  ARROW: [
    { x: 0.14, y: 0.5 },
    { x: 0.84, y: 0.5 },
    { x: 0.62, y: 0.28 },
    { x: 0.84, y: 0.5 },
    { x: 0.62, y: 0.72 },
  ],
  TREND: [
    { x: 0.12, y: 0.74 },
    { x: 0.38, y: 0.5 },
    { x: 0.56, y: 0.62 },
    { x: 0.86, y: 0.22 },
    { x: 0.66, y: 0.24 },
    { x: 0.86, y: 0.22 },
    { x: 0.82, y: 0.42 },
  ],
  CHART: [
    { x: 0.16, y: 0.82 },
    { x: 0.16, y: 0.58 },
    { x: 0.34, y: 0.58 },
    { x: 0.34, y: 0.82 },
    { x: 0.48, y: 0.82 },
    { x: 0.48, y: 0.34 },
    { x: 0.66, y: 0.34 },
    { x: 0.66, y: 0.82 },
    { x: 0.8, y: 0.82 },
    { x: 0.8, y: 0.18 },
  ],
  TARGET: [
    { x: 0.5, y: 0.12 },
    { x: 0.78, y: 0.28 },
    { x: 0.88, y: 0.56 },
    { x: 0.7, y: 0.82 },
    { x: 0.38, y: 0.86 },
    { x: 0.14, y: 0.64 },
    { x: 0.16, y: 0.34 },
    { x: 0.5, y: 0.12 },
    { x: 0.5, y: 0.34 },
    { x: 0.62, y: 0.5 },
    { x: 0.5, y: 0.64 },
    { x: 0.36, y: 0.5 },
    { x: 0.5, y: 0.34 },
  ],
  SPARK: [
    { x: 0.5, y: 0.1 },
    { x: 0.6, y: 0.4 },
    { x: 0.9, y: 0.5 },
    { x: 0.6, y: 0.6 },
    { x: 0.5, y: 0.9 },
    { x: 0.4, y: 0.6 },
    { x: 0.1, y: 0.5 },
    { x: 0.4, y: 0.4 },
    { x: 0.5, y: 0.1 },
  ],
  PIN: [
    { x: 0.5, y: 0.14 },
    { x: 0.72, y: 0.3 },
    { x: 0.68, y: 0.56 },
    { x: 0.5, y: 0.86 },
    { x: 0.32, y: 0.56 },
    { x: 0.28, y: 0.3 },
    { x: 0.5, y: 0.14 },
  ],
  FILTER: [
    { x: 0.12, y: 0.22 },
    { x: 0.88, y: 0.22 },
    { x: 0.62, y: 0.5 },
    { x: 0.62, y: 0.78 },
    { x: 0.38, y: 0.88 },
    { x: 0.38, y: 0.5 },
    { x: 0.12, y: 0.22 },
  ],
});

function glyph(
  assetId: string,
  local: string,
  parentId: string,
  icon: IconId,
  region: ProceduralComponent["region"],
  order: number,
  scale = 0.12,
): ProceduralComponent {
  const legacy = [
    "GRID",
    "CLOCK",
    "BELL",
    "CHECK",
    "ARROW",
    "TREND",
    "SPARK",
  ].includes(icon)
    ? (icon as NonNullable<ProceduralComponent["icon_id"]>)
    : null;
  return path(
    assetId,
    local,
    parentId,
    `icon_${icon.toLowerCase()}`,
    iconPoints[icon],
    region,
    order,
    {
      hierarchy: "SECONDARY",
      emphasis: "SECONDARY",
      icon_id: legacy,
      transform: { ...baseTransform, scale },
      style: { fill: "background", stroke: "accent", text: "foreground" },
    },
  );
}

function root(assetId: string): ProceduralComponent {
  return group(
    assetId,
    "design_root",
    null,
    "premium_design_composition",
    "full",
    0,
    {
      hierarchy: "PRIMARY",
      emphasis: "PRIMARY",
      focusable: true,
      affordances: ["ASSEMBLE", "FOCUS", "CARRY", "REASSEMBLE"],
    },
  );
}

function ambience(assetId: string, rootId: string): ProceduralComponent[] {
  return [
    shape(assetId, "background_field", rootId, "background_field", "full", 0, {
      hierarchy: "BACKGROUND",
      depth: "BACKGROUND",
      surface: { opacity: 1, radius: "none", stroke: "none" },
      style: { fill: "background", stroke: "background", text: "foreground" },
    }),
    shape(assetId, "accent_field_a", rootId, "accent_light_field", "upper", 1, {
      shape: { kind: "ellipse" },
      decorative: true,
      hierarchy: "BACKGROUND",
      depth: "BACKGROUND",
      surface: { opacity: 0.1, radius: "xl", stroke: "none" },
      style: { fill: "accent", stroke: "accent", text: "foreground" },
      transform: {
        ...baseTransform,
        scale: 0.72,
        translate_x: 0.26,
        translate_y: -0.12,
      },
    }),
  ];
}

function metricCard(
  assetId: string,
  parentId: string,
  prefix: string,
  region: ProceduralComponent["region"],
  order: number,
  request: ProceduralAssetRequest,
  compact = false,
): ProceduralComponent[] {
  const id = visualStableId("premium_component", {
    asset: assetId,
    local: `${prefix}_group`,
  });
  const points = request.data
    .slice(0, 6)
    .map((value, index, values) => ({
      x: 0.08 + index * (0.84 / Math.max(1, values.length - 1)),
      y: 0.84 - value * 0.56,
    }));
  return [
    group(
      assetId,
      `${prefix}_group`,
      parentId,
      "metric_card_group",
      region,
      order,
      {
        hierarchy: "PRIMARY",
        emphasis: "PRIMARY",
        focusable: true,
        transform: { ...baseTransform, scale: compact ? 0.82 : 0.9 },
        affordances: ["ASSEMBLE", "FOCUS", "EXTRACT", "EXPAND", "CARRY"],
      },
    ),
    shape(assetId, `${prefix}_shadow`, id, "card_elevation", "full", order, {
      decorative: true,
      depth: "BACKGROUND",
      surface: { opacity: 0.22, radius: "lg", stroke: "none" },
      style: { fill: "background", stroke: "background", text: "foreground" },
      transform: {
        ...baseTransform,
        scale: 0.96,
        translate_x: 0.018,
        translate_y: 0.025,
      },
    }),
    shape(
      assetId,
      `${prefix}_surface`,
      id,
      "card_surface_focal",
      "full",
      order + 1,
      {
        hierarchy: "PRIMARY",
        surface: { opacity: 0.98, radius: "lg", stroke: "hairline" },
        style: { fill: "muted", stroke: "foreground", text: "foreground" },
      },
    ),
    text(
      assetId,
      `${prefix}_eyebrow`,
      id,
      "metric_context",
      request.copy.label || "APERÇU",
      "CAPTION",
      "top",
      order + 3,
      {
        transform: {
          ...baseTransform,
          scale: 0.58,
          translate_x: -0.16,
          translate_y: 0.05,
        },
      },
    ),
    text(
      assetId,
      `${prefix}_value`,
      id,
      "metric_value",
      request.copy.value || "72%",
      "DATA",
      "upper",
      order + 4,
      {
        hierarchy: "PRIMARY",
        emphasis: "PRIMARY",
        focusable: true,
        transform: {
          ...baseTransform,
          scale: compact ? 0.62 : 0.72,
          translate_x: -0.1,
          translate_y: 0.08,
        },
        affordances: ["ASSEMBLE", "FOCUS", "EXTRACT"],
      },
    ),
    path(
      assetId,
      `${prefix}_sparkline`,
      id,
      "metric_sparkline",
      points.length >= 2
        ? points
        : [
            { x: 0.08, y: 0.74 },
            { x: 0.92, y: 0.32 },
          ],
      "lower",
      order + 6,
      {
        emphasis: "SECONDARY",
        focusable: true,
        style: { fill: "background", stroke: "accent", text: "foreground" },
        transform: { ...baseTransform, scale: 0.82, translate_y: -0.08 },
        affordances: ["ASSEMBLE", "DRAW", "HIGHLIGHT", "EXTRACT_SERIES"],
      },
    ),
  ];
}

function smartphone(
  assetId: string,
  request: ProceduralAssetRequest,
): ProceduralComponent[] {
  const rootNode = root(assetId);
  const deviceId = visualStableId("premium_component", {
    asset: assetId,
    local: "device_group",
  });
  const screenId = visualStableId("premium_component", {
    asset: assetId,
    local: "screen_group",
  });
  const navId = visualStableId("premium_component", {
    asset: assetId,
    local: "bottom_nav_group",
  });
  return [
    rootNode,
    ...ambience(assetId, rootNode.id),
    group(assetId, "device_group", rootNode.id, "device_hero", "right", 4, {
      hierarchy: "PRIMARY",
      emphasis: "PRIMARY",
      focusable: true,
      transform: { ...baseTransform, scale: 0.82, translate_x: 0.02 },
      affordances: ["ASSEMBLE", "FOCUS", "CARRY", "REASSEMBLE"],
    }),
    shape(
      assetId,
      "device_shadow_far",
      deviceId,
      "device_shadow_far",
      "full",
      5,
      {
        decorative: true,
        depth: "BACKGROUND",
        surface: { opacity: 0.32, radius: "xl", stroke: "none" },
        style: { fill: "background", stroke: "background", text: "foreground" },
        transform: {
          ...baseTransform,
          scale: 0.94,
          translate_x: 0.035,
          translate_y: 0.04,
        },
      },
    ),
    shape(assetId, "device_body", deviceId, "device_body", "full", 6, {
      hierarchy: "PRIMARY",
      emphasis: "PRIMARY",
      focusable: true,
      surface: { opacity: 1, radius: "xl", stroke: "emphasis" },
      style: { fill: "muted", stroke: "foreground", text: "foreground" },
      transform: { ...baseTransform, scale: 0.92 },
      affordances: ["ASSEMBLE", "FOCUS", "CARRY", "REASSEMBLE"],
    }),
    group(assetId, "screen_group", deviceId, "app_screen", "full", 8, {
      hierarchy: "PRIMARY",
      emphasis: "PRIMARY",
      focusable: true,
      transform: { ...baseTransform, scale: 0.86 },
      affordances: ["ASSEMBLE", "FOCUS", "EXPAND", "EXTRACT"],
    }),
    shape(assetId, "screen_surface", screenId, "screen_surface", "full", 8, {
      hierarchy: "PRIMARY",
      surface: { opacity: 1, radius: "lg", stroke: "hairline" },
      style: { fill: "background", stroke: "muted", text: "foreground" },
    }),
    text(
      assetId,
      "screen_greeting",
      screenId,
      "screen_greeting",
      request.copy.title,
      "BODY",
      "upper",
      11,
      {
        hierarchy: "PRIMARY",
        emphasis: "PRIMARY",
        transform: {
          ...baseTransform,
          scale: 0.72,
          translate_x: -0.04,
          translate_y: 0.08,
        },
      },
    ),
    ...metricCard(
      assetId,
      screenId,
      "hero_metric",
      "center",
      12,
      request,
      true,
    ),
    group(
      assetId,
      "bottom_nav_group",
      screenId,
      "bottom_navigation",
      "bottom",
      22,
      { transform: { ...baseTransform, scale: 0.84, translate_y: 0.04 } },
    ),
    shape(
      assetId,
      "bottom_nav_surface",
      navId,
      "navigation_surface",
      "full",
      22,
      {
        surface: { opacity: 0.92, radius: "xl", stroke: "hairline" },
        style: { fill: "muted", stroke: "foreground", text: "foreground" },
        transform: { ...baseTransform, scale: 0.8 },
      },
    ),
    glyph(assetId, "nav_home", navId, "HOME", "left", 23, 0.11),
    glyph(assetId, "nav_user", navId, "USER", "right", 25, 0.1),
  ];
}

function appScreen(
  assetId: string,
  request: ProceduralAssetRequest,
): ProceduralComponent[] {
  const rootNode = root(assetId);
  const appId = visualStableId("premium_component", {
    asset: assetId,
    local: "workspace_group",
  });
  const sideId = visualStableId("premium_component", {
    asset: assetId,
    local: "sidebar_group",
  });
  const mainId = visualStableId("premium_component", {
    asset: assetId,
    local: "main_group",
  });
  return [
    rootNode,
    ...ambience(assetId, rootNode.id),
    group(
      assetId,
      "workspace_group",
      rootNode.id,
      "app_workspace",
      "center",
      4,
      {
        hierarchy: "PRIMARY",
        emphasis: "PRIMARY",
        focusable: true,
        transform: { ...baseTransform, scale: 0.92 },
        affordances: ["ASSEMBLE", "FOCUS", "EXPAND", "CARRY"],
      },
    ),
    shape(
      assetId,
      "workspace_shadow",
      appId,
      "workspace_elevation",
      "full",
      4,
      {
        decorative: true,
        depth: "BACKGROUND",
        surface: { opacity: 0.32, radius: "xl", stroke: "none" },
        style: { fill: "background", stroke: "background", text: "foreground" },
        transform: { ...baseTransform, scale: 0.96, translate_y: 0.04 },
      },
    ),
    shape(assetId, "workspace_surface", appId, "workspace_surface", "full", 5, {
      hierarchy: "PRIMARY",
      surface: { opacity: 0.99, radius: "xl", stroke: "hairline" },
      style: { fill: "background", stroke: "foreground", text: "foreground" },
    }),
    group(assetId, "sidebar_group", appId, "navigation_rail", "left", 6, {
      transform: { ...baseTransform, scale: 0.84, translate_x: -0.06 },
    }),
    shape(assetId, "sidebar_surface", sideId, "navigation_surface", "full", 6, {
      surface: { opacity: 0.9, radius: "lg", stroke: "hairline" },
      style: { fill: "muted", stroke: "foreground", text: "foreground" },
    }),
    glyph(assetId, "sidebar_logo", sideId, "SPARK", "top", 7, 0.12),
    glyph(assetId, "sidebar_tasks", sideId, "TASK", "center", 9, 0.1),
    glyph(assetId, "sidebar_user", sideId, "USER", "bottom", 11, 0.1),
    group(assetId, "main_group", appId, "primary_information", "right", 12, {
      hierarchy: "PRIMARY",
      emphasis: "PRIMARY",
      focusable: true,
      transform: { ...baseTransform, scale: 0.94, translate_x: 0.03 },
    }),
    text(
      assetId,
      "main_eyebrow",
      mainId,
      "screen_context",
      `${request.copy.label}  /  SYNTHÈSE`,
      "CAPTION",
      "top",
      12,
      { transform: { ...baseTransform, scale: 0.58, translate_x: -0.04 } },
    ),
    text(
      assetId,
      "main_title",
      mainId,
      "screen_title",
      request.copy.title,
      "SUBHEAD",
      "upper",
      13,
      {
        hierarchy: "PRIMARY",
        emphasis: "PRIMARY",
        focusable: true,
        transform: { ...baseTransform, scale: 0.66, translate_x: -0.02 },
      },
    ),
    ...metricCard(assetId, mainId, "focus_metric", "center", 14, request, true),
  ];
}

function dashboard(
  assetId: string,
  request: ProceduralAssetRequest,
): ProceduralComponent[] {
  const rootNode = root(assetId);
  const dashId = visualStableId("premium_component", {
    asset: assetId,
    local: "dashboard_group",
  });
  const chartId = visualStableId("premium_component", {
    asset: assetId,
    local: "chart_group",
  });
  const values =
    request.data.length >= 2
      ? request.data
      : [0.22, 0.48, 0.37, 0.69, 0.82, 0.76];
  const points = values.map((value, index) => ({
    x: 0.08 + index * (0.84 / Math.max(1, values.length - 1)),
    y: 0.84 - value * 0.62,
  }));
  return [
    rootNode,
    ...ambience(assetId, rootNode.id),
    group(
      assetId,
      "dashboard_group",
      rootNode.id,
      "analytics_dashboard",
      "center",
      4,
      {
        hierarchy: "PRIMARY",
        emphasis: "PRIMARY",
        focusable: true,
        transform: { ...baseTransform, scale: 0.92 },
        affordances: ["ASSEMBLE", "FOCUS", "EXPAND", "CARRY"],
      },
    ),
    shape(
      assetId,
      "dashboard_shadow",
      dashId,
      "dashboard_elevation",
      "full",
      4,
      {
        decorative: true,
        depth: "BACKGROUND",
        surface: { opacity: 0.32, radius: "xl", stroke: "none" },
        style: { fill: "background", stroke: "background", text: "foreground" },
        transform: { ...baseTransform, scale: 0.96, translate_y: 0.045 },
      },
    ),
    shape(
      assetId,
      "dashboard_surface",
      dashId,
      "dashboard_surface",
      "full",
      5,
      {
        hierarchy: "PRIMARY",
        surface: { opacity: 0.99, radius: "xl", stroke: "hairline" },
        style: { fill: "background", stroke: "foreground", text: "foreground" },
      },
    ),
    text(
      assetId,
      "dashboard_context",
      dashId,
      "dashboard_context",
      `${request.copy.label}  /  PÉRIODE`,
      "CAPTION",
      "top",
      6,
      { transform: { ...baseTransform, scale: 0.54, translate_x: -0.12 } },
    ),
    text(
      assetId,
      "dashboard_title",
      dashId,
      "dashboard_title",
      request.copy.title,
      "SUBHEAD",
      "upper",
      7,
      {
        hierarchy: "PRIMARY",
        emphasis: "PRIMARY",
        transform: { ...baseTransform, scale: 0.62, translate_x: -0.1 },
      },
    ),
    text(
      assetId,
      "dashboard_metric",
      dashId,
      "dashboard_metric",
      request.copy.value,
      "DATA",
      "left",
      8,
      {
        hierarchy: "PRIMARY",
        emphasis: "PRIMARY",
        focusable: true,
        transform: {
          ...baseTransform,
          scale: 0.58,
          translate_x: -0.1,
          translate_y: -0.04,
        },
        affordances: ["ASSEMBLE", "FOCUS", "EXTRACT"],
      },
    ),
    text(
      assetId,
      "dashboard_trend",
      dashId,
      "dashboard_trend",
      "+  PROGRESSION CONTINUE",
      "CAPTION",
      "left",
      9,
      {
        transform: {
          ...baseTransform,
          scale: 0.42,
          translate_x: -0.08,
          translate_y: 0.2,
        },
        style: { fill: "background", stroke: "accent", text: "accent" },
      },
    ),
    group(assetId, "chart_group", dashId, "chart_focus_group", "right", 10, {
      hierarchy: "PRIMARY",
      emphasis: "PRIMARY",
      focusable: true,
      transform: { ...baseTransform, scale: 0.9 },
      affordances: ["ASSEMBLE", "FOCUS", "EXTRACT", "EXPAND", "CARRY"],
    }),
    shape(
      assetId,
      "chart_surface",
      chartId,
      "chart_surface_focal",
      "full",
      10,
      {
        surface: { opacity: 0.94, radius: "lg", stroke: "hairline" },
        style: { fill: "muted", stroke: "foreground", text: "foreground" },
      },
    ),
    path(
      assetId,
      "grid_a",
      chartId,
      "chart_grid",
      [
        { x: 0.08, y: 0.3 },
        { x: 0.92, y: 0.3 },
      ],
      "full",
      11,
      {
        decorative: true,
        style: { fill: "background", stroke: "foreground", text: "foreground" },
        transform: { ...baseTransform, scale: 0.9 },
      },
    ),
    path(
      assetId,
      "grid_b",
      chartId,
      "chart_grid",
      [
        { x: 0.08, y: 0.55 },
        { x: 0.92, y: 0.55 },
      ],
      "full",
      12,
      {
        decorative: true,
        style: { fill: "background", stroke: "foreground", text: "foreground" },
        transform: { ...baseTransform, scale: 0.9 },
      },
    ),
    path(
      assetId,
      "grid_c",
      chartId,
      "chart_grid",
      [
        { x: 0.08, y: 0.8 },
        { x: 0.92, y: 0.8 },
      ],
      "full",
      13,
      {
        decorative: true,
        style: { fill: "background", stroke: "foreground", text: "foreground" },
        transform: { ...baseTransform, scale: 0.9 },
      },
    ),
    path(
      assetId,
      "primary_series",
      chartId,
      "chart_series_primary",
      points,
      "full",
      14,
      {
        hierarchy: "PRIMARY",
        emphasis: "PRIMARY",
        focusable: true,
        style: { fill: "background", stroke: "accent", text: "foreground" },
        transform: { ...baseTransform, scale: 0.9 },
        affordances: [
          "ASSEMBLE",
          "DRAW",
          "HIGHLIGHT",
          "EXTRACT_SERIES",
          "CARRY",
        ],
      },
    ),
    shape(assetId, "focus_point", chartId, "chart_focus_point", "right", 15, {
      shape: { kind: "ellipse" },
      hierarchy: "PRIMARY",
      emphasis: "PRIMARY",
      focusable: true,
      surface: { opacity: 1, radius: "xl", stroke: "emphasis" },
      style: { fill: "accent", stroke: "foreground", text: "foreground" },
      transform: { ...baseTransform, scale: 0.08, translate_y: -0.12 },
      affordances: ["ASSEMBLE", "FOCUS", "EXPAND", "CARRY"],
    }),
    text(
      assetId,
      "axis_left",
      chartId,
      "axis_label",
      "LUN",
      "CAPTION",
      "bottom",
      16,
      {
        decorative: true,
        transform: { ...baseTransform, scale: 0.34, translate_x: -0.24 },
      },
    ),
    text(
      assetId,
      "axis_right",
      chartId,
      "axis_label",
      "DIM",
      "CAPTION",
      "bottom",
      17,
      {
        decorative: true,
        transform: { ...baseTransform, scale: 0.34, translate_x: 0.24 },
      },
    ),
  ];
}

function dataChart(
  assetId: string,
  request: ProceduralAssetRequest,
): ProceduralComponent[] {
  const rootNode = root(assetId);
  const panelId = visualStableId("premium_component", {
    asset: assetId,
    local: "data_panel",
  });
  const values =
    request.data.length >= 2
      ? request.data
      : [0.22, 0.48, 0.37, 0.69, 0.82, 0.76];
  const points = values.map((value, index) => ({
    x: 0.08 + index * (0.84 / Math.max(1, values.length - 1)),
    y: 0.84 - value * 0.62,
  }));
  return [
    rootNode,
    ...ambience(assetId, rootNode.id),
    group(assetId, "data_panel", rootNode.id, "data_story_panel", "center", 4, {
      hierarchy: "PRIMARY",
      emphasis: "PRIMARY",
      focusable: true,
      transform: { ...baseTransform, scale: 0.9 },
      affordances: ["ASSEMBLE", "FOCUS", "EXPAND", "CARRY"],
    }),
    shape(assetId, "data_shadow", panelId, "data_elevation", "full", 4, {
      decorative: true,
      depth: "BACKGROUND",
      surface: { opacity: 0.3, radius: "xl", stroke: "none" },
      style: { fill: "background", stroke: "background", text: "foreground" },
      transform: { ...baseTransform, scale: 0.96, translate_y: 0.04 },
    }),
    shape(assetId, "data_surface", panelId, "data_surface", "full", 5, {
      surface: { opacity: 0.98, radius: "xl", stroke: "hairline" },
      style: { fill: "muted", stroke: "foreground", text: "foreground" },
    }),
    text(
      assetId,
      "data_eyebrow",
      panelId,
      "data_context",
      request.copy.label,
      "CAPTION",
      "top",
      6,
      { transform: { ...baseTransform, scale: 0.54, translate_x: -0.12 } },
    ),
    text(
      assetId,
      "data_value",
      panelId,
      "data_value",
      request.copy.value,
      "DATA",
      "upper",
      7,
      {
        hierarchy: "PRIMARY",
        emphasis: "PRIMARY",
        focusable: true,
        transform: { ...baseTransform, scale: 0.7, translate_x: -0.1 },
        affordances: ["ASSEMBLE", "FOCUS", "EXTRACT"],
      },
    ),
    text(
      assetId,
      "data_trend",
      panelId,
      "data_trend",
      "TENDANCE  /  OBJECTIF",
      "CAPTION",
      "upper",
      8,
      {
        transform: {
          ...baseTransform,
          scale: 0.44,
          translate_x: 0.18,
          translate_y: 0.2,
        },
        style: { fill: "background", stroke: "accent", text: "accent" },
      },
    ),
    path(
      assetId,
      "data_grid_a",
      panelId,
      "chart_grid",
      [
        { x: 0.08, y: 0.32 },
        { x: 0.92, y: 0.32 },
      ],
      "lower",
      9,
      {
        decorative: true,
        style: { fill: "background", stroke: "foreground", text: "foreground" },
      },
    ),
    path(
      assetId,
      "data_grid_b",
      panelId,
      "chart_grid",
      [
        { x: 0.08, y: 0.56 },
        { x: 0.92, y: 0.56 },
      ],
      "lower",
      10,
      {
        decorative: true,
        style: { fill: "background", stroke: "foreground", text: "foreground" },
      },
    ),
    path(
      assetId,
      "data_grid_c",
      panelId,
      "chart_grid",
      [
        { x: 0.08, y: 0.8 },
        { x: 0.92, y: 0.8 },
      ],
      "lower",
      11,
      {
        decorative: true,
        style: { fill: "background", stroke: "foreground", text: "foreground" },
      },
    ),
    path(
      assetId,
      "data_series",
      panelId,
      "chart_series_primary",
      points,
      "lower",
      12,
      {
        hierarchy: "PRIMARY",
        emphasis: "PRIMARY",
        focusable: true,
        style: { fill: "background", stroke: "accent", text: "foreground" },
        affordances: [
          "ASSEMBLE",
          "DRAW",
          "HIGHLIGHT",
          "EXTRACT_SERIES",
          "CARRY",
        ],
      },
    ),
    shape(assetId, "data_focus", panelId, "chart_focus_point", "right", 13, {
      shape: { kind: "ellipse" },
      hierarchy: "PRIMARY",
      emphasis: "PRIMARY",
      focusable: true,
      surface: { opacity: 1, radius: "xl", stroke: "emphasis" },
      style: { fill: "accent", stroke: "foreground", text: "foreground" },
      transform: { ...baseTransform, scale: 0.09, translate_y: 0.14 },
      affordances: ["ASSEMBLE", "FOCUS", "EXPAND", "CARRY"],
    }),
    glyph(assetId, "data_chart_icon", panelId, "CHART", "right", 14, 0.08),
    text(
      assetId,
      "data_footnote",
      panelId,
      "data_metadata",
      "DONNÉES DE DÉMONSTRATION",
      "CAPTION",
      "bottom",
      15,
      { decorative: true, transform: { ...baseTransform, scale: 0.38 } },
    ),
  ];
}

function componentsFor(
  assetId: string,
  request: ProceduralAssetRequest,
): ProceduralComponent[] {
  if (request.family === "GENERIC_SMARTPHONE_FRAME")
    return smartphone(assetId, request);
  if (request.family === "APP_SCREEN") return appScreen(assetId, request);
  if (request.family === "DASHBOARD") return dashboard(assetId, request);
  if (request.family === "DATA_CHART") return dataChart(assetId, request);
  return dataChart(assetId, request);
}

function applyDesignSelection(
  components: readonly ProceduralComponent[],
  selection: PremiumDesignSelection,
  tokens: ResolvedDesignTokens,
): ProceduralComponent[] {
  const filtered =
    selection.density === "RESTRAINED"
      ? components.filter(
          (entry) =>
            !entry.decorative || entry.semantic_role === "background_field",
        )
      : components;

  return filtered.map((entry) => {
    const isPrimary = entry.emphasis === "PRIMARY";
    const isChart =
      entry.semantic_role.includes("chart") ||
      entry.semantic_role.includes("metric");
    const isText = entry.kind === "text";
    const isSurface =
      entry.kind === "shape" && entry.semantic_role.includes("surface");
    let scaleFactor = 1;

    if (selection.hierarchy === "DRAMATIC")
      scaleFactor *= isPrimary ? 1.05 : 0.96;
    if (selection.hierarchy === "EDITORIAL" && isText)
      scaleFactor *= isPrimary ? 1.08 : 0.94;
    if (selection.recipe.id === "DATA_FOCUSED")
      scaleFactor *= isChart ? 1.07 : isPrimary ? 0.98 : 0.94;
    if (selection.recipe.id === "EDITORIAL_CONTRAST")
      scaleFactor *= isText ? 1.06 : 0.97;
    if (selection.density === "RICH" && entry.emphasis === "SUPPORTING")
      scaleFactor *= 0.98;

    const spatialOffset =
      selection.recipe.id === "SPATIAL_TECH" && entry.parent_id !== null
        ? ((entry.motion_order % 3) - 1) * tokens.spacing.xs * 0.08
        : 0;
    const opacity =
      selection.recipe.id === "EDITORIAL_CONTRAST" &&
      entry.semantic_role.includes("elevation")
        ? Math.min(entry.surface.opacity, 0.14)
        : selection.recipe.id === "DATA_FOCUSED" && isSurface
          ? Math.min(1, entry.surface.opacity + 0.02)
          : entry.surface.opacity;

    return {
      ...entry,
      depth:
        selection.recipe.id === "SPATIAL_TECH" && isPrimary
          ? "FOREGROUND"
          : entry.depth,
      surface: { ...entry.surface, opacity },
      transform: {
        ...entry.transform,
        scale: entry.transform.scale * scaleFactor,
        translate_x: entry.transform.translate_x + spatialOffset,
      },
      text:
        entry.text && selection.hierarchy === "EDITORIAL"
          ? { ...entry.text, align: isPrimary ? "start" : entry.text.align }
          : entry.text,
    };
  });
}

function contribution(components: readonly ProceduralComponent[]) {
  return {
    layers: components.length,
    paths: components.filter((entry) => entry.kind === "path").length,
    masks: components.filter((entry) => entry.kind === "mask").length,
    text_nodes: components.filter((entry) => entry.kind === "text").length,
    potential_tracks: components.reduce(
      (sum, entry) => sum + Math.min(2, entry.affordances.length),
      0,
    ),
    ui_elements: components.filter((entry) =>
      /(card|screen|dashboard|navigation|workspace|panel)/u.test(
        entry.semantic_role,
      ),
    ).length,
    icons: components.filter((entry) => entry.semantic_role.startsWith("icon_"))
      .length,
    particles: components.filter((entry) => entry.semantic_role === "particle")
      .length,
  };
}

function decisions(
  assetId: string,
  components: readonly ProceduralComponent[],
  tokens: ResolvedDesignTokens,
  selection: PremiumDesignSelection,
): DesignDecision[] {
  const make = (
    local: string,
    category: DesignDecision["category"],
    token: string,
    resolved: DesignDecision["resolved"],
    reason: DesignDecision["reason"],
    componentId: string | null = null,
  ): DesignDecision => ({
    id: visualStableId("design_decision", { asset: assetId, local, token }),
    asset_id: assetId,
    component_id: componentId,
    category,
    token,
    resolved,
    reason,
  });
  const primary =
    components.find(
      (entry) => entry.emphasis === "PRIMARY" && entry.parent_id !== null,
    )?.id ?? null;
  const iconTreatment =
    selection.recipe.id === "EDITORIAL_CONTRAST"
      ? "minimal_outline"
      : selection.recipe.id === "DATA_FOCUSED"
        ? "precise_outline"
        : selection.recipe.id === "SPATIAL_TECH"
          ? "geometric_outline"
          : "rounded_outline";
  const chartLanguage =
    selection.recipe.id === "DATA_FOCUSED"
      ? "context_then_focus"
      : selection.recipe.id === "EDITORIAL_CONTRAST"
        ? "annotation_first"
        : selection.recipe.id === "SPATIAL_TECH"
          ? "spatial_focus"
          : "focal_series";
  const negativeSpace =
    selection.density === "RESTRAINED"
      ? "generous"
      : selection.density === "RICH"
        ? "compact_controlled"
        : "balanced";
  return [
    make("spacing", "SPACING", "spacing.md", tokens.spacing.md, "GROUPING"),
    make("radius", "SURFACE", "radius.lg", tokens.radius.lg, "CONSISTENCY"),
    make(
      "hierarchy",
      "HIERARCHY",
      "hierarchy.single_primary",
      true,
      "FOCUS",
      primary,
    ),
    make("surface", "SURFACE", "surface.levels", 4, "HIERARCHY"),
    make(
      "elevation",
      "MATERIAL",
      "elevation.floating",
      tokens.elevation.floating,
      "FOCUS",
    ),
    make("icons", "ICON", "icon.treatment", iconTreatment, "CONSISTENCY"),
    make("chart", "CHART", "chart.language", chartLanguage, "DATA_STORY"),
    make(
      "details",
      "DETAIL",
      "detail.maximum_per_asset",
      tokens.detail.maximum_per_asset,
      "RESTRAINT",
    ),
    make(
      "composition",
      "COMPOSITION",
      "composition.negative_space",
      negativeSpace,
      "NEGATIVE_SPACE",
    ),
  ];
}

export interface PremiumDesignResolution {
  readonly design_plan: PremiumDesignPlan;
  readonly designed_asset_plan: ProceduralAssetPlan;
  readonly decision_trace: DesignDecisionTrace;
  readonly preflight: ReturnType<typeof buildPremiumDesignPreflight>;
}

export function resolvePremiumDesign(
  baseInput: unknown,
  requestInput: unknown,
  selectionInput: unknown,
): PremiumDesignResolution {
  const base = ProceduralAssetPlanSchema.parse(baseInput);
  const request = ProceduralAssetRequestSchema.parse(requestInput);
  const selection = PremiumDesignSelectionSchema.parse(selectionInput);
  const recipe = DESIGN_RECIPE_REGISTRY.get(selection.recipe.id);
  if (!recipe || recipe.version !== selection.recipe.version)
    throw new Error(
      `design.registry.unknown_recipe:${selection.recipe.id}@${selection.recipe.version}`,
    );
  if (
    !(recipe.compatible_languages as readonly string[]).includes(
      request.language,
    )
  )
    throw new Error(
      `design.recipe.incompatible:${selection.recipe.id}:${request.language}`,
    );
  const tokens = ResolvedDesignTokensSchema.parse(recipe.tokens);
  const sourceAsset = base.assets[0];
  if (!sourceAsset) throw new Error("design.source.asset_missing");
  const assetId = visualStableId("premium_asset", {
    base: sourceAsset.asset_id,
    recipe: selection.recipe,
    selection: selection.selection_id,
  });
  const components = applyDesignSelection(
    componentsFor(assetId, request),
    selection,
    tokens,
  );
  const counts = contribution(components);
  const designedAsset: ProceduralAsset = {
    ...sourceAsset,
    asset_id: assetId,
    version: "2.0.0",
    components,
    affordances: [...new Set(components.flatMap((entry) => entry.affordances))],
    capabilities: ["GROUP", "SHAPE", "PATH", "PATH_PROGRESS", "TEXT"],
    complexity: components.length > 32 ? "HIGH" : "MEDIUM",
    render_cost: "MEDIUM",
    contribution: counts,
    provenance: {
      ...sourceAsset.provenance,
      resolver_version: "0.2.0",
      registry_fingerprint: PREMIUM_DESIGN_SYSTEM_FINGERPRINT,
    },
  };
  const designedAssetPlan = ProceduralAssetPlanSchema.parse({
    ...base,
    plan_id: visualStableId("premium_asset_plan", {
      base: base.plan_id,
      selection: selection.selection_id,
    }),
    assets: [designedAsset],
  });
  const entries = decisions(assetId, components, tokens, selection);
  const designPlan = PremiumDesignPlanSchema.parse({
    schema: "premium-design-plan",
    schema_version: PREMIUM_DESIGN_PLAN_VERSION,
    design_system_version: PREMIUM_DESIGN_SYSTEM_VERSION,
    design_plan_id: visualStableId("premium_design_plan", {
      base: base.plan_id,
      selection: selection.selection_id,
    }),
    source: {
      direction_plan_id: base.direction_plan_id,
      procedural_asset_plan_id: base.plan_id,
      procedural_asset_plan_sha256: hashProceduralAssetPlan(base),
      asset_request_sha256: hashVisualDocument(request),
    },
    selection,
    registry_fingerprints: {
      system: PREMIUM_DESIGN_SYSTEM_FINGERPRINT,
      ...PREMIUM_DESIGN_FINGERPRINTS,
    },
    tokens,
    decisions: entries,
    designed_asset_plan_sha256: hashProceduralAssetPlan(designedAssetPlan),
  });
  const trace = DesignDecisionTraceSchema.parse({
    schema: "design-decision-trace",
    schema_version: "0.1.0",
    design_plan_id: designPlan.design_plan_id,
    precedence: [
      "ENGINE_LIMIT",
      "DESIGN_RECIPE",
      "ASSET_FAMILY",
      "DENSITY",
      "COMPONENT_ROLE",
    ],
    entries,
  });
  const preflight = buildPremiumDesignPreflight(designPlan, designedAssetPlan);
  return {
    design_plan: designPlan,
    designed_asset_plan: designedAssetPlan,
    decision_trace: trace,
    preflight,
  };
}

export function hashPremiumDesignPlan(plan: PremiumDesignPlan): string {
  return hashVisualDocument(PremiumDesignPlanSchema.parse(plan));
}
