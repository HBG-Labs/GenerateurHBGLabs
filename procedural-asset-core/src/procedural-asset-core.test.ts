import { describe, expect, it } from 'vitest';

import {
  PROCEDURAL_ASSET_DEFINITIONS,
  PROCEDURAL_ASSET_LIMITS,
  PROCEDURAL_ASSET_REGISTRY_FINGERPRINTS,
  buildAssetDiversityReport,
  buildProceduralAssetPreflight,
  compileProceduralAssetPlan,
  hashProceduralAssetPlan,
  readProceduralAssetPlanVersioned,
  resolveProceduralAssetRequest,
  type ProceduralAssetRequest,
} from './index.ts';

function request(overrides: Partial<ProceduralAssetRequest> = {}): ProceduralAssetRequest {
  return {
    request_id: 'asset_request_fixture', source_asset_intent_id: 'asset_intent_fixture', direction_plan_id: 'direction_fixture', scene_id: 'scene_fixture',
    family: 'GENERIC_SMARTPHONE_FRAME', variant: 'PHONE', semantic_role: 'device_frame', language: 'UI', system_identity: 'PRODUCT_POLISHED',
    material_language: 'SOFT_DIMENSIONAL', material: 'GLASS_LIKE_SIMPLIFIED', density: 'BALANCED', emphasis: 'PRIMARY', choreography: 'PRODUCT_HERO',
    persistent: true, seed: 3350, copy: { title: 'Espace de travail', label: 'AUJOURD’HUI', value: '72%' }, data: [0.2, 0.42, 0.35, 0.66, 0.82], ...overrides,
  };
}

describe('Procedural Asset Core P3.3.5', () => {
  it('résout un device structuré, adressable et déterministe', () => {
    const first = resolveProceduralAssetRequest(request());
    const second = resolveProceduralAssetRequest(request());
    expect(first).toEqual(second);
    expect(hashProceduralAssetPlan(first)).toBe(hashProceduralAssetPlan(second));
    expect(first.assets[0]!.components.length).toBeGreaterThan(10);
    expect(first.assets[0]!.components.some((entry) => entry.semantic_role === 'metric_trend' && entry.kind === 'path')).toBe(true);
    expect(first.assets[0]!.components.some((entry) => entry.semantic_role === 'card_value' && entry.focusable)).toBe(true);
    expect(first.assets[0]!.components.some((entry) => entry.semantic_role === 'app_screen')).toBe(true);
    expect(buildProceduralAssetPreflight(first).summary.errors).toBe(0);
    const compiled = compileProceduralAssetPlan(first, 'composition_root');
    expect(compiled.ok).toBe(true);
    expect(compiled.entities).toHaveLength(first.assets[0]!.components.length);
    expect(compiled.entities.every((entry) => entry.component_ref?.asset_id === first.assets[0]!.asset_id)).toBe(true);
  });

  it('couvre les familles prioritaires UI, data, science et éditorial', () => {
    const cases: readonly Partial<ProceduralAssetRequest>[] = [
      { family: 'APP_SCREEN', variant: 'FEATURE', language: 'UI', choreography: 'PRODUCT_HERO' },
      { family: 'DASHBOARD', variant: 'CHART', language: 'UI', choreography: 'DATA_HERO' },
      { family: 'DATA_CHART', variant: 'LINE', language: 'DATA', choreography: 'DATA_HERO' },
      { family: 'LIGHT_SYSTEM', variant: 'ATMOSPHERE', language: 'PROCEDURAL_ENVIRONMENT', choreography: 'ENVIRONMENT_FOCUS', system_identity: 'EXPLAINER_LUMINOUS', material_language: 'LUMINOUS_TECH', material: 'LUMINOUS' },
      { family: 'POSTER_FRAME', variant: 'EDITORIAL', language: 'EDITORIAL', choreography: 'EDITORIAL_RECOMPOSE', system_identity: 'EDITORIAL_PRECISE', material_language: 'EDITORIAL_PAPER', material: 'PAPER_LIKE' },
    ];
    const plans = cases.map((entry, index) => resolveProceduralAssetRequest(request({ ...entry, request_id: `asset_request_${index}`, source_asset_intent_id: `asset_intent_${index}` })));
    expect(plans.every((plan) => buildProceduralAssetPreflight(plan).summary.errors === 0)).toBe(true);
    expect(buildAssetDiversityReport(plans)).toMatchObject({ component_count: expect.any(Number), data_system_count: 2, environment_system_count: 1 });
  });

  it('applique de façon cohérente density, hierarchy et identity sans changer les IDs', () => {
    const compact = resolveProceduralAssetRequest(request({ density: 'COMPACT', emphasis: 'PRIMARY' }));
    const spacious = resolveProceduralAssetRequest(request({ density: 'SPACIOUS', emphasis: 'SECONDARY' }));
    expect(compact.assets[0]!.components.map((entry) => entry.id)).toEqual(spacious.assets[0]!.components.map((entry) => entry.id));
    expect(compact.assets[0]!.components[0]!.transform.scale).toBeGreaterThan(spacious.assets[0]!.components[0]!.transform.scale);
    expect(compact.assets[0]!.components[0]!.emphasis).toBe('PRIMARY');
    expect(spacious.assets[0]!.components[0]!.emphasis).toBe('SECONDARY');
  });

  it('préserve la structure entre deux matériaux supportés', () => {
    const glass = resolveProceduralAssetRequest(request({ material: 'GLASS_LIKE_SIMPLIFIED' }));
    const flat = resolveProceduralAssetRequest(request({ material: 'FLAT', material_language: 'CLEAN_FLAT' }));
    expect(glass.assets[0]!.components.map((entry) => entry.id)).toEqual(flat.assets[0]!.components.map((entry) => entry.id));
    expect(buildProceduralAssetPreflight(glass).diagnostics.some((entry) => entry.code === 'asset.material.simplified')).toBe(true);
  });

  it('refuse familles, variantes et choreographies hors registre', () => {
    expect(() => resolveProceduralAssetRequest({ ...request(), family: 'ARBITRARY_ASSET' })).toThrow();
    expect(() => resolveProceduralAssetRequest(request({ family: 'UI_CARD', variant: 'PHONE' }))).toThrow('unsupported_variant');
    expect(() => resolveProceduralAssetRequest(request({ choreography: 'DATA_HERO' }))).toThrow('unsupported_choreography');
  });

  it('rejette champs inconnus, code, URL, SVG libre et valeurs non finies', () => {
    const plan = resolveProceduralAssetRequest(request());
    for (const unsafe of [
      { ...plan, code: 'eval(1)' }, { ...plan, url: 'https://example.test/a' }, { ...plan, svg: '<script>alert(1)</script>' },
      { ...plan, assets: [{ ...plan.assets[0], seed: Number.NaN }] },
    ]) {
      const report = buildProceduralAssetPreflight(unsafe);
      expect(report.eligible_for_compilation).toBe(false);
      expect(report.summary.errors).toBeGreaterThan(0);
    }
  });

  it('refuse payload cyclique, profondeur excessive et IDs dupliqués', () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(buildProceduralAssetPreflight(cyclic).diagnostics[0]?.code).toBe('asset.security.cyclic_payload');
    let deep: unknown = { value: true };
    for (let index = 0; index < 40; index += 1) deep = { nested: deep };
    expect(buildProceduralAssetPreflight(deep).diagnostics[0]?.code).toBe('asset.security.excessive_payload_depth');
    const plan = resolveProceduralAssetRequest(request());
    const duplicate = structuredClone(plan);
    duplicate.assets[0]!.components[1]!.id = duplicate.assets[0]!.components[0]!.id;
    expect(buildProceduralAssetPreflight(duplicate).diagnostics.some((entry) => entry.code === 'asset.component.duplicate_id')).toBe(true);
  });

  it('accepte la limite de composants et refuse limite + 1 avec diagnostic structuré', () => {
    const plan = structuredClone(resolveProceduralAssetRequest(request({ family: 'UI_CARD', variant: 'METRIC' })));
    const asset = plan.assets[0]!;
    const root = asset.components[0]!;
    while (asset.components.length < PROCEDURAL_ASSET_LIMITS.max_components_per_asset) {
      const index = asset.components.length;
      asset.components.push({ ...asset.components[1]!, id: `filler_component_${index}`, parent_id: root.id, semantic_role: 'bounded_filler', motion_order: index, focusable: false, decorative: true, icon_id: null, affordances: [] });
    }
    asset.contribution.layers = asset.components.length;
    asset.contribution.potential_tracks = 0;
    expect(buildProceduralAssetPreflight(plan).summary.errors).toBe(0);
    const over = structuredClone(plan) as unknown as { assets: { components: unknown[] }[] };
    over.assets[0]!.components.push({ ...over.assets[0]!.components[1] as object, id: 'filler_component_64' });
    const report = buildProceduralAssetPreflight(over);
    expect(report.summary.errors).toBeGreaterThan(0);
    expect(report.diagnostics.every((entry) => typeof entry.code === 'string' && entry.path.startsWith('$'))).toBe(true);
  });

  it('versionne séparément plan, registres et migration infrastructure', () => {
    const plan = resolveProceduralAssetRequest(request());
    expect(readProceduralAssetPlanVersioned(plan)).toEqual(plan);
    expect(() => readProceduralAssetPlanVersioned({ ...plan, schema_version: '9.9.9' })).toThrow('path_missing');
    expect(PROCEDURAL_ASSET_DEFINITIONS).toHaveLength(15);
    expect(Object.values(PROCEDURAL_ASSET_REGISTRY_FINGERPRINTS).every((entry) => /^[a-f0-9]{64}$/u.test(entry))).toBe(true);
  });
});
