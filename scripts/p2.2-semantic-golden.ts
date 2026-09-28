import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { canonicalCreativeJson, planCreativeStory } from '@motion-engine/creative-core';

const workspace = path.resolve(import.meta.dirname, '..');
const fixturesRoot = path.join(workspace, 'creative-core', 'fixtures', 'planner');
const goldenFile = path.join(workspace, 'creative-core', 'goldens', 'p2.2', 'semantic-goldens.json');
const fixtureNames = ['hypothetical-30s', 'explainer-30s', 'product-demo-20s', 'minimal-5s', 'long-60s', 'invalid'] as const;

function build() {
  return {
    schema: 'p2.2-semantic-goldens',
    schema_version: '0.1.0',
    fixtures: Object.fromEntries(
      fixtureNames.map((name) => {
        const input = JSON.parse(readFileSync(path.join(fixturesRoot, `${name}.planner-input.json`), 'utf8')) as unknown;
        const result = planCreativeStory(input);
        return [
          name,
          {
            canonical_planner_input: canonicalCreativeJson(input),
            planner_input_sha256: result.input_validation.planner_input_sha256,
            input_validation: result.input_validation,
            beats: result.report?.beats ?? [],
            scenes: result.report?.scenes ?? [],
            duration: result.report?.duration ?? null,
            content_slots: result.content_slots,
            creative_plan_sha256: result.creative_validation?.canonical_sha256 ?? null,
            planning_report: result.report,
          },
        ];
      }),
    ),
  };
}

const actual = `${canonicalCreativeJson(build())}\n`;
if (process.argv.includes('--update')) {
  mkdirSync(path.dirname(goldenFile), { recursive: true });
  writeFileSync(goldenFile, actual, 'utf8');
  process.stdout.write('Goldens sémantiques P2.2 mis à jour explicitement.\n');
} else {
  if (!existsSync(goldenFile)) throw new Error('Golden P2.2 absent. Utiliser --update explicitement.');
  const expected = readFileSync(goldenFile, 'utf8');
  if (actual !== expected) {
    throw new Error('Dérive des goldens P2.2 détectée. Examiner la différence avant toute mise à jour explicite.');
  }
  process.stdout.write('Goldens sémantiques P2.2 vérifiés.\n');
}
