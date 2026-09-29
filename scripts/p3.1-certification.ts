import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { canonicalJson } from '@motion-engine/core';
import {
  ACTIVE_VISUAL_GRAMMAR,
  CAMERA_DEFINITIONS,
  MOTION_PHRASE_DEFINITIONS,
  SCENE_BRIDGE_DEFINITIONS,
  VISUAL_PATTERN_DEFINITIONS,
  VISUAL_REGISTRY_FINGERPRINTS,
  hashVisualDocument,
} from '@motion-engine/visual-core';

import { buildP31Pipeline } from '../integration/p3.1-support.ts';
import { WORKSPACE } from '../integration/support.ts';

const started = performance.now();
const pipeline = buildP31Pipeline();
const output = path.join(WORKSPACE, 'out', 'p3.1', 'certification');
mkdirSync(output, { recursive: true });
const report = {
  schema: 'p3.1-offline-certification', schema_version: '0.1.0',
  technical_status: pipeline.visual_compile.preflight.summary.errors === 0 && (pipeline.p1.preflight.summary?.errors ?? 0) === 0 ? 'PASS' : 'BLOCKED',
  human_visual_review_required: true,
  provider_calls: 0, local_gpu_required: false,
  hashes: {
    grammar: ACTIVE_VISUAL_GRAMMAR.fingerprint, registries: VISUAL_REGISTRY_FINGERPRINTS,
    visual_plan: hashVisualDocument(pipeline.visual_plan), motion_spec: pipeline.visual_compile.hashes.motion_spec,
    render_plan: pipeline.p1.hashes.render_plan,
  },
  registries: {
    patterns: VISUAL_PATTERN_DEFINITIONS.length, phrases: MOTION_PHRASE_DEFINITIONS.length,
    bridges: SCENE_BRIDGE_DEFINITIONS.length, cameras: CAMERA_DEFINITIONS.length,
  },
  preflight: { visual: pipeline.visual_compile.preflight, p1: pipeline.p1.preflight },
  diversity: pipeline.diversity,
  compile_ms: performance.now() - started,
};
writeFileSync(path.join(output, 'offline-certification.json'), `${canonicalJson(report)}\n`, 'utf8');
process.stdout.write(`P3.1 offline certification: ${report.technical_status}\n`);
if (report.technical_status !== 'PASS') process.exitCode = 1;
