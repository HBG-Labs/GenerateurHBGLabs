import type { EngineLimits } from '../contracts/limits.ts';
import { resolveEngineLimits } from '../contracts/limits.ts';
import type { Layer, MotionSceneSpec } from '../contracts/motion-spec.ts';
import type { RenderPlan } from '../contracts/render-plan.ts';
import type { AudioPlan, SubtitlePlan } from '../contracts/render-plan.ts';
import type { QualityIssue } from '../contracts/visual.ts';
import type { ImageResource } from '../visual/assets.ts';

export class EngineLimitError extends Error {
  readonly diagnostics: readonly QualityIssue[];
  constructor(diagnostics: readonly QualityIssue[]) {
    super(diagnostics.map((item) => item.message).join('; '));
    this.name = 'EngineLimitError';
    this.diagnostics = diagnostics;
  }
}

function layersOf(layer: Layer): Layer[] {
  return [layer, ...((layer.primitive === 'group' || layer.primitive === 'mask') ? layer.children.flatMap(layersOf) : [])];
}

export function assertInputLimits(spec: MotionSceneSpec, assets: Readonly<Record<string, ImageResource>>, limits: EngineLimits): void {
  const layers = spec.scenes.flatMap((scene) => scene.layers.flatMap(layersOf));
  const textLength = spec.voice.segments.reduce((sum, segment) => sum + segment.text.length, 0) + layers.reduce((sum, layer) => sum + (layer.primitive === 'text' ? layer.content.runs.reduce((n, run) => n + run.text.length, 0) : 0), 0);
  const checks: Array<[boolean, string, string, number, number]> = [
    [spec.scenes.length > limits.max_scenes, 'limits.scenes', 'scenes', spec.scenes.length, limits.max_scenes],
    [layers.length > limits.max_layers, 'limits.layers', 'layers', layers.length, limits.max_layers],
    [textLength > limits.max_text_length, 'limits.text_length', 'text', textLength, limits.max_text_length],
    [Object.keys(assets).length > limits.max_assets, 'limits.assets', 'assets', Object.keys(assets).length, limits.max_assets],
  ];
  for (const asset of Object.values(assets)) {
    checks.push([asset.width > limits.max_asset_dimensions || asset.height > limits.max_asset_dimensions, 'limits.asset_dimensions', `assets.${asset.ref}`, Math.max(asset.width, asset.height), limits.max_asset_dimensions]);
    checks.push([asset.data.byteLength > limits.max_asset_bytes, 'limits.asset_bytes', `assets.${asset.ref}`, asset.data.byteLength, limits.max_asset_bytes]);
  }
  const diagnostics = checks.filter(([failed]) => failed).map(([, code, path, actual, limit]) => ({
    code, severity: 'error' as const, path, node_id: null, scene_id: null,
    message: `${path}: ${actual} dépasse la limite ${limit}`, context: { actual, limit },
    suggested_action: 'Réduire l’entrée ou fournir explicitement un budget moteur adapté.',
  }));
  if (diagnostics.length > 0) throw new EngineLimitError(diagnostics);
}

export function assertPlanLimits(plan: RenderPlan, limits: EngineLimits): void {
  const effectiveLimits = resolveEngineLimits(limits);
  const tracks = plan.scenes.flatMap((scene) => {
    const visit = (nodes: typeof scene.nodes): typeof scene.nodes[number]['tracks'] => nodes.flatMap((node) => [...node.tracks, ...((node.type === 'group' || node.type === 'mask') ? visit(node.children) : [])]);
    return visit(scene.nodes);
  });
  const keyframes = tracks.reduce((sum, track) => sum + track.keys.length, 0);
  const dynamicTypographyTracks = tracks.filter((track) => track.property === 'tracking_px' || track.property.startsWith('font_axis.'));
  const failures: QualityIssue[] = [];
  if (plan.canvas.duration_frames > effectiveLimits.max_duration_frames) failures.push({ code: 'limits.duration', severity: 'error', path: 'canvas.duration_frames', message: `${plan.canvas.duration_frames} dépasse ${effectiveLimits.max_duration_frames}`, context: { actual: plan.canvas.duration_frames, limit: effectiveLimits.max_duration_frames } });
  if (keyframes > effectiveLimits.max_keyframes) failures.push({ code: 'limits.keyframes', severity: 'error', path: 'scenes', message: `${keyframes} dépasse ${effectiveLimits.max_keyframes}`, context: { actual: keyframes, limit: effectiveLimits.max_keyframes } });
  if (plan.fonts.length > effectiveLimits.max_fonts) failures.push({ code: 'limits.fonts', severity: 'error', path: 'fonts', message: `${plan.fonts.length} dépasse ${effectiveLimits.max_fonts}`, context: { actual: plan.fonts.length, limit: effectiveLimits.max_fonts } });
  if (dynamicTypographyTracks.length > effectiveLimits.max_dynamic_typography_tracks) failures.push({ code: 'limits.dynamic_typography_tracks', severity: 'error', path: 'scenes', message: `${dynamicTypographyTracks.length} dépasse ${effectiveLimits.max_dynamic_typography_tracks}`, context: { actual: dynamicTypographyTracks.length, limit: effectiveLimits.max_dynamic_typography_tracks } });
  const axesByRun = new Map<string, Set<string>>();
  for (const track of dynamicTypographyTracks.filter((candidate) => candidate.property.startsWith('font_axis.'))) {
    const run = track.target?.run ?? '';
    const axes = axesByRun.get(run) ?? new Set<string>();
    axes.add(track.property);
    axesByRun.set(run, axes);
  }
  for (const [run, axes] of axesByRun) if (axes.size > effectiveLimits.max_dynamic_axes_per_run) failures.push({ code: 'limits.dynamic_axes_per_run', severity: 'error', path: `scenes.${run}`, message: `${axes.size} axes dépassent ${effectiveLimits.max_dynamic_axes_per_run}`, context: { actual: axes.size, limit: effectiveLimits.max_dynamic_axes_per_run } });
  if (failures.length > 0) throw new EngineLimitError(failures);
}

export function assertAuxiliaryPlanLimits(audio: AudioPlan, subtitles: SubtitlePlan, limits: EngineLimits): void {
  const failures: QualityIssue[] = [];
  if (audio.sfx_cues.length > limits.max_audio_cues) failures.push({
    code: 'limits.audio_cues', severity: 'error', path: 'audio.sfx_cues',
    message: `${audio.sfx_cues.length} dépasse ${limits.max_audio_cues}`,
    context: { actual: audio.sfx_cues.length, limit: limits.max_audio_cues },
  });
  if (subtitles.segments.length > limits.max_subtitle_segments) failures.push({
    code: 'limits.subtitle_segments', severity: 'error', path: 'subtitles.segments',
    message: `${subtitles.segments.length} dépasse ${limits.max_subtitle_segments}`,
    context: { actual: subtitles.segments.length, limit: limits.max_subtitle_segments },
  });
  if (failures.length > 0) throw new EngineLimitError(failures);
}
