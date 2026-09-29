import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { canonicalJson } from '@motion-engine/core';
import {
  PROCEDURAL_ASSET_GRAMMAR_FINGERPRINT,
  PROCEDURAL_ASSET_REGISTRY_FINGERPRINTS,
  buildAssetDiversityReport,
  buildProceduralAssetPreflight,
  hashProceduralAssetPlan,
  resolveProceduralAssetRequest,
  type ProceduralAssetRequest,
} from '@motion-engine/procedural-asset-core';

const workspace = path.resolve(import.meta.dirname, '..');
const output = path.join(workspace, 'procedural-asset-core', 'goldens', 'p3.3.5', 'semantic-golden.json');
const update = process.argv.includes('--update');

const cases: readonly Pick<ProceduralAssetRequest, 'family' | 'variant' | 'language' | 'material' | 'choreography'>[] = [
  { family: 'UI_CARD', variant: 'METRIC', language: 'UI', material: 'SOFT_SHADOW', choreography: 'PRODUCT_HERO' },
  { family: 'DASHBOARD', variant: 'CHART', language: 'UI', material: 'GRADIENT_LAYERED', choreography: 'PRODUCT_HERO' },
  { family: 'APP_SCREEN', variant: 'FEATURE', language: 'UI', material: 'GLASS_LIKE_SIMPLIFIED', choreography: 'PRODUCT_HERO' },
  { family: 'GENERIC_SMARTPHONE_FRAME', variant: 'PHONE', language: 'UI', material: 'SOFT_SHADOW', choreography: 'PRODUCT_HERO' },
  { family: 'DATA_CHART', variant: 'LINE', language: 'DATA', material: 'BORDERED', choreography: 'DATA_HERO' },
  { family: 'LIGHT_SYSTEM', variant: 'ATMOSPHERE', language: 'PROCEDURAL_ENVIRONMENT', material: 'LUMINOUS', choreography: 'ENVIRONMENT_FOCUS' },
  { family: 'POSTER_FRAME', variant: 'EDITORIAL', language: 'EDITORIAL', material: 'PAPER_LIKE', choreography: 'EDITORIAL_RECOMPOSE' },
] as const;

const plans = cases.map((entry, index) => resolveProceduralAssetRequest({
  request_id: `golden_request_${index}`,
  source_asset_intent_id: `golden_intent_${index}`,
  direction_plan_id: 'golden_direction_p335',
  scene_id: `golden_scene_${index}`,
  ...entry,
  semantic_role: index === 3 ? 'device_frame' : 'hero_asset',
  system_identity: entry.language === 'EDITORIAL' ? 'EDITORIAL_PRECISE' : entry.language === 'PROCEDURAL_ENVIRONMENT' ? 'EXPLAINER_LUMINOUS' : 'PRODUCT_POLISHED',
  material_language: entry.language === 'EDITORIAL' ? 'EDITORIAL_PAPER' : entry.language === 'PROCEDURAL_ENVIRONMENT' ? 'LUMINOUS_TECH' : 'SOFT_DIMENSIONAL',
  density: index % 3 === 0 ? 'SPACIOUS' : index % 3 === 1 ? 'BALANCED' : 'COMPACT',
  emphasis: 'PRIMARY',
  persistent: index === 3,
  seed: 3350 + index * 101,
  copy: { title: 'SYSTÈME VISUEL', label: 'PROGRESSION', value: '72%' },
  data: [0.22, 0.48, 0.37, 0.69, 0.82, 0.76],
}));

const golden = `${canonicalJson({
  schema: 'p3.3.5-semantic-golden',
  schema_version: '0.1.0',
  grammar_fingerprint: PROCEDURAL_ASSET_GRAMMAR_FINGERPRINT,
  registry_fingerprints: PROCEDURAL_ASSET_REGISTRY_FINGERPRINTS,
  plans: plans.map((plan) => ({ plan, preflight: buildProceduralAssetPreflight(plan), hash: hashProceduralAssetPlan(plan) })),
  diversity: buildAssetDiversityReport(plans),
})}\n`;

if (update) {
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, golden, 'utf8');
  process.stdout.write('Golden sémantique P3.3.5 mis à jour explicitement.\n');
} else {
  if (!existsSync(output)) throw new Error('Golden P3.3.5 absent. Utiliser explicitement golden:update:p3.3.5.');
  if (readFileSync(output, 'utf8') !== golden) throw new Error('Dérive du golden P3.3.5. La mise à jour doit être explicite.');
  process.stdout.write('Golden sémantique P3.3.5 vérifié.\n');
}
