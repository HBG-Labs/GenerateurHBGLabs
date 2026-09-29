import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { canonicalJson, hashDocument } from '@motion-engine/core';

import { buildP17Pipeline } from '../integration/p1.7-support.ts';
import { WORKSPACE } from '../integration/support.ts';

const output = path.join(WORKSPACE, 'core', 'goldens', 'p1.7', 'semantic-golden.json');
const fixture = buildP17Pipeline();
const golden = canonicalJson({
  schema: 'p1.7-semantic-golden',
  schema_version: '0.1.0',
  contracts: { render_plan: fixture.pipeline.render_plan.schema_version, compiler: fixture.pipeline.render_plan.compiler_version },
  hashes: {
    spec: hashDocument(fixture.spec),
    render_plan: fixture.pipeline.hashes.render_plan,
    audio_plan: fixture.pipeline.hashes.audio_plan,
    subtitle_plan: fixture.pipeline.hashes.subtitle_plan,
    dependency_graph: fixture.pipeline.hashes.dependency_graph,
  },
  capabilities: fixture.pipeline.render_plan.requirements.capabilities,
  preflight: fixture.pipeline.preflight,
});

if (process.argv.includes('--update')) {
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${golden}\n`, 'utf8');
  process.stdout.write('Golden sémantique P1.7 mis à jour explicitement.\n');
} else {
  if (!existsSync(output)) throw new Error('Golden P1.7 absent. Utiliser explicitement golden:update:p1.7.');
  if (readFileSync(output, 'utf8').trim() !== golden) throw new Error('Dérive du golden P1.7. La mise à jour doit être explicite.');
  process.stdout.write('Golden sémantique P1.7 vérifié.\n');
}
