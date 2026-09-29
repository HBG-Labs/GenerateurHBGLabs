import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { canonicalJson } from '@motion-engine/core';
import { P32_VISUAL_COMPILER_VERSION } from '@motion-engine/visual-compiler';
import {
  P32_CAMERA_DEFINITIONS,
  P32_MOTION_PHRASE_DEFINITIONS,
  P32_SCENE_BRIDGE_DEFINITIONS,
  P32_VISUAL_GRAMMAR,
  P32_VISUAL_PATTERN_DEFINITIONS,
  P32_VISUAL_REGISTRY_FINGERPRINTS,
  hashVisualDocument,
} from '@motion-engine/visual-core';

import { buildP32Pipeline } from '../integration/p3.2-support.ts';
import { WORKSPACE } from '../integration/support.ts';

function trackProperties(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(trackProperties);
  if (value === null || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return [typeof record['property'] === 'string' ? record['property'] : null, ...Object.values(record).flatMap(trackProperties)]
    .filter((entry): entry is string => entry !== null);
}

const started = performance.now();
const pipeline = buildP32Pipeline();
const properties = trackProperties(pipeline.p1.render_plan);
const requiredDynamicProperties = ['tracking_px', 'font_axis.wght', 'font_axis.wdth'];
const dynamicTypographyPass = requiredDynamicProperties.every((property) => properties.includes(property));
const output = path.join(WORKSPACE, 'out', 'p3.2', 'certification');
mkdirSync(output, { recursive: true });
const preflightPass = pipeline.visual_compile.preflight.summary.errors === 0 && (pipeline.p1.preflight.summary?.errors ?? 0) === 0;
const report = {
  schema: 'p3.2-offline-certification', schema_version: '0.1.0',
  technical_status: preflightPass && dynamicTypographyPass ? 'PASS' : 'BLOCKED',
  human_visual_review_required: true,
  provider_calls: 0, local_gpu_required: false, network_required: false,
  versions: { visual_plan: pipeline.visual_plan.schema_version, visual_grammar: P32_VISUAL_GRAMMAR.version, visual_compiler: P32_VISUAL_COMPILER_VERSION, render_plan: pipeline.p1.render_plan.schema_version },
  hashes: {
    grammar: P32_VISUAL_GRAMMAR.fingerprint, registries: P32_VISUAL_REGISTRY_FINGERPRINTS,
    visual_plan: hashVisualDocument(pipeline.visual_plan), motion_spec: pipeline.visual_compile.hashes.motion_spec,
    render_plan: pipeline.p1.hashes.render_plan,
  },
  registries: {
    patterns: P32_VISUAL_PATTERN_DEFINITIONS.length, phrases: P32_MOTION_PHRASE_DEFINITIONS.length,
    bridges: P32_SCENE_BRIDGE_DEFINITIONS.length, cameras: P32_CAMERA_DEFINITIONS.length,
  },
  vocabulary: {
    morph_chains: pipeline.visual_plan.scenes.reduce((sum, scene) => sum + (scene.morph_chains?.length ?? 0), 0),
    causal_relations: pipeline.visual_plan.scenes.reduce((sum, scene) => sum + (scene.causal_relations?.length ?? 0), 0),
    camera_continuities: pipeline.visual_plan.camera_continuities?.length ?? 0,
    dynamic_typography_properties: [...new Set(properties.filter((property) => property === 'tracking_px' || property.startsWith('font_axis.')))].sort(),
  },
  preflight: { visual: pipeline.visual_compile.preflight, p1: pipeline.p1.preflight },
  diversity: pipeline.diversity,
  compile_ms: performance.now() - started,
};
writeFileSync(path.join(output, 'offline-certification.json'), `${canonicalJson(report)}\n`, 'utf8');
process.stdout.write(`P3.2 offline certification: ${report.technical_status}\n`);
if (report.technical_status !== 'PASS') process.exitCode = 1;
