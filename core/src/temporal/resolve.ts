import type { P13AnchorKind } from '../contracts/behavior.ts';
import type { Anchor, Duration, Offset, RhythmPhase } from '../contracts/common.ts';
import type { BehaviorInstance, Layer, MotionSceneSpec, Scene, TextLayer } from '../contracts/motion-spec.ts';
import type { ResolvedStyle } from '../contracts/resolved-style.ts';
import type { BehaviorDefinition } from '../contracts/behavior.ts';
import { P13_BEHAVIOR_REGISTRY } from '../motion/behavior-registry.ts';
import type { BehaviorRegistry } from '../motion/behavior-registry.ts';

export interface TemporalDiagnostic {
  code: string;
  path: string;
  message: string;
  details?: Readonly<Record<string, number | string>>;
}

export class TemporalResolutionError extends Error {
  readonly diagnostics: readonly TemporalDiagnostic[];

  constructor(diagnostics: readonly TemporalDiagnostic[]) {
    super(diagnostics.map((issue) => `${issue.code} ${issue.path}: ${issue.message}`).join('\n'));
    this.name = 'TemporalResolutionError';
    this.diagnostics = diagnostics;
  }
}

export interface ResolvedBehaviorTiming {
  instance_id: string;
  behavior: string;
  version: string;
  layer_id: string;
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  stagger_ms: number;
  reduced_motion: boolean;
  definition: BehaviorDefinition;
}

export interface ResolvedSceneTiming {
  scene_id: string;
  phase: RhythmPhase;
  start_ms: number;
  end_ms: number;
  from_frame: number;
  to_frame: number;
  beat_ms: number;
  readability_ms: number;
  reading_available_ms: number;
  behaviors: readonly ResolvedBehaviorTiming[];
}

export interface TemporalResolution {
  duration_ms: number;
  duration_frames: number;
  timing_source: 'explicit_duration' | 'voice_timestamps' | 'fallback_frames';
  scenes: readonly ResolvedSceneTiming[];
  transitions: readonly ResolvedTransitionTiming[];
}

export interface TemporalAnalysis {
  readonly resolution: TemporalResolution;
  readonly diagnostics: readonly TemporalDiagnostic[];
}

export interface ResolvedTransitionTiming {
  from_scene: string;
  to_scene: string;
  behavior: string;
  version: string;
  at_frame: number;
}

export interface ResolveTemporalInput {
  spec: MotionSceneSpec;
  resolvedStyle: ResolvedStyle;
  fps: number;
  registry?: BehaviorRegistry;
  reducedMotion?: boolean;
  fallbackSceneFrames?: number;
  maxRenderCost?: number;
  maxAttentionCost?: number;
}

interface BehaviorEntry {
  instance: BehaviorInstance;
  layer: Layer;
  layerId: string;
  path: string;
  index: number;
  definition: BehaviorDefinition;
  durationMs: number;
  staggerMs: number;
}

const roundMs = (value: number): number => Math.round(value);
const frameAt = (ms: number, fps: number): number => Math.round((ms * fps) / 1_000);

export function durationToMs(duration: Duration, beatMs: number, breathMs: number): number {
  if ('ms' in duration) return duration.ms;
  if ('beats' in duration) return roundMs(duration.beats * beatMs);
  return roundMs(duration.breaths * breathMs);
}

function offsetToMs(offset: Offset | undefined, beatMs: number, breathMs: number): number {
  if (!offset) return 0;
  if ('ms' in offset) return offset.ms;
  if ('beats' in offset) return roundMs(offset.beats * beatMs);
  return roundMs(offset.breaths * breathMs);
}

export function anchorKind(anchor: Anchor): P13AnchorKind | 'VOICE_SEGMENT' {
  if ('semantic' in anchor) return anchor.semantic;
  if ('layer' in anchor) return anchor.layer.relation;
  if ('event' in anchor) return anchor.event === 'scene.start' ? 'SCENE_START' : 'SCENE_END';
  if ('after' in anchor) return 'AFTER_PREVIOUS';
  if ('with' in anchor) return 'WITH_LAYER';
  return 'VOICE_SEGMENT';
}

export function readabilityWordCount(text: string, locale: string): number {
  const segmented = text.trim().match(/[\p{L}\p{N}]+(?:[’'][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  if (/^(zh|ja|ko)(-|$)/i.test(locale)) return Math.max(segmented, Math.ceil([...text.replace(/\s/gu, '')].length / 3));
  return segmented;
}

export function minimumReadabilityMs(
  text: string,
  role: Scene['purpose'],
  locale: string,
  reading: { ms_per_word: number; min_hold_ms: number },
): number {
  const localeFactor = /^fr(-|$)/i.test(locale) ? 1.05 : /^(de|nl)(-|$)/i.test(locale) ? 1.1 : 1;
  const roleFactor = role === 'hook' || role === 'tension' ? 0.9 : role === 'cta' || role === 'signature' ? 1.1 : 1;
  return Math.max(reading.min_hold_ms, roundMs(readabilityWordCount(text, locale) * reading.ms_per_word * localeFactor * roleFactor));
}

export function maximumReadableWords(
  availableMs: number,
  role: Scene['purpose'],
  locale: string,
  reading: { ms_per_word: number; min_hold_ms: number },
): number {
  if (availableMs < reading.min_hold_ms) return 0;
  let low = 0;
  let high = Math.max(1, Math.ceil(availableMs / Math.max(1, reading.ms_per_word)) * 2);
  const synthetic = (count: number): string => Array.from({ length: count }, () => 'mot').join(' ');
  while (minimumReadabilityMs(synthetic(high), role, locale, reading) <= availableMs) high *= 2;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (minimumReadabilityMs(synthetic(middle), role, locale, reading) <= availableMs) low = middle;
    else high = middle;
  }
  return low;
}

export function stableReadingWindowMs(
  sceneStart: number,
  sceneEnd: number,
  behaviors: readonly Pick<ResolvedBehaviorTiming, 'behavior' | 'start_ms' | 'end_ms'>[],
): number {
  const stableAt = Math.max(sceneStart, ...behaviors
    .filter((item) => ['REVEAL_TEXT', 'ACCENT_WORD', 'SETTLE'].includes(item.behavior))
    .map((item) => item.end_ms));
  const exitAt = Math.min(sceneEnd, ...behaviors
    .filter((item) => item.behavior === 'EXIT_CLEAR')
    .map((item) => item.start_ms));
  return Math.max(0, exitAt - stableAt);
}

function visitLayers(layers: readonly Layer[], path: string, result: { layer: Layer; path: string }[] = []) {
  layers.forEach((layer, index) => {
    const current = `${path}[${index}]`;
    result.push({ layer, path: current });
    if (layer.primitive === 'group' || layer.primitive === 'mask') visitLayers(layer.children, `${current}.children`, result);
  });
  return result;
}

function textOf(layer: TextLayer): string {
  return layer.content.runs.map((run) => run.text).join(' ');
}

function staggerFor(instance: BehaviorInstance, layer: Layer, beatMs: number, style: ResolvedStyle): number {
  if (instance.behavior !== 'REVEAL_TEXT' || layer.primitive !== 'text') return 0;
  if ((instance.params?.['unit'] ?? 'line') !== 'line') return 0;
  const mode = instance.params?.['stagger'];
  const factor = mode === 'tight' ? 0.1 : mode === 'normal' ? 0.18 : mode === 'wide' ? 0.3 : Math.min(0.25, 0.12 + style.style.motion_personality.max_overshoot);
  return Math.max(1, roundMs(beatMs * factor));
}

function staggerItems(instance: BehaviorInstance, layer: Layer): number {
  if (instance.behavior !== 'REVEAL_TEXT' || layer.primitive !== 'text' || (instance.params?.['unit'] ?? 'line') !== 'line') return 1;
  return Math.max(1, layer.content.runs.filter((run) => run.break_after).length + 1);
}

function resolveSceneDuration(scene: Scene, beatMs: number, breathMs: number, fallbackFrames: number | undefined, fps: number): number | null {
  if (fallbackFrames !== undefined) return roundMs((fallbackFrames * 1_000) / fps);
  if ('duration' in scene.timing.anchor) return durationToMs(scene.timing.anchor.duration, beatMs, breathMs);
  return null;
}

function validateBudgets(entries: readonly ResolvedBehaviorTiming[], maxRender: number, maxAttention: number, diagnostics: TemporalDiagnostic[], scenePath: string): void {
  const points = [...new Set(entries.flatMap((entry) => [entry.start_ms, Math.max(entry.start_ms + 1, entry.end_ms)]))].sort((a, b) => a - b);
  for (const point of points) {
    const active = entries.filter((entry) => entry.start_ms <= point && Math.max(entry.start_ms + 1, entry.end_ms) > point);
    const render = active.reduce((sum, entry) => sum + entry.definition.render_cost.compute, 0);
    const attention = active.reduce((sum, entry) => sum + entry.definition.render_cost.attention, 0);
    if (render > maxRender || attention > maxAttention) {
      diagnostics.push({
        code: 'motion.budget_exceeded',
        path: scenePath,
        message: `budget dépassé à ${point} ms (render ${render}/${maxRender}, attention ${attention}/${maxAttention})`,
        details: { at_ms: point, render, attention },
      });
      return;
    }
  }
}

export function analyzeTemporalPlan(input: ResolveTemporalInput): TemporalAnalysis {
  const registry = input.registry ?? P13_BEHAVIOR_REGISTRY;
  const style = input.resolvedStyle.style;
  const diagnostics: TemporalDiagnostic[] = [];
  const sectionPhase = new Map(input.spec.rhythm.sections.flatMap((section) => section.scenes.map((scene) => [scene, section.phase] as const)));
  const scenes: ResolvedSceneTiming[] = [];
  let timelineMs = 0;

  input.spec.scenes.forEach((scene, sceneIndex) => {
    const scenePath = `scenes[${sceneIndex}]`;
    const phase = sectionPhase.get(scene.id) ?? 'CALM';
    const beatMs = style.rhythm_personality.tempo.beat_ms[phase];
    const breathMs = style.rhythm_personality.tempo.breath_ms;
    const durationMs = resolveSceneDuration(scene, beatMs, breathMs, input.fallbackSceneFrames, input.fps);
    if (durationMs === null) {
      diagnostics.push({ code: 'temporal.voice_unavailable', path: `${scenePath}.timing.anchor`, message: 'les timestamps voix ne sont pas disponibles en P1.3' });
      return;
    }
    const sceneStart = timelineMs;
    const sceneEnd = sceneStart + durationMs;
    const layerVisits = visitLayers(scene.layers, `${scenePath}.layers`);
    const entries: BehaviorEntry[] = [];
    layerVisits.forEach(({ layer, path }) => {
      layer.behaviors.forEach((instance, behaviorIndex) => {
        const definition = registry.definition(instance.behavior, instance.version);
        if (!definition) {
          diagnostics.push({ code: 'behavior.unknown_or_version', path: `${path}.behaviors[${behaviorIndex}]`, message: `${instance.behavior}@${instance.version} absent du registre` });
          return;
        }
        const duration = input.reducedMotion && definition.reduced_motion.strategy === 'instant'
          ? 0
          : instance.duration
            ? durationToMs(instance.duration, beatMs, breathMs)
            : roundMs(definition.duration_budget.default_beats * beatMs);
        const reducedInstant = input.reducedMotion && definition.reduced_motion.strategy === 'instant';
        if (!reducedInstant && (duration < definition.duration_budget.min_ms || duration > definition.duration_budget.max_ms)) {
          diagnostics.push({ code: 'behavior.duration_budget', path: `${path}.behaviors[${behaviorIndex}].duration`, message: `${duration} ms hors budget [${definition.duration_budget.min_ms}, ${definition.duration_budget.max_ms}]` });
        }
        entries.push({
          instance,
          layer,
          layerId: layer.id,
          path: `${path}.behaviors[${behaviorIndex}]`,
          index: entries.length,
          definition,
          durationMs: duration,
          staggerMs: staggerFor(instance, layer, beatMs, input.resolvedStyle),
        });
      });
    });

    const resolved = new Map<string, ResolvedBehaviorTiming>();
    for (let pass = 0; pass <= entries.length; pass += 1) {
      let progressed = false;
      for (const entry of entries) {
        if (resolved.has(entry.instance.id)) continue;
        const anchor = entry.instance.at;
        const offset = offsetToMs(anchor.offset, beatMs, breathMs);
        const effectiveDuration = entry.durationMs + entry.staggerMs * (staggerItems(entry.instance, entry.layer) - 1);
        let start: number | undefined;
        if ('event' in anchor) start = anchor.event === 'scene.start' ? sceneStart : sceneEnd - effectiveDuration;
        else if ('semantic' in anchor) {
          if (anchor.semantic === 'SCENE_START') start = sceneStart;
          else if (anchor.semantic === 'SCENE_END' || anchor.semantic === 'BEFORE_NEXT') start = sceneEnd - effectiveDuration;
          else if (anchor.semantic === 'AFTER_PREVIOUS') start = entry.index === 0 ? sceneStart : resolved.get(entries[entry.index - 1]!.instance.id)?.end_ms;
        } else if ('after' in anchor) start = resolved.get(anchor.after)?.end_ms;
        else if ('with' in anchor) start = resolved.get(anchor.with)?.start_ms;
        else if ('layer' in anchor) {
          const targets = [...resolved.values()].filter((value) => value.layer_id === anchor.layer.id);
          if (targets.length > 0) start = anchor.layer.relation === 'WITH_LAYER' ? Math.min(...targets.map((value) => value.start_ms)) : Math.max(...targets.map((value) => value.end_ms));
        }
        if (start === undefined) continue;
        start += offset;
        resolved.set(entry.instance.id, {
          instance_id: entry.instance.id,
          behavior: entry.instance.behavior,
          version: entry.instance.version,
          layer_id: entry.layerId,
          start_ms: start,
          end_ms: start + effectiveDuration,
          duration_ms: entry.durationMs,
          stagger_ms: entry.staggerMs,
          reduced_motion: input.reducedMotion ?? false,
          definition: entry.definition,
        });
        progressed = true;
      }
      if (!progressed) break;
    }
    for (const entry of entries) {
      if (!resolved.has(entry.instance.id)) diagnostics.push({ code: 'anchor.unresolved', path: `${entry.path}.at`, message: `ancre de ${entry.instance.id} impossible à résoudre` });
    }

    const resolvedEntries = entries.flatMap((entry) => {
      const value = resolved.get(entry.instance.id);
      return value ? [value] : [];
    });
    resolvedEntries.forEach((entry) => {
      if (entry.start_ms < sceneStart || entry.end_ms > sceneEnd) {
        diagnostics.push({ code: 'temporal.out_of_scene', path: scenePath, message: `${entry.instance_id} sort de [${sceneStart}, ${sceneEnd}]`, details: { start_ms: entry.start_ms, end_ms: entry.end_ms } });
      }
    });
    for (let leftIndex = 0; leftIndex < resolvedEntries.length; leftIndex += 1) {
      const left = resolvedEntries[leftIndex]!;
      for (let rightIndex = leftIndex + 1; rightIndex < resolvedEntries.length; rightIndex += 1) {
        const right = resolvedEntries[rightIndex]!;
        if (left.layer_id !== right.layer_id) continue;
        const overlaps = left.start_ms < Math.max(right.start_ms + 1, right.end_ms) && right.start_ms < Math.max(left.start_ms + 1, left.end_ms);
        const incompatible = left.definition.incompatibilities.includes(right.behavior) || right.definition.incompatibilities.includes(left.behavior);
        if (overlaps && incompatible) {
          diagnostics.push({
            code: 'behavior.incompatible',
            path: scenePath,
            message: `${left.behavior} et ${right.behavior} sont incompatibles sur le calque ${left.layer_id}`,
          });
        }
      }
    }

    const readability = Math.max(
      0,
      ...layerVisits.flatMap(({ layer }) => layer.primitive === 'text'
        ? [minimumReadabilityMs(textOf(layer), scene.purpose, input.spec.locale, style.rhythm_personality.reading)]
        : []),
    );
    const readingAvailable = stableReadingWindowMs(sceneStart, sceneEnd, resolvedEntries);
    if (scene.timing.min_hold === 'reading') {
      if (readingAvailable < readability) {
        diagnostics.push({
          code: 'temporal.impossible_reading',
          path: `${scenePath}.timing`,
          message: `fenêtre stable ${readingAvailable} ms, lecture minimale ${readability} ms`,
          details: { available_ms: readingAvailable, required_ms: readability },
        });
      }
    }
    validateBudgets(resolvedEntries, input.maxRenderCost ?? 8, input.maxAttentionCost ?? 8, diagnostics, scenePath);

    const fromFrame = frameAt(sceneStart, input.fps);
    const toFrame = frameAt(sceneEnd, input.fps);
    if (toFrame <= fromFrame) diagnostics.push({ code: 'temporal.empty_scene', path: scenePath, message: 'la scène ne contient aucune frame' });
    scenes.push({
      scene_id: scene.id,
      phase,
      start_ms: sceneStart,
      end_ms: sceneEnd,
      from_frame: fromFrame,
      to_frame: toFrame,
      beat_ms: beatMs,
      readability_ms: readability,
      reading_available_ms: readingAvailable,
      behaviors: resolvedEntries,
    });
    timelineMs = sceneEnd;
  });

  const transitions: ResolvedTransitionTiming[] = [];
  input.spec.scenes.slice(0, -1).forEach((scene, index) => {
    const next = input.spec.scenes[index + 1]!;
    const declared = scene.transition_out ?? { behavior: 'CUT', version: '1.0.0', to: next.id };
    if (!registry.definition(declared.behavior, declared.version)) {
      diagnostics.push({
        code: 'transition.unknown_or_version',
        path: `scenes[${index}].transition_out`,
        message: `${declared.behavior}@${declared.version} absent du registre`,
      });
      return;
    }
    transitions.push({
      from_scene: scene.id,
      to_scene: next.id,
      behavior: declared.behavior,
      version: declared.version,
      at_frame: scenes[index]!.to_frame,
    });
  });

  return {
    resolution: {
      duration_ms: timelineMs,
      duration_frames: frameAt(timelineMs, input.fps),
      timing_source: input.fallbackSceneFrames !== undefined ? 'fallback_frames' : 'explicit_duration',
      scenes,
      transitions,
    },
    diagnostics,
  };
}

export function resolveTemporalPlan(input: ResolveTemporalInput): TemporalResolution {
  const analysis = analyzeTemporalPlan(input);
  if (analysis.diagnostics.length > 0) throw new TemporalResolutionError(analysis.diagnostics);
  return analysis.resolution;
}
