import { canonicalJson, hashDocument } from '@motion-engine/core';

import { buildP17Pipeline } from '../integration/p1.7-support.ts';

const fixture = buildP17Pipeline();
const dynamicRuns = fixture.pipeline.render_plan.scenes.flatMap((scene) => {
  const collect = (nodes: typeof scene.nodes): Array<{ id: string; critical_frames: readonly number[] }> => nodes.flatMap((node) => {
    const current = node.type === 'text'
      ? node.lines.flatMap((line) => line.runs.filter((run) => run.dynamic_typography).map((run) => ({ id: run.id, critical_frames: run.dynamic_typography!.critical_frames })))
      : [];
    return [...current, ...((node.type === 'group' || node.type === 'mask') ? collect(node.children) : [])];
  });
  return collect(scene.nodes);
});

process.stdout.write(canonicalJson({
  spec: hashDocument(fixture.spec),
  render_plan: fixture.pipeline.hashes.render_plan,
  audio_plan: fixture.pipeline.hashes.audio_plan,
  subtitle_plan: fixture.pipeline.hashes.subtitle_plan,
  dependency_graph: fixture.pipeline.hashes.dependency_graph,
  dynamic_runs: dynamicRuns,
}));
