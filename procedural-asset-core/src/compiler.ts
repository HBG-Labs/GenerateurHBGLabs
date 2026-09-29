import type { VisualEntity } from '@motion-engine/visual-core';

import type { ProceduralAssetPlan } from './contracts.ts';
import { buildProceduralAssetPreflight } from './preflight.ts';

export interface ProceduralAssetCompileResult {
  readonly ok: boolean;
  readonly entities: readonly VisualEntity[];
  readonly preflight: ReturnType<typeof buildProceduralAssetPreflight>;
  readonly provenance: readonly { asset_id: string; component_id: string; visual_entity_id: string }[];
}

export function compileProceduralAssetPlan(plan: ProceduralAssetPlan, parentId: string | null): ProceduralAssetCompileResult {
  const preflight = buildProceduralAssetPreflight(plan);
  if (!preflight.eligible_for_compilation) return { ok: false, entities: [], preflight, provenance: [] };
  const entities: VisualEntity[] = [];
  const provenance: { asset_id: string; component_id: string; visual_entity_id: string }[] = [];
  for (const asset of plan.assets) {
    const componentIds = new Set(asset.components.map((entry) => entry.id));
    for (const entry of asset.components) {
      const visualEntityId = asset.persistent && entry.parent_id === null ? asset.asset_id : null;
      const resolvedParent = entry.parent_id === null ? parentId : componentIds.has(entry.parent_id) ? entry.parent_id : parentId;
      entities.push({
        id: entry.id, visual_entity_id: visualEntityId, kind: entry.kind, semantic_role: entry.semantic_role,
        hierarchy: entry.hierarchy, region: entry.region, parent_id: resolvedParent, persistent: visualEntityId !== null,
        safe: entry.kind === 'text', text: entry.text ? { ...entry.text, accent_words: entry.emphasis === 'PRIMARY' ? entry.text.value.split(/\s+/u).slice(0, 1) : [] } : null,
        shape: entry.shape, path: entry.path, mask: entry.mask, asset_ref: null, style: entry.style, surface: entry.surface,
        component_ref: { asset_id: asset.asset_id, component_id: entry.id, emphasis: entry.emphasis, focusable: entry.focusable, motion_order: entry.motion_order, group_key: entry.group_key, affordances: entry.affordances },
        transform: entry.transform,
      });
      provenance.push({ asset_id: asset.asset_id, component_id: entry.id, visual_entity_id: entry.id });
    }
  }
  return { ok: true, entities, preflight, provenance };
}
