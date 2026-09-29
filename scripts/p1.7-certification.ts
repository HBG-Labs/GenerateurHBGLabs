import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { canonicalJson } from '@motion-engine/core';

import { buildP14Pipeline } from '../integration/p1.4-support.ts';
import { buildP17Pipeline } from '../integration/p1.7-support.ts';
import { WORKSPACE } from '../integration/support.ts';

function measured(label: string, build: () => unknown): { label: string; compile_ms: number } {
  const started = performance.now();
  build();
  return { label, compile_ms: performance.now() - started };
}

// Warm the font and module caches before recording informative, non-SLA timings.
buildP17Pipeline();
const variants = [
  measured('STATIC', () => buildP14Pipeline()),
  measured('TRACKING', () => buildP17Pipeline({ wght: null, wdth: null })),
  measured('WGHT', () => buildP17Pipeline({ tracking: [0, 0], wdth: null })),
  measured('WDTH', () => buildP17Pipeline({ tracking: [0, 0], wght: null })),
  measured('COMBINED', () => buildP17Pipeline()),
];
const fixture = buildP17Pipeline();
const report = {
  schema: 'p1.7-offline-certification',
  schema_version: '0.1.0',
  status: (fixture.pipeline.preflight.summary?.errors ?? 0) === 0 ? 'PASS' : 'BLOCKED',
  provider_calls: 0,
  local_gpu_required: false,
  contracts: { legacy_render_plan: '0.3.0', dynamic_render_plan: fixture.pipeline.render_plan.schema_version, compiler: fixture.pipeline.render_plan.compiler_version },
  hashes: fixture.pipeline.hashes,
  preflight: fixture.pipeline.preflight,
  performance: { variants, node_peak_memory_bytes: process.resourceUsage().maxRSS * 1_024 },
  cluster_safety: {
    decision: 'OPTION_B_DEFERRED',
    reason: 'HarfBuzz cluster metadata is retained in PlanRun, but the certified browser renderer paints shaped runs as units. Per-cluster transforms require a dedicated cluster/glyph renderer and are not emulated with character splitting.',
  },
};
const output = path.join(WORKSPACE, 'out', 'p1.7', 'certification');
mkdirSync(output, { recursive: true });
writeFileSync(path.join(output, 'offline-certification.json'), `${canonicalJson(report)}\n`, 'utf8');
process.stdout.write(`P1.7 offline certification: ${report.status}\n`);
if (report.status !== 'PASS') process.exitCode = 1;
