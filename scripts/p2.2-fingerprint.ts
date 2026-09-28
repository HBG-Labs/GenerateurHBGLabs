import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  canonicalCreativeJson,
  DEFAULT_ARCHETYPE_REGISTRY,
  hashCreativeDocument,
  planCreativeStory,
} from '@motion-engine/creative-core';

const workspace = path.resolve(import.meta.dirname, '..');
const fixture =
  process.argv[2] ?? path.join(workspace, 'creative-core', 'fixtures', 'planner', 'hypothetical-30s.planner-input.json');
const input = JSON.parse(readFileSync(fixture, 'utf8')) as unknown;
const result = planCreativeStory(input);
if (!result.report || !result.creative_plan || !result.creative_validation?.canonical_sha256) {
  process.stderr.write(`${canonicalCreativeJson({ input_validation: result.input_validation, report: result.report })}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${canonicalCreativeJson({
      planner_input_sha256: result.report.planner_input_sha256,
      registry_fingerprint: DEFAULT_ARCHETYPE_REGISTRY.fingerprint(),
      beats: result.report.beats,
      scenes: result.report.scenes,
      durations: result.report.scenes.map((scene) => scene.duration_ms),
      content_slots: result.content_slots,
      creative_plan_sha256: result.creative_validation.canonical_sha256,
      planning_report_sha256: hashCreativeDocument(result.report),
    })}\n`,
  );
}
