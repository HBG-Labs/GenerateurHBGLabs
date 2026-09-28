import { canonicalJson, hashDocument } from '@motion-engine/core';

import { buildP23Pipeline } from '../integration/p2.3-support.ts';

const signal = buildP23Pipeline('hypothetical-30s', 'signal');
const nocturne = buildP23Pipeline('hypothetical-30s', 'nocturne');

process.stdout.write(canonicalJson({
  creative_plan_sha256: signal.creative_compile.report.hashes.creative_plan,
  resolution_sha256: signal.creative_compile.report.hashes.resolution,
  signal: {
    motion_spec_sha256: signal.creative_compile.report.hashes.motion_spec,
    provenance_sha256: signal.creative_compile.report.hashes.provenance,
    compiler_fingerprint: signal.creative_compile.compiler_fingerprint,
    diagnostics_sha256: hashDocument(signal.creative_compile.report.diagnostics),
    render_plan_sha256: signal.p1.hashes.render_plan,
    audio_plan_sha256: signal.p1.hashes.audio_plan,
    subtitle_plan_sha256: signal.p1.hashes.subtitle_plan,
    dependency_graph_sha256: signal.p1.hashes.dependency_graph,
  },
  nocturne: {
    motion_spec_sha256: nocturne.creative_compile.report.hashes.motion_spec,
    provenance_sha256: nocturne.creative_compile.report.hashes.provenance,
    compiler_fingerprint: nocturne.creative_compile.compiler_fingerprint,
    diagnostics_sha256: hashDocument(nocturne.creative_compile.report.diagnostics),
    render_plan_sha256: nocturne.p1.hashes.render_plan,
    audio_plan_sha256: nocturne.p1.hashes.audio_plan,
    subtitle_plan_sha256: nocturne.p1.hashes.subtitle_plan,
    dependency_graph_sha256: nocturne.p1.hashes.dependency_graph,
  },
}));
