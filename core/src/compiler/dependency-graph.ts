import { DEPENDENCY_GRAPH_VERSION, DependencyGraphSchema } from '../contracts/dependency-graph.ts';
import type { DependencyGraph } from '../contracts/dependency-graph.ts';
import type { Layer, MotionSceneSpec } from '../contracts/motion-spec.ts';
import type { AudioPlan, PlanNode, RenderPlan, SubtitlePlan } from '../contracts/render-plan.ts';
import { hashDocument } from '../integrity/canonical.ts';

type Node = DependencyGraph['nodes'][number];
type Edge = DependencyGraph['edges'][number];

export function buildDependencyGraph(spec: MotionSceneSpec, plan: RenderPlan, audio: AudioPlan, subtitles: SubtitlePlan): DependencyGraph {
  const nodes = new Map<string, Node>();
  const edges: Edge[] = [];
  const add = (node: Node) => nodes.set(node.id, node);
  const edge = (from: string, to: string, relation: Edge['relation']) => edges.push({ from, to, relation });
  const visitLayer = (layer: Layer, sceneId: string, parent: string): void => {
    const id = `layer:${sceneId}:${layer.id}`;
    add({ id, kind: 'layer', source_id: layer.id, fingerprint: hashDocument(layer) });
    edge(parent, id, 'contains');
    if (layer.primitive === 'image') edge(`asset:${layer.asset}`, id, 'uses');
    layer.behaviors.forEach((behavior) => {
      const behaviorId = `behavior:${sceneId}:${layer.id}:${behavior.id}`;
      add({ id: behaviorId, kind: 'behavior', source_id: behavior.id, fingerprint: hashDocument(behavior) });
      edge(id, behaviorId, 'drives');
    });
    if (layer.primitive === 'group' || layer.primitive === 'mask') layer.children.forEach((child) => visitLayer(child, sceneId, id));
  };
  const visitPlanNode = (node: PlanNode, sceneId: string): void => {
    const layerId = `layer:${sceneId}:${node.id}`;
    if (node.type === 'text') node.lines.flatMap((line) => line.runs).forEach((run) => edge(`font:${run.font}`, layerId, 'shapes'));
    node.tracks.forEach((track) => {
      const trackId = `track:${sceneId}:${track.id}`;
      add({ id: trackId, kind: 'track', source_id: track.id, fingerprint: hashDocument(track) });
      edge(`behavior:${sceneId}:${node.id}:${track.source}`, trackId, 'drives');
      edge(trackId, layerId, 'renders');
    });
    if (node.type === 'group' || node.type === 'mask') node.children.forEach((child) => visitPlanNode(child, sceneId));
  };
  plan.assets.forEach((asset) => add({ id: `asset:${asset.ref}`, kind: 'asset', source_id: asset.ref, fingerprint: asset.sha256 }));
  plan.fonts.forEach((font) => add({ id: `font:${font.id}`, kind: 'font', source_id: font.id, fingerprint: font.sha256 }));
  spec.scenes.forEach((scene) => {
    const sceneId = `scene:${scene.id}`;
    add({ id: sceneId, kind: 'scene', source_id: scene.id, fingerprint: hashDocument(scene) });
    scene.layers.forEach((layer) => visitLayer(layer, scene.id, sceneId));
    plan.scenes.find((candidate) => candidate.id === scene.id)?.nodes.forEach((node) => visitPlanNode(node, scene.id));
  });
  audio.sfx_cues.forEach((cue) => {
    const id = `audio_cue:${cue.id}`;
    add({ id, kind: 'audio_cue', source_id: cue.id, fingerprint: hashDocument(cue) });
    const scene = plan.scenes.find((candidate) => cue.at_frame >= candidate.from && cue.at_frame < candidate.to);
    if (scene) edge(`scene:${scene.id}`, id, 'times');
  });
  subtitles.segments.forEach((segment) => {
    const id = `subtitle_segment:${segment.id}`;
    add({ id, kind: 'subtitle_segment', source_id: segment.id, fingerprint: hashDocument(segment) });
    edge(`scene:${segment.scene_id}`, id, 'times');
    edge(`font:${segment.font}`, id, 'shapes');
  });
  const sortedNodes = [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id));
  const sortedEdges = edges
    .filter((candidate) => nodes.has(candidate.from) && nodes.has(candidate.to))
    .sort((a, b) => `${a.from}|${a.to}|${a.relation}`.localeCompare(`${b.from}|${b.to}|${b.relation}`));
  const body = { schema: 'dependency-graph' as const, schema_version: DEPENDENCY_GRAPH_VERSION, nodes: sortedNodes, edges: sortedEdges };
  return DependencyGraphSchema.parse({ ...body, sha256: hashDocument(body) });
}

export function affectedNodes(graph: DependencyGraph, changedNodeId: string): string[] {
  const affected = new Set([changedNodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of graph.edges) if (affected.has(edge.from) && !affected.has(edge.to)) { affected.add(edge.to); changed = true; }
  }
  return [...affected].sort();
}
