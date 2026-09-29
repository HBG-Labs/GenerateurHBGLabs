import { hashVisualDocument } from '@motion-engine/visual-core';

import type { ProceduralAssetRequest } from './contracts.ts';

type Family = ProceduralAssetRequest['family'];
type Material = ProceduralAssetRequest['material'];

export interface AssetFamilyDefinition {
  readonly id: Family;
  readonly version: '1.0.0';
  readonly variants: readonly ProceduralAssetRequest['variant'][];
  readonly languages: readonly ProceduralAssetRequest['language'][];
  readonly affordances: readonly ProceduralAssetRequest['choreography'][];
  readonly render_cost: 'LOW' | 'MEDIUM' | 'HIGH';
}

const family = (id: Family, variants: readonly ProceduralAssetRequest['variant'][], languages: readonly ProceduralAssetRequest['language'][], affordances: readonly ProceduralAssetRequest['choreography'][], renderCost: AssetFamilyDefinition['render_cost']): AssetFamilyDefinition => ({ id, version: '1.0.0', variants, languages, affordances, render_cost: renderCost });

export const PROCEDURAL_ASSET_DEFINITIONS: readonly AssetFamilyDefinition[] = Object.freeze([
  family('UI_CARD', ['METRIC', 'FEATURE', 'STATUS', 'CHART'], ['UI', 'DATA'], ['PRODUCT_HERO', 'DATA_HERO'], 'LOW'),
  family('PANEL', ['FEATURE', 'STATUS'], ['UI', 'EDITORIAL'], ['PRODUCT_HERO'], 'LOW'),
  family('APP_SCREEN', ['PHONE', 'FEATURE'], ['UI'], ['PRODUCT_HERO'], 'MEDIUM'),
  family('DASHBOARD', ['CHART', 'METRIC'], ['UI', 'DATA'], ['PRODUCT_HERO', 'DATA_HERO'], 'HIGH'),
  family('DATA_CHART', ['BAR', 'LINE', 'DONUT'], ['DATA', 'UI'], ['DATA_HERO'], 'MEDIUM'),
  family('COUNTER', ['METRIC', 'STATUS'], ['DATA', 'UI'], ['DATA_HERO'], 'LOW'),
  family('GENERIC_SMARTPHONE_FRAME', ['PHONE'], ['UI'], ['PRODUCT_HERO'], 'HIGH'),
  family('BROWSER_FRAME', ['BROWSER'], ['UI'], ['PRODUCT_HERO'], 'MEDIUM'),
  family('GENERIC_PRODUCT_FRAME', ['PRODUCT'], ['UI', 'VECTOR_ILLUSTRATION'], ['PRODUCT_HERO'], 'MEDIUM'),
  family('PROCESS_DIAGRAM', ['PROCESS'], ['DATA', 'VECTOR_ILLUSTRATION'], ['DATA_HERO'], 'MEDIUM'),
  family('LIGHT_SYSTEM', ['ATMOSPHERE'], ['PROCEDURAL_ENVIRONMENT'], ['ENVIRONMENT_FOCUS'], 'MEDIUM'),
  family('PARTICLE_FIELD', ['ATMOSPHERE'], ['PROCEDURAL_ENVIRONMENT'], ['ENVIRONMENT_FOCUS'], 'MEDIUM'),
  family('ORBIT_SYSTEM', ['ORBIT'], ['PROCEDURAL_ENVIRONMENT', 'DATA'], ['ENVIRONMENT_FOCUS', 'DATA_HERO'], 'MEDIUM'),
  family('POSTER_FRAME', ['EDITORIAL'], ['EDITORIAL'], ['EDITORIAL_RECOMPOSE'], 'MEDIUM'),
  family('DECORATIVE_SYSTEM', ['GRID', 'ORBIT'], ['EDITORIAL', 'PROCEDURAL_ENVIRONMENT'], ['EDITORIAL_RECOMPOSE', 'ENVIRONMENT_FOCUS'], 'LOW'),
]);

export const MATERIAL_DEFINITIONS = Object.freeze([
  { id: 'FLAT', version: '1.0.0', support: 'SUPPORTED', layers: 1 },
  { id: 'GRADIENT_LAYERED', version: '1.0.0', support: 'SUPPORTED', layers: 3 },
  { id: 'SOFT_SHADOW', version: '1.0.0', support: 'SUPPORTED', layers: 2 },
  { id: 'BORDERED', version: '1.0.0', support: 'SUPPORTED', layers: 1 },
  { id: 'PAPER_LIKE', version: '1.0.0', support: 'SIMPLIFIED', layers: 2 },
  { id: 'GLASS_LIKE_SIMPLIFIED', version: '1.0.0', support: 'SIMPLIFIED', layers: 3 },
  { id: 'LUMINOUS', version: '1.0.0', support: 'SUPPORTED', layers: 3 },
  { id: 'MATTE', version: '1.0.0', support: 'SUPPORTED', layers: 1 },
] satisfies readonly { id: Material; version: string; support: string; layers: number }[]);

export const ICON_DEFINITIONS = Object.freeze(['CHECK', 'SPARK', 'CLOCK', 'TREND', 'GRID', 'ARROW', 'FOCUS', 'BELL'].map((id) => ({ id, version: '1.0.0', source: 'internal_path' })));
export const AFFORDANCE_DEFINITIONS = Object.freeze(['ASSEMBLE', 'EXPAND', 'EXTRACT', 'FOCUS', 'COLLAPSE', 'CARRY', 'DRAW', 'GROW', 'HIGHLIGHT', 'COMPARE', 'EXTRACT_SERIES', 'REASSEMBLE'].map((id) => ({ id, version: '1.0.0' })));
export const CHOREOGRAPHY_DEFINITIONS = Object.freeze([
  { id: 'PRODUCT_HERO', version: '1.0.0', stages: ['ASSEMBLE', 'FOCUS', 'EXTRACT', 'REASSEMBLE'] },
  { id: 'DATA_HERO', version: '1.0.0', stages: ['ASSEMBLE', 'FOCUS', 'EXPAND'] },
  { id: 'EDITORIAL_RECOMPOSE', version: '1.0.0', stages: ['ASSEMBLE', 'FOCUS', 'REASSEMBLE'] },
  { id: 'ENVIRONMENT_FOCUS', version: '1.0.0', stages: ['ASSEMBLE', 'FOCUS', 'EXPAND'] },
]);

export const PROCEDURAL_ASSET_REGISTRY = new Map(PROCEDURAL_ASSET_DEFINITIONS.map((entry) => [entry.id, entry]));
export const MATERIAL_REGISTRY = new Map(MATERIAL_DEFINITIONS.map((entry) => [entry.id, entry]));
export const ICON_REGISTRY = new Map(ICON_DEFINITIONS.map((entry) => [entry.id, entry]));

export const PROCEDURAL_ASSET_REGISTRY_FINGERPRINTS = Object.freeze({
  assets: hashVisualDocument(PROCEDURAL_ASSET_DEFINITIONS),
  materials: hashVisualDocument(MATERIAL_DEFINITIONS),
  icons: hashVisualDocument(ICON_DEFINITIONS),
  affordances: hashVisualDocument(AFFORDANCE_DEFINITIONS),
  choreographies: hashVisualDocument(CHOREOGRAPHY_DEFINITIONS),
});
export const PROCEDURAL_ASSET_GRAMMAR_FINGERPRINT = hashVisualDocument({ version: '0.1.0', registries: PROCEDURAL_ASSET_REGISTRY_FINGERPRINTS });
