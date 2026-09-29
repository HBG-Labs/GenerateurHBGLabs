import { canonicalJson } from '@motion-engine/core';
import { DIRECTOR_REGISTRY_FINGERPRINTS, VISUAL_DIRECTOR_FINGERPRINT } from '@motion-engine/visual-director-core';

import { buildP33APipeline } from '../integration/p3.3a-support.ts';

const pipeline = buildP33APipeline('science');
process.stdout.write(canonicalJson({
  director: VISUAL_DIRECTOR_FINGERPRINT,
  registries: DIRECTOR_REGISTRY_FINGERPRINTS,
  direction_plan: pipeline.direction_compile.hashes.direction_plan,
  decision_trace: pipeline.direction_compile.hashes.decision_trace,
  visual_plan: pipeline.direction_compile.hashes.visual_plan,
  motion_spec: pipeline.visual_compile.hashes.motion_spec,
  render_plan: pipeline.p1.hashes.render_plan,
  direction_preflight: pipeline.direction_compile.direction_preflight,
  sequence_coherence: pipeline.direction_compile.coherence,
}));
