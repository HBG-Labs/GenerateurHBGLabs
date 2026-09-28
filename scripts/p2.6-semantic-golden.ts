import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { canonicalJson, hashDocument } from '@motion-engine/core';
import { replayCreativeGateway } from '@motion-engine/creative-gateway';

import {
  P26_CERTIFICATION_MATRIX,
  buildP26GatewayRun,
  compileP26GatewayResult,
  p26ReadingPolicy,
} from '../integration/p2.6-support.ts';
import { WORKSPACE } from '../integration/support.ts';

const cases = [];
for (const entry of P26_CERTIFICATION_MATRIX) {
  const gateway = await buildP26GatewayRun(entry);
  if (!gateway.snapshot) throw new Error(`Snapshot P2.6 absent pour ${entry.id}.`);
  const direct = compileP26GatewayResult(gateway);
  const replayGateway = replayCreativeGateway(gateway.snapshot, { reading_policy: p26ReadingPolicy() });
  const replay = compileP26GatewayResult(replayGateway);
  cases.push({
    id: entry.id,
    label: entry.label,
    expected_archetype: entry.expected_archetype,
    target_duration_ms: entry.request.target_duration_ms,
    request_sha256: gateway.report.hashes.request,
    snapshot_sha256: gateway.snapshot.snapshot_sha256,
    planner_input_sha256: hashDocument(gateway.planner_input),
    creative_plan_sha256: hashDocument(gateway.planning?.creative_plan),
    creative_resolution_sha256: hashDocument(gateway.creative_resolution),
    motion_spec_sha256: direct.creative_compile.report.hashes.motion_spec,
    render_plan_sha256: direct.p1.hashes.render_plan,
    audio_plan_sha256: direct.p1.hashes.audio_plan,
    subtitle_plan_sha256: direct.p1.hashes.subtitle_plan,
    replay: {
      planner_input_sha256: hashDocument(replayGateway.planner_input),
      creative_plan_sha256: hashDocument(replayGateway.planning?.creative_plan),
      creative_resolution_sha256: hashDocument(replayGateway.creative_resolution),
      motion_spec_sha256: replay.creative_compile.report.hashes.motion_spec,
      render_plan_sha256: replay.p1.hashes.render_plan,
    },
  });
}

const golden = canonicalJson({
  schema: 'p2.6-semantic-golden',
  schema_version: '0.1.0',
  cases,
});
const output = path.join(WORKSPACE, 'certification', 'goldens', 'p2.6-semantic.json');

if (process.argv.includes('--update')) {
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${golden}\n`, 'utf8');
  process.stdout.write('Golden sémantique P2.6 créé/mis à jour explicitement.\n');
} else {
  if (!existsSync(output)) throw new Error('Golden P2.6 absent. Utiliser explicitement golden:update:p2.6.');
  const current = readFileSync(output, 'utf8').trim();
  if (current !== golden) throw new Error('Dérive du golden P2.6. La mise à jour doit être explicite.');
  process.stdout.write('Golden sémantique P2.6 vérifié.\n');
}
