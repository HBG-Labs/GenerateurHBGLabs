import { canonicalJson, hashDocument } from '@motion-engine/core';

import {
  P26_CERTIFICATION_MATRIX,
  buildP26GatewayRun,
  compileP26GatewayResult,
} from '../integration/p2.6-support.ts';

const cases = [];
for (const entry of P26_CERTIFICATION_MATRIX) {
  const gateway = await buildP26GatewayRun(entry);
  const compiled = compileP26GatewayResult(gateway);
  cases.push({
    id: entry.id,
    request_sha256: gateway.report.hashes.request,
    snapshot_sha256: gateway.snapshot?.snapshot_sha256 ?? null,
    planner_input_sha256: hashDocument(gateway.planner_input),
    creative_plan_sha256: hashDocument(gateway.planning?.creative_plan),
    creative_resolution_sha256: hashDocument(gateway.creative_resolution),
    motion_spec_sha256: compiled.creative_compile.report.hashes.motion_spec,
    render_plan_sha256: compiled.p1.hashes.render_plan,
    dependency_graph_sha256: compiled.p1.hashes.dependency_graph,
    diagnostics_sha256: hashDocument({
      gateway: gateway.report.diagnostics,
      creative_compile: compiled.creative_compile.report.diagnostics,
      p1: compiled.p1.preflight.issues,
    }),
  });
}

process.stdout.write(canonicalJson({
  schema: 'p2.6-offline-certification-fingerprint',
  schema_version: '0.1.0',
  cases,
}));
