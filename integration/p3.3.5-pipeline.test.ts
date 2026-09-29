import { describe, expect, it } from 'vitest';

import { compileProceduralAssetPlan, PROCEDURAL_ASSET_LIMITS, PROCEDURAL_ASSET_REGISTRY_FINGERPRINTS } from '@motion-engine/procedural-asset-core';

import { buildP335Pipeline } from './p3.3.5-support.ts';

describe('P3.3.5 — Procedural Visual Asset Grammar', () => {
  it('résout Product/App jusqu’au RenderPlan avec 0 ERROR', () => {
    const pipeline = buildP335Pipeline('product', 0.25);
    expect(pipeline.procedural_asset_plans).toHaveLength(4);
    expect(pipeline.asset_preflights.every((report) => report.summary.errors === 0)).toBe(true);
    expect(pipeline.direction_compile.direction_preflight.summary.errors).toBe(0);
    expect(pipeline.visual_compile.preflight.summary.errors).toBe(0);
    expect(pipeline.p1.preflight.summary?.errors ?? 0).toBe(0);
    expect(pipeline.p1.render_plan.canvas).toMatchObject({ width: 270, height: 480, fps: 30 });
  });

  it('produit une matière structurée et ciblable au niveau composant', () => {
    const pipeline = buildP335Pipeline('product', 0.25);
    const assets = pipeline.procedural_asset_plans.flatMap((plan) => plan.assets);
    expect(new Set(assets.map((asset) => asset.asset_type))).toEqual(new Set(['GENERIC_SMARTPHONE_FRAME', 'APP_SCREEN', 'DASHBOARD', 'DATA_CHART']));
    expect(assets.reduce((sum, asset) => sum + asset.components.length, 0)).toBeGreaterThan(40);
    expect(assets.some((asset) => asset.components.some((component) => component.semantic_role === 'chart_series' && component.focusable))).toBe(true);
    expect(assets.some((asset) => asset.components.some((component) => component.affordances.includes('EXTRACT')))).toBe(true);
    expect(pipeline.visual_plan.scenes.flatMap((scene) => scene.entities).filter((entity) => entity.component_ref).length).toBeGreaterThan(40);
    expect(JSON.stringify(pipeline.p1.render_plan)).toContain('asset_component_');
  });

  it('respecte les limites mesurées et publie les empreintes séparées', () => {
    const pipeline = buildP335Pipeline('product', 0.25);
    expect(Math.max(...pipeline.procedural_asset_plans.flatMap((plan) => plan.assets.map((asset) => asset.components.length)))).toBeLessThanOrEqual(PROCEDURAL_ASSET_LIMITS.max_components_per_asset);
    expect(Object.values(PROCEDURAL_ASSET_REGISTRY_FINGERPRINTS).every((hash) => /^[a-f0-9]{64}$/u.test(hash))).toBe(true);
  });

  it('rejoue chaque ProceduralAssetPlan sans Director ni provider', () => {
    const pipeline = buildP335Pipeline('product', 0.25);
    for (const plan of pipeline.procedural_asset_plans) {
      const first = compileProceduralAssetPlan(plan, 'replay_root');
      const second = compileProceduralAssetPlan(structuredClone(plan), 'replay_root');
      expect(first).toEqual(second);
      expect(first.ok).toBe(true);
    }
  });

  it('conserve les plans P3.3A valides via le resolver historique par défaut', async () => {
    const { buildP33APipeline } = await import('./p3.3a-support.ts');
    const baseline = buildP33APipeline('product', 0.25);
    expect(baseline.direction_compile.visual_plan?.schema_version).toBe('0.2.0');
    expect(baseline.visual_compile.preflight.summary.errors).toBe(0);
    expect(baseline.p1.preflight.summary?.errors ?? 0).toBe(0);
  });
});
