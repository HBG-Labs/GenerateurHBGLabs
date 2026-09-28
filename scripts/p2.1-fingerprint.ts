import { readFileSync } from 'node:fs';
import path from 'node:path';

import { canonicalCreativeJson, validateCreativePlan } from '@motion-engine/creative-core';

const workspace = path.resolve(import.meta.dirname, '..');
const fixture = process.argv[2] ?? path.join(workspace, 'creative-core', 'fixtures', 'hypothetical.creative-plan.json');
const input = JSON.parse(readFileSync(fixture, 'utf8')) as unknown;
const result = validateCreativePlan(input);
if (!result.ok || !result.value || !result.canonical_sha256) {
  process.stderr.write(`${canonicalCreativeJson(result.report)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${canonicalCreativeJson({
      canonical_sha256: result.canonical_sha256,
      diagnostics: result.report.diagnostics,
      preflight: result.report,
      stable_ids: {
        plan: result.value.plan_id,
        scenes: result.value.scenes.map((scene) => scene.id),
        assets: result.value.asset_intents.map((asset) => asset.id),
      },
    })}\n`,
  );
}
