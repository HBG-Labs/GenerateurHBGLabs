import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { canonicalJson } from '@motion-engine/core';
import { DIRECTOR_REGISTRY_FINGERPRINTS, VISUAL_DIRECTOR_FINGERPRINT } from '@motion-engine/visual-director-core';

import { buildP33ADirectionFixture } from '../integration/p3.3a-support.ts';

const workspace = path.resolve(import.meta.dirname, '..');
const output = path.join(workspace, 'visual-director-core', 'goldens', 'p3.3a', 'semantic-golden.json');
const update = process.argv.includes('--update');
const fixtures = (['science', 'product', 'problem_solution', 'editorial'] as const).map((kind) => {
  const fixture = buildP33ADirectionFixture(kind);
  return {
    kind,
    direction_plan: fixture.direction_plan,
    direction_preflight: fixture.direction_compile.direction_preflight,
    decision_trace: fixture.direction_compile.decision_trace,
    sequence_coherence: fixture.direction_compile.coherence,
    visual_plan: fixture.direction_compile.visual_plan,
    visual_preflight: fixture.direction_compile.visual_preflight,
    hashes: fixture.direction_compile.hashes,
  };
});
const golden = `${canonicalJson({ schema: 'p3.3a-semantic-golden', schema_version: '0.1.0', director: { fingerprint: VISUAL_DIRECTOR_FINGERPRINT, registries: DIRECTOR_REGISTRY_FINGERPRINTS }, fixtures })}\n`;
if (update) {
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, golden, 'utf8');
  process.stdout.write('Golden sémantique P3.3A mis à jour explicitement.\n');
} else {
  if (!existsSync(output)) throw new Error('Golden P3.3A absent. Utiliser explicitement golden:update:p3.3a.');
  if (readFileSync(output, 'utf8') !== golden) throw new Error('Dérive du golden P3.3A. La mise à jour doit être explicite.');
  process.stdout.write('Golden sémantique P3.3A vérifié.\n');
}
