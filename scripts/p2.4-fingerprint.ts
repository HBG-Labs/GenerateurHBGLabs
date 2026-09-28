import { canonicalJson, hashDocument } from '@motion-engine/core';
import { replayCreativeGateway } from '@motion-engine/creative-gateway';

import { buildP24GatewayRun, compileP24GatewayResult } from '../integration/p2.4-support.ts';

const gateway = await buildP24GatewayRun();
const direct = compileP24GatewayResult(gateway, 'signal');
const replay = compileP24GatewayResult(replayCreativeGateway(gateway.snapshot), 'signal');

process.stdout.write(canonicalJson({
  request_sha256: gateway.report.hashes.request,
  accepted_provider_response_sha256: gateway.report.hashes.accepted_provider_response,
  snapshot_sha256: gateway.snapshot?.snapshot_sha256,
  planner_input_sha256: hashDocument(gateway.planner_input),
  creative_plan_sha256: hashDocument(gateway.planning?.creative_plan),
  creative_resolution_sha256: hashDocument(gateway.creative_resolution),
  motion_spec_sha256: direct.creative_compile.report.hashes.motion_spec,
  render_plan_sha256: direct.p1.hashes.render_plan,
  replay_motion_spec_sha256: replay.creative_compile.report.hashes.motion_spec,
  replay_render_plan_sha256: replay.p1.hashes.render_plan,
}));
