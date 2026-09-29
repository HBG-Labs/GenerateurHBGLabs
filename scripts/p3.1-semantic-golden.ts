import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

const output = path.join(WORKSPACE, 'visual-compiler', 'goldens', 'p3.1', 'semantic-golden.json');
const pipeline = buildP31Pipeline();
const golden = canonicalJson({
  schema: 'p3.1-semantic-golden', schema_version: '0.1.0',
  grammar: { version: ACTIVE_VISUAL_GRAMMAR.version, sha256: ACTIVE_VISUAL_GRAMMAR.fingerprint, registries: VISUAL_REGISTRY_FINGERPRINTS },
  registry_definitions: {
    patterns: VISUAL_PATTERN_DEFINITIONS.map(({ id, version, support, resolver }) => ({ id, version, support, resolver })),
    phrases: MOTION_PHRASE_DEFINITIONS.map(({ id, version, phases, resolver }) => ({ id, version, phases, resolver })),
    bridges: SCENE_BRIDGE_DEFINITIONS.map(({ id, version, support, resolver }) => ({ id, version, support, resolver })),
    cameras: CAMERA_DEFINITIONS.map(({ id, version, support, resolver }) => ({ id, version, support, resolver })),
  },
  hashes: {
    creative_plan: pipeline.visual_plan.source.creative_plan_sha256,
    visual_plan: hashVisualDocument(pipeline.visual_plan),
    motion_spec: pipeline.visual_compile.hashes.motion_spec,
    compiler: pipeline.visual_compile.hashes.compiler_fingerprint,
    render_plan: pipeline.p1.hashes.render_plan,
  },
  structure: {
    duration_frames: pipeline.p1.render_plan.canvas.duration_frames,
    scenes: pipeline.visual_plan.scenes.map((scene) => ({
      id: scene.id, source_scene_id: scene.source_scene_id, layout: scene.layout, focus: scene.visual_focus_id,
      patterns: scene.patterns.map((entry) => entry.pattern_id), phrases: scene.motion_phrases.map((entry) => entry.phrase_id),
      camera: scene.camera_moves.map((entry) => entry.camera_id), depth_layers: scene.depth_layers.length,
    })),
    bridges: pipeline.visual_plan.bridges.map(({ bridge_id, source_scene_id, destination_scene_id, visual_entity_id }) => ({ bridge_id, source_scene_id, destination_scene_id, visual_entity_id })),
  },
  visual_preflight: pipeline.visual_compile.preflight,
  p1_preflight: pipeline.p1.preflight,
  diversity: pipeline.diversity,
});

if (process.argv.includes('--update')) {
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${golden}\n`, 'utf8');
  process.stdout.write('Golden sémantique P3.1 mis à jour explicitement.\n');
} else {
  if (!existsSync(output)) throw new Error('Golden P3.1 absent. Utiliser explicitement golden:update:p3.1.');
  if (readFileSync(output, 'utf8').trim() !== golden) throw new Error('Dérive du golden P3.1. La mise à jour doit être explicite.');
  process.stdout.write('Golden sémantique P3.1 vérifié.\n');
}
