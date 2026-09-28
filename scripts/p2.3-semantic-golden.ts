import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { canonicalJson } from '@motion-engine/core';
import { planCreativeStory } from '@motion-engine/creative-core';

import { buildP23Pipeline, type P23FixtureName } from '../integration/p2.3-support.ts';
import { WORKSPACE, readJson } from '../integration/support.ts';

const output = path.join(WORKSPACE, 'creative-compiler', 'goldens', 'p2.3', 'semantic-goldens.json');
const fixtureNames: readonly P23FixtureName[] = [
  'hypothetical-30s', 'explainer-30s', 'product-demo-20s', 'minimal-5s', 'long-60s',
];

const primary = Object.fromEntries(['signal', 'nocturne'].map((style) => {
  const pipeline = buildP23Pipeline('hypothetical-30s', style as 'signal' | 'nocturne');
  return [style, {
    motion_spec: pipeline.creative_compile.motion_spec,
    provenance: pipeline.creative_compile.provenance,
    compiler_fingerprint: pipeline.creative_compile.compiler_fingerprint,
    diagnostics: pipeline.creative_compile.report.diagnostics,
    hashes: pipeline.creative_compile.report.hashes,
    p1_hashes: pipeline.p1.hashes,
    p1_preflight: pipeline.p1.preflight,
  }];
}));

const fixtures = Object.fromEntries(fixtureNames.map((name) => {
  const pipeline = buildP23Pipeline(name, 'signal');
  return [name, {
    creative_plan_sha256: pipeline.creative_compile.report.hashes.creative_plan,
    resolution_sha256: pipeline.creative_compile.report.hashes.resolution,
    motion_spec_sha256: pipeline.creative_compile.report.hashes.motion_spec,
    provenance_sha256: pipeline.creative_compile.report.hashes.provenance,
    compiler_fingerprint: pipeline.creative_compile.compiler_fingerprint,
    render_plan_sha256: pipeline.p1.hashes.render_plan,
    duration_frames: pipeline.p1.render_plan.canvas.duration_frames,
  }];
}));

const invalidPlanning = planCreativeStory(readJson('creative-core/fixtures/planner/invalid.planner-input.json'));
const invalid = {
  planner_ok: invalidPlanning.ok,
  creative_plan: invalidPlanning.creative_plan,
  diagnostics: invalidPlanning.report?.diagnostics ?? invalidPlanning.input_validation.diagnostics,
};

const golden = canonicalJson({
  schema: 'p2.3-semantic-goldens',
  schema_version: '0.1.0',
  primary,
  fixtures,
  invalid,
});

if (process.argv.includes('--update')) {
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${golden}\n`, 'utf8');
  process.stdout.write('Goldens sémantiques P2.3 mis à jour explicitement.\n');
} else {
  if (!existsSync(output)) throw new Error('Golden P2.3 absent. Utiliser explicitement golden:update:p2.3.');
  const current = readFileSync(output, 'utf8').trim();
  if (current !== golden) throw new Error('Dérive des goldens P2.3. La mise à jour doit être explicite.');
  process.stdout.write('Goldens sémantiques P2.3 vérifiés.\n');
}
