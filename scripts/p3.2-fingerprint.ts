import { canonicalJson } from '@motion-engine/core';
import { P32_VISUAL_GRAMMAR, P32_VISUAL_REGISTRY_FINGERPRINTS, hashVisualDocument } from '@motion-engine/visual-core';

import { buildP32Pipeline } from '../integration/p3.2-support.ts';

const pipeline = buildP32Pipeline();
function dynamicTracks(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(dynamicTracks);
  if (value === null || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const current = typeof record['property'] === 'string' && (record['property'] === 'tracking_px' || record['property'].startsWith('font_axis.'))
    ? [{ id: record['id'], property: record['property'], keys: record['keys'] }]
    : [];
  return [...current, ...Object.values(record).flatMap(dynamicTracks)];
}
process.stdout.write(canonicalJson({
  grammar: P32_VISUAL_GRAMMAR.fingerprint,
  registries: P32_VISUAL_REGISTRY_FINGERPRINTS,
  visual_plan: hashVisualDocument(pipeline.visual_plan),
  motion_spec: pipeline.visual_compile.hashes.motion_spec,
  render_plan: pipeline.p1.hashes.render_plan,
  dynamic_typography_critical_states: dynamicTracks(pipeline.p1.render_plan),
  preflight: pipeline.visual_compile.preflight,
}));
