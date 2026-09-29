import { ProceduralAssetPlanSchema } from './contracts.ts';
import type { AssetDiagnostic, ProceduralAssetPlan, ProceduralAssetPreflightReport } from './contracts.ts';
import { PROCEDURAL_ASSET_LIMITS } from './limits.ts';
import { AFFORDANCE_DEFINITIONS, MATERIAL_REGISTRY, PROCEDURAL_ASSET_REGISTRY } from './registry.ts';
import { hashProceduralAssetPlan } from './resolver.ts';

function diagnostic(code: string, severity: AssetDiagnostic['severity'], path: string, options: Partial<Pick<AssetDiagnostic, 'scene_id' | 'asset_id' | 'component_id' | 'context' | 'suggested_action'>> = {}): AssetDiagnostic {
  return { code, severity, path, scene_id: options.scene_id ?? null, asset_id: options.asset_id ?? null, component_id: options.component_id ?? null, context: options.context ?? {}, suggested_action: options.suggested_action ?? 'Corriger le ProceduralAssetPlan avant compilation.' };
}

function hostileScan(value: unknown): string | null {
  const seen = new Set<object>();
  const visit = (entry: unknown, depth: number): string | null => {
    if (depth > 32) return 'asset.security.excessive_payload_depth';
    if (entry === null || typeof entry !== 'object') return typeof entry === 'string' && entry.length > 2_048 ? 'asset.security.oversized_string' : null;
    if (seen.has(entry)) return 'asset.security.cyclic_payload';
    seen.add(entry);
    if (Array.isArray(entry) && entry.length > 512) return 'asset.security.oversized_array';
    for (const [key, nested] of Object.entries(entry)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) return 'asset.security.prototype_pollution';
      if (['code', 'script', 'jsx', 'css', 'svg', 'url', 'filesystem_path', 'command', 'shader'].includes(key.toLowerCase())) return 'asset.security.executable_or_external_field';
      const issue = visit(nested, depth + 1);
      if (issue) return issue;
    }
    seen.delete(entry);
    return null;
  };
  return visit(value, 0);
}

function depthOf(componentId: string, parentById: ReadonlyMap<string, string | null>): number {
  const seen = new Set<string>();
  let current: string | null | undefined = componentId;
  let depth = 0;
  while (current !== null && current !== undefined) {
    if (seen.has(current)) return Number.POSITIVE_INFINITY;
    seen.add(current);
    current = parentById.get(current);
    depth += 1;
  }
  return depth;
}

export function buildProceduralAssetPreflight(candidate: unknown): ProceduralAssetPreflightReport {
  const diagnostics: AssetDiagnostic[] = [];
  const hostile = hostileScan(candidate);
  if (hostile) diagnostics.push(diagnostic(hostile, 'error', '$', { suggested_action: 'Fournir uniquement des données bornées et non exécutables.' }));
  const parsed = hostile ? null : ProceduralAssetPlanSchema.safeParse(candidate);
  if (parsed && !parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 64)) diagnostics.push(diagnostic('asset.schema.invalid', 'error', `$.${issue.path.join('.')}`, { context: { message: issue.message }, suggested_action: 'Respecter le schéma ProceduralAssetPlan 0.1.0 strict.' }));
  }
  const plan: ProceduralAssetPlan | null = parsed?.success ? parsed.data : null;
  const checks = { schema: plan !== null, registry: true, hierarchy: true, limits: true, materials: true, references: true, affordances: true, depth: true, security: hostile === null };
  if (plan) {
    if (plan.assets.length > PROCEDURAL_ASSET_LIMITS.max_assets_per_scene) {
      diagnostics.push(diagnostic('asset.limits.assets_per_scene', 'error', '$.assets', { scene_id: plan.scene_id, context: { actual: plan.assets.length, limit: PROCEDURAL_ASSET_LIMITS.max_assets_per_scene } })); checks.limits = false;
    }
    const allIds = new Set<string>();
    let totalNodes = 0;
    for (const [assetIndex, asset] of plan.assets.entries()) {
      const path = `$.assets[${assetIndex}]`;
      totalNodes += asset.components.length;
      if (!PROCEDURAL_ASSET_REGISTRY.has(asset.asset_type)) { diagnostics.push(diagnostic('asset.registry.unknown_family', 'error', `${path}.asset_type`, { scene_id: plan.scene_id, asset_id: asset.asset_id })); checks.registry = false; }
      if (!MATERIAL_REGISTRY.has(asset.material)) { diagnostics.push(diagnostic('asset.material.unsupported', 'error', `${path}.material`, { scene_id: plan.scene_id, asset_id: asset.asset_id })); checks.materials = false; }
      if (asset.components.length > PROCEDURAL_ASSET_LIMITS.max_components_per_asset) { diagnostics.push(diagnostic('asset.limits.components', 'error', `${path}.components`, { scene_id: plan.scene_id, asset_id: asset.asset_id, context: { actual: asset.components.length, limit: PROCEDURAL_ASSET_LIMITS.max_components_per_asset } })); checks.limits = false; }
      const parentById = new Map(asset.components.map((entry) => [entry.id, entry.parent_id]));
      const affordanceIds = new Set(AFFORDANCE_DEFINITIONS.map((entry) => entry.id));
      let roots = 0;
      for (const [componentIndex, component] of asset.components.entries()) {
        const componentPath = `${path}.components[${componentIndex}]`;
        if (allIds.has(component.id)) { diagnostics.push(diagnostic('asset.component.duplicate_id', 'error', `${componentPath}.id`, { scene_id: plan.scene_id, asset_id: asset.asset_id, component_id: component.id })); checks.hierarchy = false; }
        allIds.add(component.id);
        if (component.parent_id === null) roots += 1;
        else if (!parentById.has(component.parent_id)) { diagnostics.push(diagnostic('asset.component.parent_missing', 'error', `${componentPath}.parent_id`, { scene_id: plan.scene_id, asset_id: asset.asset_id, component_id: component.id })); checks.references = false; }
        const depth = depthOf(component.id, parentById);
        if (!Number.isFinite(depth)) { diagnostics.push(diagnostic('asset.component.cycle', 'error', componentPath, { scene_id: plan.scene_id, asset_id: asset.asset_id, component_id: component.id })); checks.hierarchy = false; }
        else if (depth > PROCEDURAL_ASSET_LIMITS.max_nested_component_depth) { diagnostics.push(diagnostic('asset.limits.nesting', 'error', componentPath, { scene_id: plan.scene_id, asset_id: asset.asset_id, component_id: component.id, context: { actual: depth, limit: PROCEDURAL_ASSET_LIMITS.max_nested_component_depth } })); checks.depth = false; }
        if (component.affordances.some((entry) => !affordanceIds.has(entry))) { diagnostics.push(diagnostic('asset.affordance.unsupported', 'error', `${componentPath}.affordances`, { scene_id: plan.scene_id, asset_id: asset.asset_id, component_id: component.id })); checks.affordances = false; }
      }
      if (roots !== 1) { diagnostics.push(diagnostic('asset.component.root_count', 'error', `${path}.components`, { scene_id: plan.scene_id, asset_id: asset.asset_id, context: { roots } })); checks.hierarchy = false; }
      const contribution = asset.contribution;
      const limitChecks = [
        ['paths', contribution.paths, PROCEDURAL_ASSET_LIMITS.max_paths_per_asset], ['particles', contribution.particles, PROCEDURAL_ASSET_LIMITS.max_particles_per_asset],
        ['ui_elements', contribution.ui_elements, PROCEDURAL_ASSET_LIMITS.max_ui_elements_per_asset], ['icons', contribution.icons, PROCEDURAL_ASSET_LIMITS.max_icon_instances_per_asset],
      ] as const;
      for (const [key, actual, limit] of limitChecks) if (actual > limit) { diagnostics.push(diagnostic(`asset.limits.${key}`, 'error', `${path}.contribution.${key}`, { scene_id: plan.scene_id, asset_id: asset.asset_id, context: { actual, limit } })); checks.limits = false; }
      const focusable = asset.components.filter((entry) => entry.focusable);
      if (focusable.length === 0) diagnostics.push(diagnostic('asset.hierarchy.no_focusable_component', 'warning', `${path}.components`, { scene_id: plan.scene_id, asset_id: asset.asset_id, suggested_action: 'Déclarer au moins un composant focusable pour le ciblage motion.' }));
      if (asset.material === 'PAPER_LIKE' || asset.material === 'GLASS_LIKE_SIMPLIFIED') diagnostics.push(diagnostic('asset.material.simplified', 'warning', `${path}.material`, { scene_id: plan.scene_id, asset_id: asset.asset_id, context: { material: asset.material }, suggested_action: 'Conserver la provenance SIMPLIFIED et inspecter le rendu Chromium/Linux.' }));
    }
    if (totalNodes > PROCEDURAL_ASSET_LIMITS.max_total_procedural_nodes_per_scene) { diagnostics.push(diagnostic('asset.limits.total_nodes', 'error', '$.assets', { scene_id: plan.scene_id, context: { actual: totalNodes, limit: PROCEDURAL_ASSET_LIMITS.max_total_procedural_nodes_per_scene } })); checks.limits = false; }
  }
  const errors = diagnostics.filter((entry) => entry.severity === 'error').length;
  const warnings = diagnostics.filter((entry) => entry.severity === 'warning').length;
  return {
    schema: 'procedural-asset-preflight-report', schema_version: '0.1.0', status: errors > 0 ? 'fail' : warnings > 0 ? 'warn' : 'pass', eligible_for_compilation: errors === 0,
    procedural_asset_plan_sha256: plan ? hashProceduralAssetPlan(plan) : null, diagnostics,
    summary: { errors, warnings, infos: diagnostics.length - errors - warnings }, checks,
  };
}
