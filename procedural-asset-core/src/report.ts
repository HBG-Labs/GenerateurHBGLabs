import { AssetDiversityReportSchema } from './contracts.ts';
import type { AssetDiversityReport, ProceduralAssetPlan } from './contracts.ts';

export function buildAssetDiversityReport(plans: readonly ProceduralAssetPlan[]): AssetDiversityReport {
  const assets = plans.flatMap((plan) => plan.assets);
  const countByFamily = new Map<string, number>();
  for (const asset of assets) countByFamily.set(asset.asset_type, (countByFamily.get(asset.asset_type) ?? 0) + 1);
  return AssetDiversityReportSchema.parse({
    schema: 'asset-diversity-report', schema_version: '0.1.0', plan_ids: plans.map((plan) => plan.plan_id),
    families: [...new Set(assets.map((entry) => entry.asset_type))].sort(), materials: [...new Set(assets.map((entry) => entry.material))].sort(), languages: [...new Set(assets.map((entry) => entry.language))].sort(),
    component_count: assets.reduce((sum, asset) => sum + asset.components.length, 0),
    focusable_count: assets.reduce((sum, asset) => sum + asset.components.filter((entry) => entry.focusable).length, 0),
    icon_count: assets.reduce((sum, asset) => sum + asset.components.filter((entry) => entry.icon_id !== null).length, 0),
    data_system_count: assets.filter((entry) => entry.language === 'DATA' || ['DATA_CHART', 'DASHBOARD', 'COUNTER'].includes(entry.asset_type)).length,
    environment_system_count: assets.filter((entry) => entry.language === 'PROCEDURAL_ENVIRONMENT').length,
    repetitions: [...countByFamily.entries()].filter(([, count]) => count > 1).map(([family, count]) => ({ family, count })),
  });
}

export function componentTree(plan: ProceduralAssetPlan): readonly { asset_id: string; tree: readonly { id: string; parent_id: string | null; semantic_role: string; focusable: boolean; emphasis: string }[] }[] {
  return plan.assets.map((asset) => ({ asset_id: asset.asset_id, tree: asset.components.map((entry) => ({ id: entry.id, parent_id: entry.parent_id, semantic_role: entry.semantic_role, focusable: entry.focusable, emphasis: entry.emphasis })) }));
}
