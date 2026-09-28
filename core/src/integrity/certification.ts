import type { DependencyGraph } from '../contracts/dependency-graph.ts';
import type { ReproducibilityManifest } from '../contracts/manifest.ts';
import type { AudioPlan, PlanNode, RenderPlan, SubtitlePlan } from '../contracts/render-plan.ts';
import type { QualityPreflightReport } from '../contracts/visual.ts';
import { hashDocument } from './canonical.ts';

export const SEMANTIC_CERTIFICATION_VERSION = '0.1.0' as const;

export interface SemanticCertificationFingerprint {
  schema: 'semantic-certification-fingerprint';
  schema_version: typeof SEMANTIC_CERTIFICATION_VERSION;
  render_plan_sha256: string;
  audio_plan_sha256: string;
  subtitle_plan_sha256: string;
  dependency_graph_sha256: string;
  diagnostics_sha256: string;
  stable_ids_sha256: string;
  manifest_semantic_sha256: string;
  sha256: string;
}

function nodeIds(nodes: readonly PlanNode[]): string[] {
  return nodes.flatMap((node) => [
    `layer:${node.id}`,
    ...node.tracks.map((track) => `track:${track.id}`),
    ...((node.type === 'group' || node.type === 'mask') ? nodeIds(node.children) : []),
  ]);
}

/** Projection stricte cross-platform : horodatage, Git et hôte sont exclus. */
export function manifestSemanticHash(manifest: ReproducibilityManifest): string {
  return hashDocument({
    schema: manifest.schema,
    schema_version: manifest.schema_version,
    engine: { name: manifest.engine.name, version: manifest.engine.version },
    spec: manifest.spec,
    style: manifest.style,
    platform_presets: manifest.platform_presets,
    patterns: manifest.patterns,
    fonts: manifest.fonts,
    assets: manifest.assets,
    compilation: manifest.compilation,
    render_plan_sha256: manifest.render_plan_sha256,
    audio_plan_sha256: manifest.audio_plan_sha256,
    subtitle_plan_sha256: manifest.subtitle_plan_sha256,
    preflight_sha256: manifest.preflight_sha256,
    dependency_graph_sha256: manifest.dependency_graph_sha256,
    configuration: manifest.configuration,
    render_config: manifest.render_config,
  });
}

export function buildSemanticCertificationFingerprint(input: {
  renderPlan: RenderPlan;
  audioPlan: AudioPlan;
  subtitlePlan: SubtitlePlan;
  dependencyGraph: DependencyGraph;
  preflight: QualityPreflightReport;
  manifest: ReproducibilityManifest;
}): SemanticCertificationFingerprint {
  const stableIds = [
    ...input.renderPlan.scenes.flatMap((scene) => [`scene:${scene.id}`, ...nodeIds(scene.nodes)]),
    ...input.renderPlan.assets.map((asset) => `asset:${asset.ref}`),
    ...input.renderPlan.fonts.map((font) => `font:${font.id}`),
    ...input.audioPlan.voice_segments.map((segment) => `voice:${segment.id}`),
    ...input.audioPlan.silences.map((silence) => `silence:${silence.id}`),
    ...input.audioPlan.sfx_cues.map((cue) => `cue:${cue.id}`),
    ...input.audioPlan.music_regions.map((region) => `music:${region.id}`),
    ...input.subtitlePlan.segments.map((segment) => `subtitle:${segment.id}`),
  ].sort();
  const body = {
    schema: 'semantic-certification-fingerprint' as const,
    schema_version: SEMANTIC_CERTIFICATION_VERSION,
    render_plan_sha256: hashDocument(input.renderPlan),
    audio_plan_sha256: hashDocument(input.audioPlan),
    subtitle_plan_sha256: hashDocument(input.subtitlePlan),
    dependency_graph_sha256: input.dependencyGraph.sha256,
    diagnostics_sha256: hashDocument(input.preflight),
    stable_ids_sha256: hashDocument(stableIds),
    manifest_semantic_sha256: manifestSemanticHash(input.manifest),
  };
  return { ...body, sha256: hashDocument(body) };
}
