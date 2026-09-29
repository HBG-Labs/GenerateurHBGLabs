import { hashVisualDocument, visualStableId } from '@motion-engine/visual-core';

import {
  PROCEDURAL_ASSET_GRAMMAR_VERSION,
  PROCEDURAL_ASSET_PLAN_VERSION,
  ProceduralAssetPlanSchema,
  ProceduralAssetRequestSchema,
} from './contracts.ts';
import type { ProceduralAsset, ProceduralAssetPlan, ProceduralAssetRequest, ProceduralComponent } from './contracts.ts';
import { MATERIAL_REGISTRY, PROCEDURAL_ASSET_REGISTRY, PROCEDURAL_ASSET_REGISTRY_FINGERPRINTS } from './registry.ts';

const baseTransform = { scale: 1, rotate_deg: 0, translate_x: 0, translate_y: 0 } as const;
const baseStyle = { fill: 'muted', stroke: 'accent', text: 'foreground' } as const;

function shortLabel(value: string, maximum = 18): string {
  const compact = value.trim().replace(/\s+/gu, ' ');
  if (compact.length <= maximum) return compact;
  const words = compact.split(' ');
  let result = '';
  for (const word of words) {
    const next = result.length === 0 ? word : `${result} ${word}`;
    if (next.length > maximum) break;
    result = next;
  }
  return result || compact.slice(0, maximum);
}

type ComponentOptions = Partial<Omit<ProceduralComponent, 'id' | 'parent_id' | 'semantic_role' | 'kind' | 'hierarchy' | 'region' | 'emphasis' | 'focusable' | 'decorative' | 'group_key' | 'motion_order' | 'depth' | 'style' | 'surface' | 'transform' | 'text' | 'shape' | 'path' | 'mask' | 'icon_id' | 'affordances'>> & {
  readonly hierarchy?: ProceduralComponent['hierarchy'];
  readonly region?: ProceduralComponent['region'];
  readonly emphasis?: ProceduralComponent['emphasis'];
  readonly focusable?: boolean;
  readonly decorative?: boolean;
  readonly group_key?: string | null;
  readonly motion_order?: number;
  readonly depth?: ProceduralComponent['depth'];
  readonly style?: ProceduralComponent['style'];
  readonly surface?: ProceduralComponent['surface'];
  readonly transform?: ProceduralComponent['transform'];
  readonly text?: ProceduralComponent['text'];
  readonly shape?: ProceduralComponent['shape'];
  readonly path?: ProceduralComponent['path'];
  readonly mask?: ProceduralComponent['mask'];
  readonly icon_id?: ProceduralComponent['icon_id'];
  readonly affordances?: ProceduralComponent['affordances'];
};

function component(assetId: string, local: string, parentId: string | null, semanticRole: string, kind: ProceduralComponent['kind'], options: ComponentOptions = {}): ProceduralComponent {
  return {
    id: visualStableId('asset_component', { asset: assetId, local }), parent_id: parentId, semantic_role: semanticRole, kind,
    hierarchy: options.hierarchy ?? 'SUPPORT', region: options.region ?? 'center', emphasis: options.emphasis ?? 'SUPPORTING',
    focusable: options.focusable ?? false, decorative: options.decorative ?? false, group_key: options.group_key ?? null,
    motion_order: options.motion_order ?? 0, depth: options.depth ?? 'MIDGROUND', style: options.style ?? baseStyle,
    surface: options.surface ?? { opacity: 1, radius: 'none', stroke: 'none' }, transform: options.transform ?? baseTransform,
    text: options.text ?? null, shape: options.shape ?? null, path: options.path ?? null, mask: options.mask ?? null,
    icon_id: options.icon_id ?? null, affordances: options.affordances ?? [],
  };
}

function root(assetId: string, semanticRole: string, region: ProceduralComponent['region']): ProceduralComponent {
  return component(assetId, 'root', null, semanticRole, 'group', { hierarchy: 'PRIMARY', region, emphasis: 'PRIMARY', focusable: true, group_key: visualStableId('asset_group', { asset: assetId, group: 'root' }), affordances: ['ASSEMBLE', 'FOCUS', 'CARRY', 'REASSEMBLE'] });
}

function text(assetId: string, local: string, parentId: string, semanticRole: string, value: string, role: NonNullable<ProceduralComponent['text']>['role'], region: ProceduralComponent['region'], order: number, emphasis: ProceduralComponent['emphasis'] = 'SUPPORTING'): ProceduralComponent {
  return component(assetId, local, parentId, semanticRole, 'text', { hierarchy: emphasis === 'PRIMARY' ? 'PRIMARY' : 'SECONDARY', region, emphasis, focusable: emphasis === 'PRIMARY', motion_order: order, text: { value, role, align: 'start' }, style: { fill: 'background', stroke: 'accent', text: 'foreground' }, affordances: ['ASSEMBLE', ...(emphasis === 'PRIMARY' ? ['FOCUS' as const] : [])] });
}

function shape(assetId: string, local: string, parentId: string, semanticRole: string, region: ProceduralComponent['region'], order: number, options: ComponentOptions = {}): ProceduralComponent {
  return component(assetId, local, parentId, semanticRole, 'shape', { hierarchy: 'SUPPORT', region, motion_order: order, shape: { kind: 'rect' }, affordances: ['ASSEMBLE'], ...options });
}

function line(assetId: string, local: string, parentId: string, semanticRole: string, points: readonly { x: number; y: number }[], order: number, emphasis: ProceduralComponent['emphasis'] = 'SUPPORTING'): ProceduralComponent {
  return component(assetId, local, parentId, semanticRole, 'path', { hierarchy: emphasis === 'PRIMARY' ? 'PRIMARY' : 'SUPPORT', region: 'center', emphasis, focusable: emphasis === 'PRIMARY', motion_order: order, path: { points: [...points], closed: false }, style: { fill: 'background', stroke: emphasis === 'PRIMARY' ? 'accent' : 'foreground', text: 'foreground' }, affordances: ['ASSEMBLE', 'DRAW', ...(emphasis === 'PRIMARY' ? ['FOCUS' as const, 'EXTRACT_SERIES' as const] : [])] });
}

function icon(assetId: string, local: string, parentId: string, iconId: NonNullable<ProceduralComponent['icon_id']>, order: number): ProceduralComponent {
  const points = iconId === 'CHECK' ? [{ x: 0.18, y: 0.52 }, { x: 0.42, y: 0.74 }, { x: 0.82, y: 0.24 }]
    : iconId === 'TREND' ? [{ x: 0.12, y: 0.72 }, { x: 0.42, y: 0.46 }, { x: 0.62, y: 0.58 }, { x: 0.88, y: 0.22 }]
      : [{ x: 0.16, y: 0.5 }, { x: 0.84, y: 0.5 }];
  return component(assetId, local, parentId, 'icon_glyph', 'path', { hierarchy: 'SECONDARY', region: 'lower', emphasis: 'SECONDARY', decorative: false, motion_order: order, path: { points, closed: false }, icon_id: iconId, style: { fill: 'background', stroke: 'foreground', text: 'foreground' }, transform: { ...baseTransform, scale: 0.18 }, affordances: ['ASSEMBLE', 'DRAW'] });
}

function uiCard(assetId: string, request: ProceduralAssetRequest, parentId: string, prefix: string, region: ProceduralComponent['region'], order: number, variant = request.variant): ProceduralComponent[] {
  const groupId = visualStableId('asset_component', { asset: assetId, local: `${prefix}_group` });
  const values = request.data.length > 0 ? request.data : [0.3, 0.58, 0.44, 0.78, 0.67];
  return [
    component(assetId, `${prefix}_group`, parentId, 'ui_card_group', 'group', { hierarchy: 'PRIMARY', region, emphasis: order === 0 ? 'PRIMARY' : 'SECONDARY', focusable: true, group_key: visualStableId('asset_group', { asset: assetId, group: prefix }), motion_order: order, affordances: ['ASSEMBLE', 'FOCUS', 'EXTRACT', 'EXPAND', 'CARRY'] }),
    shape(assetId, `${prefix}_shadow`, groupId, 'card_shadow', 'full', order, { decorative: true, depth: 'BACKGROUND', surface: { opacity: 0.22, radius: 'lg', stroke: 'none' }, style: { fill: 'background', stroke: 'background', text: 'foreground' }, transform: { ...baseTransform, translate_x: 0.025, translate_y: 0.03 } }),
    shape(assetId, `${prefix}_surface`, groupId, 'card_surface', 'full', order + 1, { surface: { opacity: request.material === 'GLASS_LIKE_SIMPLIFIED' ? 0.78 : 0.96, radius: 'lg', stroke: 'hairline' }, style: { fill: request.material === 'LUMINOUS' ? 'accent' : 'muted', stroke: 'foreground', text: 'foreground' } }),
    text(assetId, `${prefix}_label`, groupId, 'card_label', shortLabel(request.copy.label || (variant === 'CHART' ? 'PROGRÈS' : 'JOUR'), 7), 'CAPTION', 'top', order + 2),
    text(assetId, `${prefix}_value`, groupId, 'card_value', shortLabel(request.copy.value || (variant === 'STATUS' ? 'ACTIF' : '72%'), 8), 'DATA', 'center', order + 3, 'PRIMARY'),
    shape(assetId, `${prefix}_badge`, groupId, 'status_badge', 'lower', order + 4, { shape: { kind: 'ellipse' }, emphasis: 'SECONDARY', focusable: true, surface: { opacity: 1, radius: 'xl', stroke: 'hairline' }, style: { fill: 'accent', stroke: 'accent', text: 'inverse' }, transform: { ...baseTransform, scale: 0.22 }, icon_id: variant === 'STATUS' ? 'CHECK' : 'TREND', affordances: ['ASSEMBLE', 'HIGHLIGHT', 'CARRY'] }),
    icon(assetId, `${prefix}_icon`, groupId, variant === 'STATUS' ? 'CHECK' : 'TREND', order + 5),
    line(assetId, `${prefix}_chart`, groupId, variant === 'CHART' ? 'chart_series' : 'metric_trend', values.slice(0, 6).map((value, index) => ({ x: 0.08 + index * 0.17, y: 0.86 - value * 0.58 })), order + 6, variant === 'CHART' ? 'PRIMARY' : 'SECONDARY'),
  ];
}

function smartphone(assetId: string, request: ProceduralAssetRequest): ProceduralComponent[] {
  const rootNode = root(assetId, request.semantic_role, 'right');
  const screenId = visualStableId('asset_component', { asset: assetId, local: 'screen_group' });
  return [
    rootNode,
    shape(assetId, 'device_shadow', rootNode.id, 'device_shadow', 'full', 0, { decorative: true, depth: 'BACKGROUND', surface: { opacity: 0.3, radius: 'xl', stroke: 'none' }, style: { fill: 'background', stroke: 'background', text: 'foreground' }, transform: { ...baseTransform, translate_x: 0.04, translate_y: 0.04, scale: 0.92 } }),
    shape(assetId, 'device_body', rootNode.id, 'device_body', 'full', 1, { hierarchy: 'PRIMARY', emphasis: 'PRIMARY', focusable: true, surface: { opacity: 1, radius: 'xl', stroke: 'emphasis' }, style: { fill: 'foreground', stroke: 'accent', text: 'foreground' }, transform: { ...baseTransform, scale: 0.9 }, affordances: ['ASSEMBLE', 'FOCUS', 'CARRY', 'REASSEMBLE'] }),
    component(assetId, 'screen_group', rootNode.id, 'app_screen', 'group', { hierarchy: 'PRIMARY', region: 'full', emphasis: 'PRIMARY', focusable: true, motion_order: 2, group_key: visualStableId('asset_group', { asset: assetId, group: 'screen' }), transform: { ...baseTransform, scale: 0.82 }, affordances: ['ASSEMBLE', 'FOCUS', 'EXPAND', 'EXTRACT'] }),
    shape(assetId, 'screen_surface', screenId, 'screen_surface', 'full', 2, { surface: { opacity: 1, radius: 'lg', stroke: 'hairline' }, style: { fill: 'background', stroke: 'muted', text: 'foreground' } }),
    shape(assetId, 'screen_header', screenId, 'screen_header', 'top', 3, { surface: { opacity: 0.92, radius: 'md', stroke: 'none' }, style: { fill: 'muted', stroke: 'muted', text: 'foreground' } }),
    text(assetId, 'product_name', screenId, 'product_name', shortLabel(request.copy.title, 16), 'CAPTION', 'top', 4, 'PRIMARY'),
    ...uiCard(assetId, request, screenId, 'primary_card', 'center', 5, 'METRIC'),
    shape(assetId, 'home_indicator', rootNode.id, 'device_indicator', 'bottom', 12, { decorative: true, surface: { opacity: 0.86, radius: 'xl', stroke: 'none' }, style: { fill: 'accent', stroke: 'accent', text: 'inverse' }, transform: { ...baseTransform, scale: 0.16 } }),
  ];
}

function dashboard(assetId: string, request: ProceduralAssetRequest): ProceduralComponent[] {
  const rootNode = root(assetId, request.semantic_role, 'center');
  const chartGroupId = visualStableId('asset_component', { asset: assetId, local: 'chart_focus_group' });
  return [
    rootNode,
    shape(assetId, 'dashboard_shadow', rootNode.id, 'dashboard_shadow', 'full', 0, { decorative: true, depth: 'BACKGROUND', surface: { opacity: 0.24, radius: 'xl', stroke: 'none' }, style: { fill: 'background', stroke: 'background', text: 'foreground' }, transform: { ...baseTransform, translate_y: 0.035 } }),
    shape(assetId, 'dashboard_surface', rootNode.id, 'dashboard_surface', 'full', 1, { surface: { opacity: 0.96, radius: 'xl', stroke: 'hairline' }, style: { fill: 'background', stroke: 'foreground', text: 'foreground' } }),
    shape(assetId, 'dashboard_nav', rootNode.id, 'navigation_rail', 'left', 2, { surface: { opacity: 0.9, radius: 'lg', stroke: 'hairline' }, style: { fill: 'muted', stroke: 'accent', text: 'foreground' }, icon_id: 'GRID' }),
    text(assetId, 'dashboard_title', rootNode.id, 'dashboard_title', shortLabel(request.copy.title, 20), 'CAPTION', 'top', 3, 'PRIMARY'),
    ...uiCard(assetId, request, rootNode.id, 'metric_card', 'upper', 4, 'METRIC').filter((entry) => entry.semantic_role !== 'card_label'),
    component(assetId, 'chart_focus_group', rootNode.id, 'chart_focus_group', 'group', { hierarchy: 'PRIMARY', region: 'lower', emphasis: 'PRIMARY', focusable: true, group_key: visualStableId('asset_group', { asset: assetId, group: 'chart_focus' }), motion_order: 11, affordances: ['ASSEMBLE', 'FOCUS', 'EXTRACT', 'EXPAND', 'CARRY'] }),
    shape(assetId, 'chart_focus_surface', chartGroupId, 'chart_surface', 'full', 12, { surface: { opacity: 0.96, radius: 'lg', stroke: 'hairline' }, style: { fill: 'muted', stroke: 'foreground', text: 'foreground' } }),
    line(assetId, 'chart_focus_series', chartGroupId, 'chart_series', [{ x: 0.08, y: 0.76 }, { x: 0.28, y: 0.58 }, { x: 0.48, y: 0.66 }, { x: 0.7, y: 0.32 }, { x: 0.92, y: 0.18 }], 13, 'PRIMARY'),
  ];
}

function appScreen(assetId: string, request: ProceduralAssetRequest): ProceduralComponent[] {
  const rootNode = root(assetId, request.semantic_role, 'center');
  return [rootNode,
    shape(assetId, 'app_surface', rootNode.id, 'app_surface', 'full', 0, { surface: { opacity: 0.98, radius: 'xl', stroke: 'hairline' }, style: { fill: 'background', stroke: 'foreground', text: 'foreground' } }),
    shape(assetId, 'app_sidebar', rootNode.id, 'app_sidebar', 'left', 1, { surface: { opacity: 0.9, radius: 'lg', stroke: 'hairline' }, style: { fill: 'muted', stroke: 'accent', text: 'foreground' }, icon_id: 'GRID' }),
    text(assetId, 'app_title', rootNode.id, 'app_title', shortLabel(request.copy.title, 20), 'CAPTION', 'top', 2, 'PRIMARY'),
    ...uiCard(assetId, request, rootNode.id, 'focus_card', 'center', 3, request.variant === 'FEATURE' ? 'FEATURE' : 'STATUS'),
    shape(assetId, 'app_action', rootNode.id, 'primary_action', 'bottom', 10, { emphasis: 'SECONDARY', focusable: true, surface: { opacity: 1, radius: 'xl', stroke: 'hairline' }, style: { fill: 'accent', stroke: 'accent', text: 'inverse' }, transform: { ...baseTransform, scale: 0.44 }, icon_id: 'ARROW', affordances: ['ASSEMBLE', 'FOCUS', 'CARRY'] }),
  ];
}

function dataChart(assetId: string, request: ProceduralAssetRequest): ProceduralComponent[] {
  const rootNode = root(assetId, request.semantic_role, 'center');
  const values = request.data.length > 0 ? request.data : [0.28, 0.52, 0.47, 0.74, 0.88];
  return [rootNode,
    shape(assetId, 'chart_surface', rootNode.id, 'chart_surface', 'full', 0, { surface: { opacity: 0.96, radius: 'xl', stroke: 'hairline' }, style: { fill: 'muted', stroke: 'foreground', text: 'foreground' } }),
    text(assetId, 'chart_title', rootNode.id, 'chart_title', shortLabel(request.copy.title, 22), 'CAPTION', 'top', 1, 'PRIMARY'),
    text(assetId, 'chart_value', rootNode.id, 'chart_value', request.copy.value || '72%', 'DATA', 'upper', 2, 'PRIMARY'),
    line(assetId, 'chart_grid_one', rootNode.id, 'chart_grid', [{ x: 0.08, y: 0.72 }, { x: 0.92, y: 0.72 }], 3, 'DECORATIVE'),
    line(assetId, 'chart_grid_two', rootNode.id, 'chart_grid', [{ x: 0.08, y: 0.46 }, { x: 0.92, y: 0.46 }], 4, 'DECORATIVE'),
    line(assetId, 'chart_series', rootNode.id, 'chart_series', values.map((value, index) => ({ x: 0.08 + index * (0.84 / Math.max(1, values.length - 1)), y: 0.88 - value * 0.68 })), 5, 'PRIMARY'),
    shape(assetId, 'chart_focus', rootNode.id, 'chart_focus', 'right', 6, { shape: { kind: 'ellipse' }, emphasis: 'PRIMARY', focusable: true, surface: { opacity: 1, radius: 'xl', stroke: 'emphasis' }, style: { fill: 'accent', stroke: 'foreground', text: 'inverse' }, transform: { ...baseTransform, scale: 0.16 }, affordances: ['ASSEMBLE', 'FOCUS', 'EXPAND', 'CARRY'] }),
  ];
}

function environment(assetId: string, request: ProceduralAssetRequest): ProceduralComponent[] {
  const rootNode = root(assetId, request.semantic_role, 'full');
  const components: ProceduralComponent[] = [rootNode,
    shape(assetId, 'environment_field', rootNode.id, 'atmosphere_field', 'full', 0, { hierarchy: 'BACKGROUND', depth: 'BACKGROUND', surface: { opacity: 0.96, radius: 'none', stroke: 'none' }, style: { fill: 'background', stroke: 'background', text: 'foreground' } }),
    shape(assetId, 'environment_glow', rootNode.id, 'atmosphere_glow', 'center', 1, { shape: { kind: 'ellipse' }, decorative: true, depth: 'BACKGROUND', surface: { opacity: 0.34, radius: 'xl', stroke: 'none' }, style: { fill: 'accent', stroke: 'accent', text: 'inverse' }, transform: { ...baseTransform, scale: 0.72 } }),
    line(assetId, 'light_ray_main', rootNode.id, 'light_ray', [{ x: 0.02, y: 0.14 }, { x: 0.42, y: 0.44 }, { x: 0.94, y: 0.68 }], 2, 'PRIMARY'),
    line(assetId, 'light_ray_secondary', rootNode.id, 'light_ray_secondary', [{ x: 0.08, y: 0.24 }, { x: 0.56, y: 0.5 }, { x: 0.9, y: 0.84 }], 3),
  ];
  for (let index = 0; index < 8; index += 1) components.push(shape(assetId, `particle_${index}`, rootNode.id, 'particle', index % 2 === 0 ? 'foreground' : 'background', 4 + index, { shape: { kind: 'ellipse' }, decorative: true, depth: index % 3 === 0 ? 'FOREGROUND' : 'MIDGROUND', surface: { opacity: 0.35 + (index % 3) * 0.15, radius: 'xl', stroke: 'none' }, style: { fill: index % 2 === 0 ? 'accent' : 'foreground', stroke: 'accent', text: 'foreground' }, transform: { ...baseTransform, scale: 0.08 + index * 0.012, translate_x: ((request.seed + index * 37) % 100) / 160 - 0.3, translate_y: ((request.seed + index * 53) % 100) / 160 - 0.3 } }));
  return components;
}

function genericComponents(assetId: string, request: ProceduralAssetRequest): ProceduralComponent[] {
  const rootNode = root(assetId, request.semantic_role, request.language === 'EDITORIAL' ? 'full' : 'center');
  return [rootNode,
    shape(assetId, 'primary_surface', rootNode.id, 'primary_surface', 'full', 0, { hierarchy: 'PRIMARY', emphasis: 'PRIMARY', focusable: true, surface: { opacity: 0.96, radius: request.language === 'EDITORIAL' ? 'none' : 'xl', stroke: 'hairline' }, style: { fill: request.material === 'LUMINOUS' ? 'accent' : 'muted', stroke: 'foreground', text: 'foreground' }, affordances: ['ASSEMBLE', 'FOCUS', 'EXPAND', 'CARRY'] }),
    text(assetId, 'primary_title', rootNode.id, 'primary_title', shortLabel(request.copy.title, 26), 'SUBHEAD', 'upper', 1, 'PRIMARY'),
    text(assetId, 'primary_label', rootNode.id, 'primary_label', request.copy.label || 'SYSTÈME', 'CAPTION', 'lower', 2),
    line(assetId, 'primary_rule', rootNode.id, 'divider_system', [{ x: 0.08, y: 0.5 }, { x: 0.92, y: 0.5 }], 3),
    shape(assetId, 'primary_accent', rootNode.id, 'decorative_anchor', 'right', 4, { shape: { kind: 'ellipse' }, decorative: true, surface: { opacity: 0.9, radius: 'xl', stroke: 'hairline' }, style: { fill: 'accent', stroke: 'foreground', text: 'inverse' }, transform: { ...baseTransform, scale: 0.22 }, icon_id: 'SPARK' }),
  ];
}

function componentsFor(assetId: string, request: ProceduralAssetRequest): ProceduralComponent[] {
  let components: ProceduralComponent[] | undefined;
  if (request.family === 'GENERIC_SMARTPHONE_FRAME') components = smartphone(assetId, request);
  else if (request.family === 'DASHBOARD') components = dashboard(assetId, request);
  else if (request.family === 'APP_SCREEN') components = appScreen(assetId, request);
  if (request.family === 'UI_CARD') {
    const rootNode = root(assetId, request.semantic_role, 'center');
    components = [rootNode, ...uiCard(assetId, request, rootNode.id, 'card', 'full', 0)];
  }
  else if (request.family === 'DATA_CHART' || request.family === 'COUNTER' || request.family === 'PROCESS_DIAGRAM') components = dataChart(assetId, request);
  else if (request.family === 'LIGHT_SYSTEM' || request.family === 'PARTICLE_FIELD' || request.family === 'ORBIT_SYSTEM') components = environment(assetId, request);
  else if (!components) components = genericComponents(assetId, request);
  const rootScale = request.density === 'COMPACT' ? 0.96 : request.density === 'SPACIOUS' ? 0.84 : 0.91;
  return components.map((entry) => {
    if (entry.parent_id === null) return { ...entry, hierarchy: 'PRIMARY' as const, emphasis: request.emphasis, focusable: request.emphasis === 'PRIMARY', transform: { ...entry.transform, scale: rootScale } };
    if (request.system_identity === 'EDITORIAL_PRECISE' && entry.kind === 'shape') return { ...entry, surface: { ...entry.surface, radius: entry.surface.radius === 'none' ? 'none' as const : 'sm' as const } };
    if (request.material === 'BORDERED' && entry.kind === 'shape' && entry.semantic_role.includes('surface')) return { ...entry, style: { ...entry.style, fill: 'background' as const }, surface: { ...entry.surface, opacity: 0.94, stroke: 'emphasis' as const } };
    if (request.material === 'GRADIENT_LAYERED' && entry.kind === 'shape' && entry.semantic_role.includes('surface')) return { ...entry, style: { ...entry.style, fill: entry.motion_order % 2 === 0 ? 'muted' as const : 'accent' as const }, surface: { ...entry.surface, opacity: entry.motion_order % 2 === 0 ? 0.82 : 0.28 } };
    return entry;
  });
}

function contribution(components: readonly ProceduralComponent[]) {
  return {
    layers: components.length,
    paths: components.filter((entry) => entry.kind === 'path').length,
    masks: components.filter((entry) => entry.kind === 'mask').length,
    text_nodes: components.filter((entry) => entry.kind === 'text').length,
    potential_tracks: components.reduce((sum, entry) => sum + Math.min(2, entry.affordances.length), 0),
    ui_elements: components.filter((entry) => ['ui_card_group', 'card_surface', 'app_screen', 'screen_surface', 'navigation_rail', 'primary_action'].includes(entry.semantic_role)).length,
    icons: components.filter((entry) => entry.icon_id !== null).length,
    particles: components.filter((entry) => entry.semantic_role === 'particle').length,
  };
}

export function resolveProceduralAssetRequest(input: unknown): ProceduralAssetPlan {
  const request = ProceduralAssetRequestSchema.parse(input);
  const family = PROCEDURAL_ASSET_REGISTRY.get(request.family);
  if (!family) throw new Error(`asset.registry.unknown_family:${request.family}`);
  if (!family.variants.includes(request.variant)) throw new Error(`asset.registry.unsupported_variant:${request.family}:${request.variant}`);
  if (!family.languages.includes(request.language)) throw new Error(`asset.registry.unsupported_language:${request.family}:${request.language}`);
  if (!family.affordances.includes(request.choreography)) throw new Error(`asset.registry.unsupported_choreography:${request.family}:${request.choreography}`);
  if (!MATERIAL_REGISTRY.has(request.material)) throw new Error(`asset.registry.unknown_material:${request.material}`);
  const assetId = visualStableId('procedural_asset', { request: request.request_id, family: request.family, variant: request.variant, seed: request.seed });
  const components = componentsFor(assetId, request);
  const counts = contribution(components);
  const asset: ProceduralAsset = {
    asset_id: assetId, asset_type: request.family, version: family.version, variant: request.variant,
    semantic_role: request.semantic_role, language: request.language, system_identity: request.system_identity,
    material_language: request.material_language, material: request.material, choreography: request.choreography,
    initial_state: 'ASSEMBLED', persistent: request.persistent, seed: request.seed, components,
    capabilities: ['GROUP', 'SHAPE', ...(counts.paths > 0 ? ['PATH', 'PATH_PROGRESS'] as const : []), ...(counts.text_nodes > 0 ? ['TEXT'] as const : [])],
    affordances: [...new Set(components.flatMap((entry) => entry.affordances))],
    complexity: components.length > 16 ? 'HIGH' : components.length > 8 ? 'MEDIUM' : 'LOW',
    render_cost: family.render_cost, contribution: counts,
    provenance: { request_id: request.request_id, source_asset_intent_id: request.source_asset_intent_id, resolver_version: '0.1.0', registry_fingerprint: PROCEDURAL_ASSET_REGISTRY_FINGERPRINTS.assets },
  };
  return ProceduralAssetPlanSchema.parse({
    schema: 'procedural-asset-plan', schema_version: PROCEDURAL_ASSET_PLAN_VERSION,
    plan_id: visualStableId('procedural_asset_plan', { direction: request.direction_plan_id, scene: request.scene_id, request: request.request_id }),
    direction_plan_id: request.direction_plan_id, scene_id: request.scene_id, grammar_version: PROCEDURAL_ASSET_GRAMMAR_VERSION,
    registry_fingerprints: PROCEDURAL_ASSET_REGISTRY_FINGERPRINTS, assets: [asset],
  });
}

export function hashProceduralAssetPlan(plan: ProceduralAssetPlan): string {
  return hashVisualDocument(ProceduralAssetPlanSchema.parse(plan));
}
