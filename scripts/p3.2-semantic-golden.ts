import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { canonicalJson } from '@motion-engine/core';
import { P32_VISUAL_GRAMMAR, P32_VISUAL_REGISTRY_FINGERPRINTS } from '@motion-engine/visual-core';

import { buildP32Pipeline } from '../integration/p3.2-support.ts';

const workspace = path.resolve(import.meta.dirname, '..');
const output = path.join(workspace, 'visual-compiler', 'goldens', 'p3.2', 'semantic-golden.json');
const update = process.argv.includes('--update');
const pipeline = buildP32Pipeline();
const golden = `${canonicalJson({
  grammar: { version: P32_VISUAL_GRAMMAR.version, sha256: P32_VISUAL_GRAMMAR.fingerprint },
  registries: P32_VISUAL_REGISTRY_FINGERPRINTS,
  visual_plan: pipeline.visual_plan,
  visual_preflight: pipeline.visual_compile.preflight,
  diversity: pipeline.diversity,
  motion_spec_sha256: pipeline.visual_compile.hashes.motion_spec,
  render_plan_sha256: pipeline.p1.hashes.render_plan,
  requirements: pipeline.p1.render_plan.requirements,
})}\n`;

if (update) {
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, golden, 'utf8');
  process.stdout.write('Golden sémantique P3.2 mis à jour explicitement.\n');
} else {
  if (!existsSync(output)) throw new Error('Golden P3.2 absent. Utiliser explicitement golden:update:p3.2.');
  if (readFileSync(output, 'utf8') !== golden) throw new Error('Dérive du golden P3.2. La mise à jour doit être explicite.');
  process.stdout.write('Golden sémantique P3.2 vérifié.\n');
}
