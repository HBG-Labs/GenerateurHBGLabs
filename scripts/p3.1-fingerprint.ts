import { canonicalJson } from '@motion-engine/core';
import { ACTIVE_VISUAL_GRAMMAR, VISUAL_REGISTRY_FINGERPRINTS, hashVisualDocument } from '@motion-engine/visual-core';

import { buildP31Pipeline } from '../integration/p3.1-support.ts';

const pipeline = buildP31Pipeline();
process.stdout.write(canonicalJson({
  grammar: ACTIVE_VISUAL_GRAMMAR.fingerprint,
  registries: VISUAL_REGISTRY_FINGERPRINTS,
  visual_plan: hashVisualDocument(pipeline.visual_plan),
  motion_spec: pipeline.visual_compile.hashes.motion_spec,
  render_plan: pipeline.p1.hashes.render_plan,
  preflight: pipeline.visual_compile.preflight,
}));
