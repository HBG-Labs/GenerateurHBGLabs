import type { GroupLayer, ImageLayer, Layer, MaskLayer, PathLayer, ShapeLayer, TextLayer } from '../contracts/motion-spec.ts';
import type { PatternDefinition, PatternSlot } from '../contracts/pattern.ts';
import type { PlatformPresets } from '../contracts/platform.ts';
import { RENDER_PLAN_LEGACY_VERSION, RENDER_PLAN_VERSION, RenderPlanSchema } from '../contracts/render-plan.ts';
import type { Box, PlanImageNode, PlanLine, PlanNode, PlanPathNode, PlanRun, PlanTextNode, RenderPlan, Track } from '../contracts/render-plan.ts';
import type { ResolvedStyle } from '../contracts/resolved-style.ts';
import type { TypeStyle } from '../contracts/style-profile.ts';
import type { QualityIssue } from '../contracts/visual.ts';
import type { AudioPlan, SubtitlePlan } from '../contracts/render-plan.ts';
import type { DependencyGraph } from '../contracts/dependency-graph.ts';
import type { EngineLimits } from '../contracts/limits.ts';
import { resolveEngineLimits } from '../contracts/limits.ts';
import { hashDocument, sha256Hex } from '../integrity/canonical.ts';
import { compileLayerTracks } from '../motion/compile-tracks.ts';
import { behaviorRegistryFingerprint, P14_BEHAVIOR_REGISTRY } from '../motion/behavior-registry.ts';
import type { BehaviorRegistry } from '../motion/behavior-registry.ts';
import { resolveTemporalPlan } from '../temporal/resolve.ts';
import type { ResolvedSceneTiming } from '../temporal/resolve.ts';
import { fitText } from '../typography/fit-text.ts';
import { formatTypography } from '../typography/formatter.ts';
import { HarfBuzzTextEngine, TypographyEngineError } from '../typography/harfbuzz-text-engine.ts';
import { placeImage, validateImageResource } from '../visual/assets.ts';
import type { ImageResource } from '../visual/assets.ts';
import { gridPlacementBox, intersectBoxes, normalizedRegionBox } from '../visual/layout.ts';
import { compileNormalizedPath } from '../visual/path.ts';
import { buildQualityPreflight } from '../visual/preflight.ts';
import { rendererRequirements, assertRenderGate } from '../rendering/capabilities.ts';
import type { RendererDescriptor } from '../rendering/capabilities.ts';
import { buildDependencyGraph } from './dependency-graph.ts';
import { assertAuxiliaryPlanLimits, assertInputLimits, assertPlanLimits } from './limits.ts';
import { compileAudioPlan, compileSubtitlePlan } from './plans.ts';
import { resolveRenderGeometry } from './render-geometry.ts';
import { assertStyleVersionPolicy } from '../style/version-policy.ts';
import type { StyleVersionBaseline } from '../style/version-policy.ts';
import { buildReproducibilityManifest } from '../integrity/manifest.ts';
import type { ManifestInput } from '../integrity/manifest.ts';
import type { ReproducibilityManifest } from '../contracts/manifest.ts';
import { validatePatternDefinition, validatePlatformPresets, validateRenderPlan, validateSpec } from '../validation/validate.ts';
import type { MotionSceneSpec } from '../contracts/motion-spec.ts';
import { boundedCriticalFrames, resolvedNumericTrackValue } from '../motion/track-value.ts';

export const COMPILER_VERSION = '0.5.0';
export const DYNAMIC_TYPOGRAPHY_COMPILER_VERSION = '0.6.0';

export interface FontResource {
  file: string;
  sha256: string;
  data: Uint8Array;
}

export interface CompileInput {
  spec: MotionSceneSpec;
  resolvedStyle: ResolvedStyle;
  platformPresets: PlatformPresets;
  pattern: PatternDefinition;
  fontResources: Readonly<Record<string, FontResource>>;
  assetResources?: Readonly<Record<string, ImageResource>>;
  config: {
    fps: number;
    scene_duration_frames?: number;
    render_scale?: number;
    reduced_motion?: boolean;
    max_render_cost?: number;
    max_attention_cost?: number;
    minimum_readable_size?: number;
    limits?: Partial<EngineLimits>;
  };
  behaviorRegistry?: BehaviorRegistry;
  allowStyleSubstitution?: boolean;
  previousStyle?: StyleVersionBaseline | null;
}

export class CompileError extends Error {
  readonly diagnostics: readonly QualityIssue[];

  constructor(message: string, diagnostics: readonly QualityIssue[] = []) {
    super(message);
    this.name = 'CompileError';
    this.diagnostics = diagnostics;
  }
}

export type CompilerMeasuredPhase =
  | 'validate_inputs'
  | 'resolve_dependencies'
  | 'resolve_temporal'
  | 'resolve_layout'
  | 'resolve_typography'
  | 'resolve_assets'
  | 'compile_behaviors'
  | 'resolve_audio_plan'
  | 'resolve_subtitles'
  | 'quality_preflight'
  | 'build_render_plan'
  | 'build_manifest';

export interface CompilerPhaseMetrics {
  schema: 'compiler-phase-metrics';
  schema_version: '0.1.0';
  total_ms: number;
  phases_ms: Record<CompilerMeasuredPhase, number>;
}

class CompileProfiler {
  readonly #phases = Object.fromEntries([
    'validate_inputs', 'resolve_dependencies', 'resolve_temporal', 'resolve_layout', 'resolve_typography',
    'resolve_assets', 'compile_behaviors', 'resolve_audio_plan', 'resolve_subtitles', 'quality_preflight',
    'build_render_plan', 'build_manifest',
  ].map((phase) => [phase, 0])) as Record<CompilerMeasuredPhase, number>;
  readonly #now: () => number;

  constructor(now: () => number) { this.#now = now; }

  start(): number { return this.#now(); }

  finish(phase: CompilerMeasuredPhase, started: number): void { this.add(phase, this.#now() - started); }

  add(phase: CompilerMeasuredPhase, milliseconds: number): void {
    this.#phases[phase] += milliseconds;
  }

  measure<T>(phase: CompilerMeasuredPhase, task: () => T): T {
    const started = this.#now();
    try { return task(); }
    finally { this.add(phase, this.#now() - started); }
  }

  snapshot(totalMs: number): CompilerPhaseMetrics {
    return { schema: 'compiler-phase-metrics', schema_version: '0.1.0', total_ms: totalMs, phases_ms: { ...this.#phases } };
  }
}

function measured<T>(profile: CompileProfiler | undefined, phase: CompilerMeasuredPhase, task: () => T): T {
  return profile ? profile.measure(phase, task) : task();
}

function failValidation(label: string, result: { ok: boolean; issues?: readonly { path: string; message: string }[] }): void {
  if (result.ok) return;
  const detail = (result.issues ?? []).map((issue) => `${issue.path}: ${issue.message}`).join('; ');
  throw new CompileError(`${label} invalide${detail ? ` — ${detail}` : ''}`);
}

function tokenKey(token: string, namespace: string): string {
  const prefix = `${namespace}.`;
  if (!token.startsWith(prefix)) throw new CompileError(`Jeton ${namespace} attendu, reçu « ${token} ».`);
  return token.slice(prefix.length);
}

function resolveColor(style: ResolvedStyle, token: string): string {
  const value = style.style.palette[tokenKey(token, 'color')];
  if (!value) throw new CompileError(`Couleur « ${token} » introuvable.`);
  return value;
}

function resolveSpace(style: ResolvedStyle, token: string, scale: number): number {
  const value = style.style.space[tokenKey(token, 'space')];
  if (value === undefined) throw new CompileError(`Espacement « ${token} » introuvable.`);
  return value * scale;
}

function resolveType(style: ResolvedStyle, token: string): TypeStyle {
  const value = style.style.typography.scale[tokenKey(token, 'type')];
  if (!value) throw new CompileError(`Style typographique « ${token} » introuvable.`);
  return value;
}

function alignOffset(container: number, item: number, align: 'start' | 'center' | 'end'): number {
  if (align === 'center') return (container - item) / 2;
  if (align === 'end') return container - item;
  return 0;
}

function explicitLines(layer: TextLayer): TextLayer['content']['runs'][] {
  const lines: TextLayer['content']['runs'][] = [];
  let current: TextLayer['content']['runs'] = [];
  for (const run of layer.content.runs) {
    current.push(run);
    if (run.break_after) {
      lines.push(current);
      current = [];
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

function fontId(family: string, weight: number, style: string, axes: Readonly<Record<string, number>>): string {
  const axis = Object.entries(axes).sort(([a], [b]) => a.localeCompare(b)).map(([tag, value]) => `${tag}_${value}`).join('_');
  return `${family}_${weight}_${style}${axis ? `_${axis}` : ''}`.replace(/[^a-z0-9_]/g, '_').slice(0, 64);
}

interface CompileContext {
  style: ResolvedStyle;
  spec: MotionSceneSpec;
  pattern: PatternDefinition;
  scaleX: number;
  scaleY: number;
  fonts: Map<string, RenderPlan['fonts'][number]>;
  assets: Map<string, RenderPlan['assets'][number]>;
  fontResources: Readonly<Record<string, FontResource>>;
  assetResources: Readonly<Record<string, ImageResource>>;
  timing: ResolvedSceneTiming;
  fps: number;
  minimumReadableSize: number;
  textEngine: HarfBuzzTextEngine;
  limits: EngineLimits;
  profiler?: CompileProfiler;
}

const DYNAMIC_TRACKING_MIN_EM = -0.2;
const DYNAMIC_TRACKING_MAX_EM = 0.5;

function dynamicTrackFor(tracks: readonly Track[], property: Track['property'], sourceRun: string): Track | undefined {
  return tracks.find((track) => track.property === property && track.target?.run === sourceRun);
}

function dynamicTypographyTracks(tracks: readonly Track[]): Track[] {
  return tracks.filter((track) => track.property === 'tracking_px' || track.property.startsWith('font_axis.'));
}

function nodeHasDynamicTypography(node: PlanNode): boolean {
  if (dynamicTypographyTracks(node.tracks).length > 0) return true;
  return (node.type === 'group' || node.type === 'mask') && node.children.some(nodeHasDynamicTypography);
}

function dynamicTypographyError(code: string, layer: TextLayer, sceneId: string, message: string, context?: Record<string, string | number>): CompileError {
  return new CompileError(message, [{ code, severity: 'error', path: `layers.${layer.id}`, node_id: layer.id, scene_id: sceneId, message, ...(context ? { context } : {}) }]);
}

function analyzeDynamicTypography(
  layer: TextLayer,
  lines: PlanLine[],
  tracks: readonly Track[],
  box: Box,
  context: CompileContext,
  resource: FontResource,
  baseAxes: Readonly<Record<string, number>>,
): PlanLine[] {
  const dynamic = dynamicTypographyTracks(tracks);
  if (dynamic.length === 0) return lines;
  if (dynamic.length > context.limits.max_dynamic_typography_tracks) throw dynamicTypographyError('limits.dynamic_typography_tracks', layer, context.timing.scene_id, `${dynamic.length} tracks typographiques dépassent ${context.limits.max_dynamic_typography_tracks}.`);
  let frames: number[];
  try {
    frames = boundedCriticalFrames(dynamic, context.limits.max_dynamic_typography_critical_states);
  } catch (error) {
    throw dynamicTypographyError('limits.dynamic_typography_critical_states', layer, context.timing.scene_id, error instanceof Error ? error.message : 'Trop d’états critiques typographiques.');
  }
  const maximumByRun = new Map<string, number>();
  const lineMaximums = lines.map(() => 0);
  for (const frame of frames) {
    let totalHeight = 0;
    for (const [lineIndex, line] of lines.entries()) {
      let width = 0;
      let lineHeight = 0;
      for (const run of line.runs) {
        const tracking = resolvedNumericTrackValue(dynamicTrackFor(dynamic, 'tracking_px', run.source_run), frame, run.tracking_px, context.fps);
        const minTracking = DYNAMIC_TRACKING_MIN_EM * run.size;
        const maxTracking = DYNAMIC_TRACKING_MAX_EM * run.size;
        if (!Number.isFinite(tracking) || tracking < minTracking || tracking > maxTracking) throw dynamicTypographyError('text.tracking_out_of_range', layer, context.timing.scene_id, `Tracking ${tracking} hors [${minTracking}, ${maxTracking}] à la frame ${frame}.`, { frame, tracking_px: tracking });
        const axes: Record<string, number> = { ...baseAxes };
        for (const axis of ['wght', 'wdth'] as const) {
          const axisTrack = dynamicTrackFor(dynamic, `font_axis.${axis}`, run.source_run);
          if (!axisTrack) continue;
          const supported = context.textEngine.supportedAxes({ sha256: resource.sha256, data: resource.data, axes: baseAxes })[axis];
          if (!supported) throw dynamicTypographyError('font.axis_unsupported', layer, context.timing.scene_id, `Axe ${axis} absent de la fonte active.`);
          const value = resolvedNumericTrackValue(axisTrack, frame, axes[axis] ?? supported.default, context.fps);
          if (!Number.isFinite(value) || value < supported.min || value > supported.max) throw dynamicTypographyError('font.axis_out_of_range', layer, context.timing.scene_id, `${axis}=${value} hors [${supported.min}, ${supported.max}] à la frame ${frame}.`, { frame, axis, value });
          axes[axis] = value;
        }
        let metrics;
        try {
          metrics = context.textEngine.shape(run.text, run.size, tracking, { sha256: resource.sha256, data: resource.data, axes }, context.spec.locale);
        } catch (error) {
          if (error instanceof TypographyEngineError) throw dynamicTypographyError(error.diagnostic.code, layer, context.timing.scene_id, error.message, { frame });
          throw error;
        }
        width += metrics.width;
        lineHeight = Math.max(lineHeight, metrics.ascent + metrics.descent + metrics.line_gap);
        maximumByRun.set(run.id, Math.max(maximumByRun.get(run.id) ?? run.measured_width, metrics.width));
      }
      lineMaximums[lineIndex] = Math.max(lineMaximums[lineIndex] ?? 0, width);
      if (width > box.w + 1e-6) throw dynamicTypographyError('text.dynamic_overflow', layer, context.timing.scene_id, `Overflow typographique dynamique à la frame ${frame}: ${width.toFixed(3)} > ${box.w.toFixed(3)}.`, { frame, required_width: width, available_width: box.w });
      totalHeight += Math.max(line.height, lineHeight);
    }
    if (totalHeight > box.h + 1e-6) throw dynamicTypographyError('text.dynamic_overflow', layer, context.timing.scene_id, `Overflow vertical typographique dynamique à la frame ${frame}: ${totalHeight.toFixed(3)} > ${box.h.toFixed(3)}.`, { frame, required_height: totalHeight, available_height: box.h });
  }
  return lines.map((line, lineIndex) => ({
    ...line,
    measured_width: Math.max(line.measured_width, lineMaximums[lineIndex] ?? 0),
    runs: line.runs.map((run) => ({
      ...run,
      measured_width: maximumByRun.get(run.id) ?? run.measured_width,
      dynamic_typography: { policy: 'bounded_frame_sampling_v1' as const, critical_frames: frames, max_measured_width: maximumByRun.get(run.id) ?? run.measured_width },
    })),
  }));
}

function nodeBase(layer: Layer, box: Box, tracks: PlanNode['tracks']): Pick<PlanNode, 'id' | 'box' | 'origin' | 'opacity' | 'transform' | 'must_be_safe' | 'tracks'> {
  return {
    id: layer.id,
    box,
    origin: { x: 0.5, y: 0.5 },
    opacity: layer.opacity ?? 1,
    transform: {
      translate_x: (layer.transform?.translate?.x ?? 0) * box.w,
      translate_y: (layer.transform?.translate?.y ?? 0) * box.h,
      scale: layer.transform?.scale ?? 1,
      rotate: layer.transform?.rotate_deg ?? 0,
    },
    must_be_safe: layer.must_be_safe ?? false,
    tracks,
  };
}

function compileText(layer: TextLayer, box: Box, context: CompileContext): PlanTextNode {
  const started = context.profiler?.start() ?? 0;
  const type = resolveType(context.style, layer.style.type);
  const family = context.style.style.typography.families[type.family];
  if (!family) throw new CompileError(`Famille typographique « ${type.family} » introuvable.`);
  const file = family.files.find((candidate) => candidate.weight === type.weight && candidate.style === 'normal');
  if (!file) throw new CompileError(`Fichier ${type.family}/${type.weight}/normal introuvable.`);
  const resource = context.fontResources[file.src];
  if (!resource) throw new CompileError(`font.missing: ressource « ${file.src} » absente`);
  if (resource.sha256 !== file.sha256 || sha256Hex(resource.data) !== file.sha256) throw new CompileError(`font.hash_mismatch: ressource « ${file.src} » altérée`);
  const axes = file.axes ?? {};
  const binary = { sha256: resource.sha256, data: resource.data, axes };
  const supportedAxes = context.textEngine.supportedAxes(binary);
  const id = fontId(type.family, type.weight, file.style, axes);
  context.fonts.set(id, {
    id, css_name: family.css_name, weight: type.weight, style: file.style, file: resource.file, sha256: resource.sha256,
    axes, supported_axes: supportedAxes, substituted_for: file.fallback_for ?? null,
  });

  const preferredSize = type.size * context.scaleX;
  const selectedMinimum = layer.fit?.min_size ?? type.min_size;
  const configuredMinimum = selectedMinimum !== undefined ? selectedMinimum * context.scaleX : context.minimumReadableSize;
  const minimumSize = Math.min(preferredSize, Math.max(context.minimumReadableSize, configuredMinimum));
  const paragraphs = explicitLines(layer).map((runs) => runs.map((run) => {
    const formatted = formatTypography(run.text, context.spec.locale);
    const rendered = type.case === 'upper' ? formatted.formatted_text.toLocaleUpperCase(context.spec.locale) : formatted.formatted_text;
    const colorToken = run.role === 'accent' ? layer.style.accent_color ?? layer.style.color : run.role === 'muted' ? layer.style.muted_color ?? layer.style.color : layer.style.color;
    return { id: run.id, source_text: formatted.source_text, formatted_text: rendered, color: resolveColor(context.style, colorToken), role: run.role ?? 'base' as const };
  }));
  let fitted;
  try {
    fitted = fitText({
      paragraphs,
      break_policy: layer.content.break_policy,
      max_width: box.w,
      max_height: box.h,
      preferred_size: preferredSize,
      minimum_size: minimumSize,
      preferred_line_height: type.line_height,
      max_lines: layer.fit?.max_lines ?? context.pattern.constraints.max_lines,
      tracking_em: type.tracking_em,
      shape: (text, size, trackingPx) => context.textEngine.shape(text, size, trackingPx, binary, context.spec.locale),
    });
  } catch (error) {
    const diagnostics: QualityIssue[] = [{ code: 'text.overflow', severity: 'error', path: `layers.${layer.id}`, node_id: layer.id, scene_id: context.timing.scene_id, message: error instanceof Error ? error.message : 'texte impossible à ajuster' }];
    throw new CompileError(diagnostics[0]!.message, diagnostics);
  }
  let top = 0;
  let lines = fitted.lines.map((line): PlanLine => {
    const result = {
      runs: line.fragments.map((fragment): PlanRun => ({
        id: fragment.fragment_id,
        source_run: fragment.id,
        source_text: fragment.source_text,
        formatted_text: fragment.formatted_text,
        text: fragment.formatted_text,
        font: id,
        weight: type.weight,
        size: fitted.size,
        tracking_px: type.tracking_em * fitted.size,
        color: fragment.color,
        role: paragraphs.flat().find((candidate) => candidate.id === fragment.id)?.role ?? 'base',
        measured_width: fragment.metrics.width,
        glyphs: fragment.metrics.glyphs,
      })),
      top,
      height: line.height,
      measured_width: line.width,
      ascent: line.ascent,
      descent: line.descent,
      line_gap: line.line_gap,
      baseline: line.baseline,
    };
    top += line.height;
    return result;
  });
  context.profiler?.finish('resolve_typography', started);
  const tracks = measured(context.profiler, 'compile_behaviors', () => compileLayerTracks(layer, context.timing, context.style, context.fps, context.scaleY, { typography: { size: fitted.size, axes, supported_axes: supportedAxes } }));
  lines = analyzeDynamicTypography(layer, lines, tracks, box, context, resource, axes);
  return { ...nodeBase(layer, box, tracks), type: 'text', align: layer.style.align ?? 'start', lines };
}

function compileShape(layer: ShapeLayer, box: Box, context: CompileContext): PlanNode {
  const tracks = measured(context.profiler, 'compile_behaviors', () => compileLayerTracks(layer, context.timing, context.style, context.fps, context.scaleY));
  return {
    ...nodeBase(layer, box, tracks),
    type: 'shape',
    shape: layer.shape,
    radius: layer.radius ? resolveSpace(context.style, layer.radius, context.scaleX) : 0,
    fill: layer.fill ? resolveColor(context.style, layer.fill) : null,
    stroke: layer.stroke ? { color: resolveColor(context.style, layer.stroke.color), width: (context.style.style.strokes[tokenKey(layer.stroke.weight, 'stroke')] ?? 0) * context.scaleX } : null,
  };
}

function focalPoint(layer: ImageLayer, resource: ImageResource): { x: number; y: number } {
  if (layer.focus && 'point' in layer.focus) return layer.focus.point;
  if (layer.focus && 'region' in layer.focus) {
    const regionId = layer.focus.region;
    const region = resource.regions.find((candidate) => candidate.id === regionId);
    if (!region) throw new CompileError(`image.region_missing: ${resource.ref}.${regionId}`);
    return { x: region.box.x + region.box.w / 2, y: region.box.y + region.box.h / 2 };
  }
  return resource.focal_point ?? { x: 0.5, y: 0.5 };
}

function focusTrackContext(layer: ImageLayer, resource: ImageResource, box: Box) {
  const focus = layer.behaviors.find((behavior) => behavior.behavior === 'FOCUS_REGION');
  const regionId = typeof focus?.params?.['region'] === 'string' ? focus.params['region'] : layer.focus && 'region' in layer.focus ? layer.focus.region : undefined;
  const region = regionId ? resource.regions.find((candidate) => candidate.id === regionId) : undefined;
  if (!region) return {};
  const centerX = region.box.x + region.box.w / 2;
  const centerY = region.box.y + region.box.h / 2;
  const scale = typeof focus?.params?.['scale'] === 'number' ? focus.params['scale'] : 1.08;
  // Le déplacement compense le zoom autour du centre ; il reste donc subtil
  // et ne peut pas découvrir les bords du conteneur comme un pan complet.
  return { focus: { translate_x: (0.5 - centerX) * box.w * (scale - 1), translate_y: (0.5 - centerY) * box.h * (scale - 1), scale } };
}

function compileImage(layer: ImageLayer, box: Box, context: CompileContext): PlanImageNode {
  const started = context.profiler?.start() ?? 0;
  const resource = context.assetResources[layer.asset];
  if (!resource) throw new CompileError(`asset.missing: « ${layer.asset} » absent`);
  validateImageResource(resource);
  const focal = focalPoint(layer, resource);
  const placement = placeImage(resource, { x: 0, y: 0, w: box.w, h: box.h }, layer.fit, focal, layer.crop);
  const treatment = context.style.style.image_treatment;
  context.assets.set(resource.ref, {
    ref: resource.ref, file: resource.file, sha256: resource.sha256, width: resource.width, height: resource.height, mime: resource.mime,
    provenance: resource.provenance, semantic_regions: resource.regions,
    transformations: [`fit:${layer.fit}`, `focal:${focal.x.toFixed(4)},${focal.y.toFixed(4)}`, `crop:${placement.crop.x.toFixed(3)},${placement.crop.y.toFixed(3)},${placement.crop.w.toFixed(3)},${placement.crop.h.toFixed(3)}`, `grade:${treatment.grade}`],
  });
  context.profiler?.finish('resolve_assets', started);
  const tracks = measured(context.profiler, 'compile_behaviors', () => compileLayerTracks(layer, context.timing, context.style, context.fps, context.scaleY, focusTrackContext(layer, resource, box)));
  return {
    ...nodeBase(layer, box, tracks),
    type: 'image', asset: resource.ref, fit: layer.fit, crop: placement.crop, destination: placement.destination, focal_point: focal,
    semantic_regions: resource.regions,
    treatment: {
      grade: treatment.grade, contrast: treatment.contrast, grain: treatment.grain,
      duotone: treatment.duotone ? { dark: resolveColor(context.style, treatment.duotone.dark), light: resolveColor(context.style, treatment.duotone.light) } : null,
    },
  };
}

function matchedGeometry(layer: PathLayer, box: Box, siblings: ReadonlyMap<string, Box>): PathLayer['geometry'] | null {
  const match = layer.behaviors.find((behavior) => behavior.behavior === 'MATCH_LINE');
  if (!match) return null;
  const fromId = match.params?.['from_layer'];
  const toId = match.params?.['to_layer'];
  if (typeof fromId !== 'string' || typeof toId !== 'string') throw new CompileError(`match_line.targets_missing: ${layer.id}`);
  const from = siblings.get(fromId);
  const to = siblings.get(toId);
  if (!from || !to) throw new CompileError(`match_line.target_unknown: ${String(fromId)} → ${String(toId)}`);
  const normalize = (value: Box) => ({ x: Math.min(1, Math.max(0, (value.x + value.w / 2 - box.x) / box.w)), y: Math.min(1, Math.max(0, (value.y + value.h / 2 - box.y) / box.h)) });
  return { points: [normalize(from), normalize(to)] };
}

function compilePath(layer: PathLayer, box: Box, context: CompileContext, siblings: ReadonlyMap<string, Box>): PlanPathNode {
  const motif = 'motif' in layer.geometry ? context.style.style.motifs[tokenKey(layer.geometry.motif, 'motif')] : undefined;
  const geometry = matchedGeometry(layer, box, siblings) ?? layer.geometry;
  const d = compileNormalizedPath(geometry, box, motif && motif.kind === 'line' ? motif.length_cols / context.style.style.grid.columns : 1);
  const tracks = measured(context.profiler, 'compile_behaviors', () => compileLayerTracks(layer, context.timing, context.style, context.fps, context.scaleY));
  return {
    ...nodeBase(layer, box, tracks),
    type: 'path', d,
    stroke: { color: resolveColor(context.style, layer.style.stroke), width: (context.style.style.strokes[tokenKey(layer.style.weight, 'stroke')] ?? 1) * context.scaleX, cap: layer.style.cap ?? 'butt', join: layer.style.join ?? 'miter' },
    progress: layer.progress ?? 1,
  };
}

function slotExtent(slot: PatternSlot, layer: Layer, context: CompileContext, axis: 'width' | 'height', available: number): number {
  const size = slot[axis];
  if (size.kind === 'fill') return available;
  if (size.kind === 'space') return resolveSpace(context.style, size.token, axis === 'width' ? context.scaleX : context.scaleY);
  if (layer.primitive !== 'text') throw new CompileError(`La dimension content exige un calque texte (${layer.id}).`);
  const type = resolveType(context.style, layer.style.type);
  if (axis === 'width') return available;
  return explicitLines(layer).length * type.size * context.scaleX * type.line_height;
}

function findImage(layer: Layer, id?: string): ImageLayer | null {
  if (layer.primitive === 'image' && (id === undefined || layer.id === id)) return layer;
  if (layer.primitive === 'group' || layer.primitive === 'mask') {
    for (const nested of layer.children) {
      const found = findImage(nested, id);
      if (found) return found;
    }
  }
  return null;
}

function negativeSpaceBox(group: GroupLayer, child: Layer, childBoxes: ReadonlyMap<string, Box>, context: CompileContext): Box | null {
  if (child.primitive !== 'text' || !child.slot?.includes('negative_space')) return null;
  const owner = group.children.find((candidate) => findImage(candidate) !== null);
  const image = owner ? findImage(owner) : null;
  if (!owner || !image) return null;
  const resource = context.assetResources[image.asset];
  const region = resource?.regions.find((candidate) => candidate.kind === 'negative_space');
  const imageBox = childBoxes.get(owner.id);
  if (!region || !imageBox) return null;
  const regionBox = normalizedRegionBox(region.box, imageBox);
  const inset = Math.min(regionBox.w / 4, regionBox.h / 4, resolveSpace(context.style, 'space.sm', context.scaleX));
  return { x: regionBox.x + inset, y: regionBox.y + inset, w: regionBox.w - inset * 2, h: regionBox.h - inset * 2 };
}

function highlightRegionBox(group: GroupLayer, child: Layer, childBoxes: ReadonlyMap<string, Box>, context: CompileContext): Box | null {
  const highlight = child.behaviors.find((behavior) => behavior.behavior === 'HIGHLIGHT_REGION');
  if (!highlight) return null;
  const imageId = highlight.params?.['image_layer'];
  const regionId = highlight.params?.['region'];
  if (typeof imageId !== 'string' || typeof regionId !== 'string') throw new CompileError(`highlight_region.targets_missing: ${child.id}`);
  const owner = group.children.find((candidate) => findImage(candidate, imageId) !== null);
  const image = owner ? findImage(owner, imageId) : null;
  const ownerBox = owner ? childBoxes.get(owner.id) : undefined;
  if (!owner || !image || !ownerBox) throw new CompileError(`highlight_region.image_unknown: ${imageId}`);
  const resource = context.assetResources[image.asset];
  const region = resource?.regions.find((candidate) => candidate.id === regionId);
  if (!resource || !region) throw new CompileError(`highlight_region.region_unknown: ${image.asset}.${regionId}`);
  const focal = focalPoint(image, resource);
  const placement = placeImage(resource, { x: 0, y: 0, w: ownerBox.w, h: ownerBox.h }, image.fit, focal, image.crop);
  const scaleX = placement.destination.w / placement.crop.w;
  const scaleY = placement.destination.h / placement.crop.h;
  const source = {
    x: region.box.x * resource.width,
    y: region.box.y * resource.height,
    w: region.box.w * resource.width,
    h: region.box.h * resource.height,
  };
  const mapped = {
    x: ownerBox.x + placement.destination.x + (source.x - placement.crop.x) * scaleX,
    y: ownerBox.y + placement.destination.y + (source.y - placement.crop.y) * scaleY,
    w: source.w * scaleX,
    h: source.h * scaleY,
  };
  const padding = resolveSpace(context.style, 'space.xs', context.scaleX);
  return intersectBoxes(ownerBox, { x: mapped.x - padding, y: mapped.y - padding, w: mapped.w + padding * 2, h: mapped.h + padding * 2 });
}

function childBoxes(group: GroupLayer, groupBox: Box, pattern: PatternDefinition, context: CompileContext): Map<string, Box> {
  const local = { x: 0, y: 0, w: groupBox.w, h: groupBox.h };
  const result = new Map<string, Box>();
  const grid = { columns: context.style.style.grid.columns, rows: context.style.style.grid.rows, gutter: context.style.style.grid.gutter * context.scaleX };
  for (const child of group.children) if (child.placement) result.set(child.id, gridPlacementBox(child.placement, local, grid));
  for (const child of group.children) {
    if (result.has(child.id)) continue;
    const negative = negativeSpaceBox(group, child, result, context);
    if (negative) result.set(child.id, negative);
  }
  for (const child of group.children) {
    const highlight = highlightRegionBox(group, child, result, context);
    if (highlight) result.set(child.id, highlight);
  }
  if (result.size === group.children.length) return result;
  const bySlot = new Map(group.children.map((child) => [child.slot, child]));
  const items = [...pattern.slots].sort((a, b) => a.order - b.order).flatMap((slot) => {
    const layer = bySlot.get(slot.id);
    if (!layer || result.has(layer.id)) return [];
    if (layer.primitive !== slot.primitive) throw new CompileError(`Slot « ${slot.id} » incompatible avec ${layer.primitive}.`);
    return [{ slot, layer, width: slotExtent(slot, layer, context, 'width', groupBox.w), height: slotExtent(slot, layer, context, 'height', groupBox.h) }];
  });
  const gap = resolveSpace(context.style, pattern.layout.gap, context.scaleY);
  const total = items.reduce((sum, item) => sum + item.height, 0) + gap * Math.max(0, items.length - 1);
  let y = alignOffset(groupBox.h, total, pattern.layout.align_y);
  for (const item of items) {
    result.set(item.layer.id, { x: alignOffset(groupBox.w, item.width, pattern.layout.align_x), y, w: item.width, h: item.height });
    y += item.height + gap;
  }
  for (const child of group.children) if (!result.has(child.id)) result.set(child.id, { ...local });
  return result;
}

function compileMask(layer: MaskLayer, box: Box, context: CompileContext): PlanNode {
  const local = { x: 0, y: 0, w: box.w, h: box.h };
  const grid = { columns: context.style.style.grid.columns, rows: context.style.style.grid.rows, gutter: context.style.style.grid.gutter * context.scaleX };
  const siblings = new Map(layer.children.map((child) => [child.id, child.placement ? gridPlacementBox(child.placement, local, grid) : local]));
  const tracks = measured(context.profiler, 'compile_behaviors', () => compileLayerTracks(layer, context.timing, context.style, context.fps, context.scaleY));
  return {
    ...nodeBase(layer, box, tracks),
    type: 'mask',
    clip: { shape: layer.clip.shape, radius: layer.clip.radius ? resolveSpace(context.style, layer.clip.radius, context.scaleX) : 0, mode: layer.clip.mode ?? 'clip', direction: layer.clip.direction ?? 'left_to_right' },
    children: layer.children.map((child) => compileLayer(child, siblings.get(child.id)!, context, siblings)),
  };
}

function compileLayer(layer: Layer, box: Box, context: CompileContext, siblings: ReadonlyMap<string, Box>): PlanNode {
  if (layer.primitive === 'text') return compileText(layer, box, context);
  if (layer.primitive === 'shape') return compileShape(layer, box, context);
  if (layer.primitive === 'image') return compileImage(layer, box, context);
  if (layer.primitive === 'path') return compilePath(layer, box, context, siblings);
  if (layer.primitive === 'mask') return compileMask(layer, box, context);
  return compileGroup(layer, box, context.pattern, context);
}

function compileGroup(group: GroupLayer, groupBox: Box, pattern: PatternDefinition, context: CompileContext): PlanNode {
  const boxes = measured(context.profiler, 'resolve_layout', () => childBoxes(group, groupBox, pattern, context));
  const children = group.children.map((child) => compileLayer(child, boxes.get(child.id)!, context, boxes));
  const tracks = measured(context.profiler, 'compile_behaviors', () => compileLayerTracks(group, context.timing, context.style, context.fps, context.scaleY));
  return { ...nodeBase(group, groupBox, tracks), type: 'group', children };
}

/** Compilation pure : aucun accès disque, aucune horloge, aucun hasard. */
function compileRenderPlan(input: CompileInput, profiler?: CompileProfiler): RenderPlan {
  const validationStarted = profiler?.start() ?? 0;
  const registry = input.behaviorRegistry ?? P14_BEHAVIOR_REGISTRY;
  assertStyleVersionPolicy(input.resolvedStyle, input.previousStyle ?? null);
  failValidation('PatternDefinition', validatePatternDefinition(input.pattern));
  failValidation('PlatformPresets', validatePlatformPresets(input.platformPresets));
  failValidation('MotionSceneSpecification', validateSpec(input.spec, input.resolvedStyle, {
    allowStyleSubstitution: input.allowStyleSubstitution ?? false,
    registry,
    assetRefs: new Set(Object.keys(input.assetResources ?? {})),
  }));
  if (!Number.isInteger(input.config.fps) || input.config.fps <= 0) throw new CompileError('fps doit être un entier positif.');
  if (input.config.scene_duration_frames !== undefined && (!Number.isInteger(input.config.scene_duration_frames) || input.config.scene_duration_frames <= 0)) throw new CompileError('scene_duration_frames doit être un entier positif quand il est fourni.');
  if (input.spec.system.id !== input.pattern.id || input.spec.system.version !== input.pattern.version) throw new CompileError('Le PatternDefinition ne correspond pas au système déclaré par la spec.');
  const limits = resolveEngineLimits(input.config.limits);
  assertInputLimits(input.spec, input.assetResources ?? {}, limits);
  profiler?.finish('validate_inputs', validationStarted);

  const layoutStarted = profiler?.start() ?? 0;
  const renderScale = input.config.render_scale ?? 1;
  const geometry = resolveRenderGeometry({
    format: input.spec.format,
    platform_presets: input.platformPresets,
    resolved_style: input.resolvedStyle,
    render_scale: renderScale,
  }, (message) => new CompileError(message));
  const canvas = geometry.canvas;
  const safe = geometry.safe_zone;
  profiler?.finish('resolve_layout', layoutStarted);
  const fonts = new Map<string, RenderPlan['fonts'][number]>();
  const assets = new Map<string, RenderPlan['assets'][number]>();
  const textEngine = new HarfBuzzTextEngine();
  const temporal = measured(profiler, 'resolve_temporal', () => resolveTemporalPlan({
    spec: input.spec, resolvedStyle: input.resolvedStyle, fps: input.config.fps, registry,
    ...(input.config.reduced_motion !== undefined ? { reducedMotion: input.config.reduced_motion } : {}),
    ...(input.config.scene_duration_frames !== undefined ? { fallbackSceneFrames: input.config.scene_duration_frames } : {}),
    ...(input.config.max_render_cost !== undefined ? { maxRenderCost: input.config.max_render_cost } : {}),
    ...(input.config.max_attention_cost !== undefined ? { maxAttentionCost: input.config.max_attention_cost } : {}),
  }));
  const scenes = input.spec.scenes.map((scene, index) => {
    if (scene.pattern.id !== input.pattern.id || scene.pattern.version !== input.pattern.version) throw new CompileError(`La scène ${scene.id} utilise un autre pattern.`);
    const timing = temporal.scenes[index];
    if (!timing) throw new CompileError(`Résolution temporelle absente pour ${scene.id}.`);
    const context: CompileContext = {
      style: input.resolvedStyle, spec: input.spec, pattern: input.pattern,
      scaleX: canvas.width / input.resolvedStyle.style.reference_canvas.width,
      scaleY: canvas.height / input.resolvedStyle.style.reference_canvas.height,
      fonts, assets, fontResources: input.fontResources, assetResources: input.assetResources ?? {}, timing, fps: input.config.fps,
      minimumReadableSize: input.config.minimum_readable_size ?? Math.max(14, 28 * renderScale), textEngine, limits,
      ...(profiler ? { profiler } : {}),
    };
    const nodes = scene.layers.map((layer) => {
      if (layer.primitive !== 'group') throw new CompileError('Le calque racine doit être un Group.');
      return compileGroup(layer, safe, input.pattern, context);
    });
    const transition = temporal.transitions.find((candidate) => candidate.from_scene === scene.id);
    return {
      id: scene.id, from: timing.from_frame, to: timing.to_frame, background: resolveColor(input.resolvedStyle, scene.background.fill), nodes,
      transition_out: transition ? { kind: transition.behavior === 'CUT' ? 'cut' as const : 'tracks' as const, behavior: { id: transition.behavior, version: transition.version }, to_scene: transition.to_scene, at_frame: transition.at_frame } : null,
    };
  });
  const resolvedFonts = [...fonts.values()].sort((a, b) => a.id.localeCompare(b.id));
  const resolvedAssets = [...assets.values()].sort((a, b) => a.ref.localeCompare(b.ref));
  const hasDynamicTypography = scenes.some((scene) => scene.nodes.some(nodeHasDynamicTypography));
  const renderPlanVersion: RenderPlan['schema_version'] = hasDynamicTypography ? RENDER_PLAN_VERSION : RENDER_PLAN_LEGACY_VERSION;
  const baseWithoutRequirements = {
    schema: 'render-plan' as const,
    schema_version: renderPlanVersion,
    spec: { spec_id: input.spec.spec_id, revision: input.spec.revision, sha256: hashDocument(input.spec) },
    style: { mode: input.resolvedStyle.mode, sha256: input.resolvedStyle.sha256 },
    compiler_version: hasDynamicTypography ? DYNAMIC_TYPOGRAPHY_COMPILER_VERSION : COMPILER_VERSION,
    canvas: { width: canvas.width, height: canvas.height, fps: input.config.fps, duration_frames: temporal.duration_frames },
    safe_zone: safe,
    provenance: { timing_source: temporal.timing_source, behavior_registry_fingerprint: behaviorRegistryFingerprint(registry), text_engine: textEngine.descriptor },
    fonts: resolvedFonts,
    assets: resolvedAssets,
    scenes,
  };
  const base = { ...baseWithoutRequirements, requirements: rendererRequirements({ scenes, fonts: resolvedFonts }) };
  const preflight = measured(profiler, 'quality_preflight', () => buildQualityPreflight(base));
  if (preflight.status === 'fail') throw new CompileError(`Quality preflight refusé — ${preflight.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.code).join(', ')}`, preflight.issues);
  const plan = measured(profiler, 'build_render_plan', () => {
    const parsed = RenderPlanSchema.parse({ ...base, preflight });
    failValidation('RenderPlan', validateRenderPlan(parsed));
    assertPlanLimits(parsed, limits);
    return parsed;
  });
  return plan;
}

export const COMPILER_PIPELINE_PHASES = [
  'validate_inputs', 'resolve_dependencies', 'resolve_temporal', 'resolve_layout', 'resolve_typography',
  'resolve_assets', 'compile_behaviors', 'resolve_audio_plan', 'resolve_subtitles',
  'quality_preflight', 'build_render_plan', 'build_manifest',
] as const;

const PURE_COMPILER_PHASES = COMPILER_PIPELINE_PHASES.slice(0, -1) as readonly (typeof COMPILER_PIPELINE_PHASES)[number][];

export interface CompilerPipelineResult {
  render_plan: RenderPlan;
  audio_plan: AudioPlan;
  subtitle_plan: SubtitlePlan;
  preflight: RenderPlan['preflight'];
  dependency_graph: DependencyGraph;
  hashes: { render_plan: string; audio_plan: string; subtitle_plan: string; dependency_graph: string };
  phases: readonly (typeof COMPILER_PIPELINE_PHASES)[number][];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

/** Pipeline P1.5 pur : aucun disque, réseau, hasard ou horloge. */
function compilePipelineInternal(input: CompileInput, profiler?: CompileProfiler): CompilerPipelineResult {
  let renderPlan = compileRenderPlan(input, profiler);
  const audioPlan = measured(profiler, 'resolve_audio_plan', () => compileAudioPlan(input.spec, input.resolvedStyle, renderPlan));
  const minimumReadableSize = input.config.minimum_readable_size ?? Math.max(14, 28 * (input.config.render_scale ?? 1));
  const subtitles = measured(profiler, 'resolve_subtitles', () => compileSubtitlePlan(input.spec, input.resolvedStyle, renderPlan, audioPlan, input.fontResources, minimumReadableSize));
  if (subtitles.font && !renderPlan.fonts.some((font) => font.id === subtitles.font!.id)) {
    const { preflight: _oldPreflight, requirements: _oldRequirements, ...base } = renderPlan;
    const fonts = [...renderPlan.fonts, subtitles.font].sort((a, b) => a.id.localeCompare(b.id));
    const requirements = rendererRequirements({ scenes: renderPlan.scenes, fonts });
    const draft = { ...base, fonts, requirements };
    const preflight = measured(profiler, 'quality_preflight', () => buildQualityPreflight(draft, { audioPlan, subtitlePlan: subtitles.plan }));
    renderPlan = RenderPlanSchema.parse({ ...draft, preflight });
  } else {
    const { preflight: _oldPreflight, ...draft } = renderPlan;
    const preflight = measured(profiler, 'quality_preflight', () => buildQualityPreflight(draft, { audioPlan, subtitlePlan: subtitles.plan }));
    renderPlan = RenderPlanSchema.parse({ ...draft, preflight });
  }
  assertPlanLimits(renderPlan, resolveEngineLimits(input.config.limits));
  assertAuxiliaryPlanLimits(audioPlan, subtitles.plan, resolveEngineLimits(input.config.limits));
  const graph = measured(profiler, 'resolve_dependencies', () => buildDependencyGraph(input.spec, renderPlan, audioPlan, subtitles.plan));
  const result = measured(profiler, 'build_render_plan', (): CompilerPipelineResult => ({
    render_plan: renderPlan, audio_plan: audioPlan, subtitle_plan: subtitles.plan, preflight: renderPlan.preflight,
    dependency_graph: graph,
    hashes: { render_plan: hashDocument(renderPlan), audio_plan: hashDocument(audioPlan), subtitle_plan: hashDocument(subtitles.plan), dependency_graph: graph.sha256 },
    phases: PURE_COMPILER_PHASES,
  }));
  return deepFreeze(result);
}

export function compilePipeline(input: CompileInput): CompilerPipelineResult {
  return compilePipelineInternal(input);
}

export function profileCompilePipeline(input: CompileInput, now: () => number): { result: CompilerPipelineResult; metrics: CompilerPhaseMetrics } {
  const profiler = new CompileProfiler(now);
  const started = profiler.start();
  const result = compilePipelineInternal(input, profiler);
  return { result, metrics: profiler.snapshot(profiler.start() - started) };
}

/** Compatibilité P1.1–P1.4 : renvoie la sortie RenderPlan du pipeline fermé. */
export function compileMotionScene(input: CompileInput): RenderPlan {
  return compilePipeline(input).render_plan;
}

/** Frontière obligatoire avant tout lancement renderer. */
export type CompilationManifestContext = Omit<ManifestInput, 'spec' | 'resolvedStyle' | 'plan' | 'audioPlan' | 'subtitlePlan' | 'dependencyGraph' | 'rendererDescriptor' | 'pattern'>;
export interface RenderCompilationResult extends CompilerPipelineResult {
  manifest: ReproducibilityManifest;
}

export interface ProfiledRenderCompilationResult {
  result: RenderCompilationResult;
  metrics: CompilerPhaseMetrics;
}

export function compileForRender(input: CompileInput, renderer: RendererDescriptor, manifest: CompilationManifestContext): RenderCompilationResult {
  const result = compilePipeline(input);
  assertRenderGate(result.render_plan, renderer);
  const reproducibilityManifest = buildReproducibilityManifest({
    ...manifest,
    spec: input.spec,
    resolvedStyle: input.resolvedStyle,
    plan: result.render_plan,
    audioPlan: result.audio_plan,
    subtitlePlan: result.subtitle_plan,
    dependencyGraph: result.dependency_graph,
    rendererDescriptor: renderer,
    pattern: { id: input.pattern.id, version: input.pattern.version, sha256: hashDocument(input.pattern) },
  });
  return deepFreeze({ ...result, phases: COMPILER_PIPELINE_PHASES, manifest: reproducibilityManifest });
}

export function profileCompileForRender(input: CompileInput, renderer: RendererDescriptor, manifest: CompilationManifestContext, now: () => number): ProfiledRenderCompilationResult {
  const profiler = new CompileProfiler(now);
  const started = profiler.start();
  const result = compilePipelineInternal(input, profiler);
  assertRenderGate(result.render_plan, renderer);
  const reproducibilityManifest = measured(profiler, 'build_manifest', () => buildReproducibilityManifest({
    ...manifest,
    spec: input.spec,
    resolvedStyle: input.resolvedStyle,
    plan: result.render_plan,
    audioPlan: result.audio_plan,
    subtitlePlan: result.subtitle_plan,
    dependencyGraph: result.dependency_graph,
    rendererDescriptor: renderer,
    pattern: { id: input.pattern.id, version: input.pattern.version, sha256: hashDocument(input.pattern) },
  }));
  const compilation = deepFreeze({ ...result, phases: COMPILER_PIPELINE_PHASES, manifest: reproducibilityManifest });
  return { result: compilation, metrics: profiler.snapshot(profiler.start() - started) };
}
