import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { canonicalJson, hashDocument } from '@motion-engine/core';
import { replayCreativeGateway } from '@motion-engine/creative-gateway';

import { buildP24GatewayRun, compileP24GatewayResult } from '../integration/p2.4-support.ts';
import { WORKSPACE } from '../integration/support.ts';

const output = path.join(WORKSPACE, 'creative-gateway', 'goldens', 'p2.4', 'semantic-golden.json');
const gateway = await buildP24GatewayRun();
if (!gateway.snapshot) throw new Error('Snapshot P2.4 absent.');
const direct = compileP24GatewayResult(gateway, 'signal');
const replayGateway = replayCreativeGateway(gateway.snapshot);
const replay = compileP24GatewayResult(replayGateway, 'signal');

const golden = canonicalJson({
  schema: 'p2.4-semantic-golden',
  schema_version: '0.1.0',
  request: gateway.planner_input,
  accepted_snapshot: gateway.snapshot,
  gateway: {
    state: gateway.state,
    transitions: gateway.report.transitions,
    diagnostics: gateway.report.diagnostics,
    usage: gateway.report.usage,
    hashes: gateway.report.hashes,
  },
  deterministic_chain: {
    planner_input_sha256: hashDocument(gateway.planner_input),
    creative_plan_sha256: hashDocument(gateway.planning?.creative_plan),
    creative_resolution_sha256: hashDocument(gateway.creative_resolution),
    motion_spec_sha256: direct.creative_compile.report.hashes.motion_spec,
    creative_compile_provenance_sha256: direct.creative_compile.report.hashes.provenance,
    render_plan_sha256: direct.p1.hashes.render_plan,
    audio_plan_sha256: direct.p1.hashes.audio_plan,
    subtitle_plan_sha256: direct.p1.hashes.subtitle_plan,
  },
  replay: {
    planner_input_sha256: hashDocument(replayGateway.planner_input),
    creative_plan_sha256: hashDocument(replayGateway.planning?.creative_plan),
    creative_resolution_sha256: hashDocument(replayGateway.creative_resolution),
    motion_spec_sha256: replay.creative_compile.report.hashes.motion_spec,
    render_plan_sha256: replay.p1.hashes.render_plan,
  },
});

if (process.argv.includes('--update')) {
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${golden}\n`, 'utf8');
  process.stdout.write('Golden sémantique P2.4 mis à jour explicitement.\n');
} else {
  if (!existsSync(output)) throw new Error('Golden P2.4 absent. Utiliser explicitement golden:update:p2.4.');
  const current = readFileSync(output, 'utf8').trim();
  if (current !== golden) throw new Error('Dérive du golden P2.4. La mise à jour doit être explicite.');
  process.stdout.write('Golden sémantique P2.4 vérifié.\n');
}
