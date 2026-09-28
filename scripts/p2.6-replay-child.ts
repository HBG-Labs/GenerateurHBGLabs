import { readFileSync } from 'node:fs';

import { canonicalJson, hashDocument } from '@motion-engine/core';
import {
  CreativeGatewaySnapshotSchema,
  replayCreativeGateway,
} from '@motion-engine/creative-gateway';

import {
  compileP26GatewayResult,
  p26ReadingPolicy,
} from '../integration/p2.6-support.ts';

const snapshotIndex = process.argv.indexOf('--snapshot');
const snapshotFile = snapshotIndex < 0 ? undefined : process.argv[snapshotIndex + 1];
if (!snapshotFile) throw new Error('Le replay P2.6 exige --snapshot <file>.');

const snapshot = CreativeGatewaySnapshotSchema.parse(JSON.parse(readFileSync(snapshotFile, 'utf8')));
const gateway = replayCreativeGateway(snapshot, { reading_policy: p26ReadingPolicy() });
if (!gateway.ok) throw new Error(`Replay P2.6 refusé : ${canonicalJson(gateway.report.diagnostics)}`);
const compiled = compileP26GatewayResult(gateway, 1);

process.stdout.write(canonicalJson({
  schema: 'p2.6-cross-process-replay-proof',
  schema_version: '0.1.0',
  provider_calls: 0,
  snapshot_sha256: snapshot.snapshot_sha256,
  planner_input_sha256: hashDocument(gateway.planner_input),
  creative_plan_sha256: hashDocument(gateway.planning?.creative_plan),
  creative_resolution_sha256: hashDocument(gateway.creative_resolution),
  motion_spec_sha256: compiled.creative_compile.report.hashes.motion_spec,
  render_plan_sha256: compiled.p1.hashes.render_plan,
}));
