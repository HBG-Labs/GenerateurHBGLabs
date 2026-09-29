import type { BehaviorInstance, Layer } from '../contracts/motion-spec.ts';
import type { Easing } from '../contracts/style-profile.ts';
import type { ResolvedStyle } from '../contracts/resolved-style.ts';
import type { Track } from '../contracts/render-plan.ts';
import { hashDocument } from '../integrity/canonical.ts';
import type { ResolvedSceneTiming, TemporalDiagnostic } from '../temporal/resolve.ts';

export class MotionTrackError extends Error {
  readonly diagnostics: readonly TemporalDiagnostic[];

  constructor(diagnostics: readonly TemporalDiagnostic[]) {
    super(diagnostics.map((issue) => `${issue.code} ${issue.path}: ${issue.message}`).join('\n'));
    this.name = 'MotionTrackError';
    this.diagnostics = diagnostics;
  }
}

function easing(style: ResolvedStyle, id: 'enter' | 'exit' | 'inout' | 'settle'): Easing {
  const value = style.style.motion_personality.easings[id];
  if (!value) throw new MotionTrackError([{ code: 'easing.missing', path: `motion_personality.easings.${id}`, message: `easing « ${id} » absent du style` }]);
  return value.type === 'spring' ? { ...value, initial_velocity: value.initial_velocity ?? 0 } : value;
}

const frameAt = (ms: number, fps: number): number => Math.round((ms * fps) / 1_000);

function keys(startMs: number, endMs: number, fps: number, sceneEnd: number, from: number, to: number, ease: Easing) {
  const start = Math.min(sceneEnd - 1, frameAt(startMs, fps));
  const end = Math.min(sceneEnd - 1, Math.max(start + 1, frameAt(endMs, fps)));
  if (end <= start) return [{ frame: start, value: to }];
  return [{ frame: start, value: from, ease }, { frame: end, value: to }];
}

function instanceMap(layer: Layer): Map<string, BehaviorInstance> {
  return new Map(layer.behaviors.map((behavior) => [behavior.id, behavior]));
}

function targetOf(instance: BehaviorInstance): Track['target'] {
  if (!instance.target) return undefined;
  return { ...(instance.target.run ? { run: instance.target.run } : {}), ...(instance.target.line !== undefined ? { line: instance.target.line } : {}) };
}

export interface VisualTrackContext {
  focus?: { translate_x: number; translate_y: number; scale: number };
  typography?: {
    size: number;
    axes: Readonly<Record<string, number>>;
    supported_axes: Readonly<Record<string, { min: number; default: number; max: number }>>;
  };
}

type TrackDraft = Omit<Track, 'id'>;

export function compileLayerTracks(
  layer: Layer,
  timing: ResolvedSceneTiming,
  style: ResolvedStyle,
  fps: number,
  scaleY: number,
  visual: VisualTrackContext = {},
): Track[] {
  const instances = instanceMap(layer);
  const tracks: TrackDraft[] = [];
  const motionDistance = Math.max(8, (style.style.space['md'] ?? 24) * scaleY);
  const accentScale = 1 + style.style.motion_personality.max_overshoot;

  for (const resolved of timing.behaviors.filter((entry) => entry.layer_id === layer.id)) {
    const instance = instances.get(resolved.instance_id);
    if (!instance) continue;
    const start = resolved.start_ms;
    const baseEnd = start + resolved.duration_ms;
    if (resolved.behavior === 'REVEAL_TEXT') {
      const lines = layer.primitive === 'text' && (instance.params?.['unit'] ?? 'line') === 'line'
        ? Math.max(1, layer.content.runs.filter((run) => run.break_after).length + 1)
        : 1;
      for (let line = 0; line < lines; line += 1) {
        const lineStart = start + line * resolved.stagger_ms;
        const target = lines > 1 ? { line } : undefined;
        tracks.push({ property: 'opacity', ...(target ? { target } : {}), source: instance.id, keys: keys(lineStart, lineStart + resolved.duration_ms, fps, timing.to_frame, 0, 1, easing(style, 'enter')) });
        if (!resolved.reduced_motion) {
          tracks.push({ property: 'translate_y', ...(target ? { target } : {}), source: instance.id, keys: keys(lineStart, lineStart + resolved.duration_ms, fps, timing.to_frame, motionDistance, 0, easing(style, 'enter')) });
        }
      }
    } else if (resolved.behavior === 'ACCENT_WORD') {
      if (!resolved.reduced_motion) {
        const target = targetOf(instance);
        tracks.push({ property: 'scale', ...(target ? { target } : {}), source: instance.id, keys: keys(start, baseEnd, fps, timing.to_frame, 1, accentScale, easing(style, 'inout')) });
      }
    } else if (resolved.behavior === 'SETTLE') {
      if (!resolved.reduced_motion) {
        const target = targetOf(instance);
        tracks.push({ property: 'scale', ...(target ? { target } : {}), source: instance.id, keys: keys(start, baseEnd, fps, timing.to_frame, accentScale, 1, easing(style, 'settle')) });
      }
    } else if (resolved.behavior === 'EXIT_CLEAR') {
      tracks.push({ property: 'opacity', source: instance.id, keys: keys(start, baseEnd, fps, timing.to_frame, 1, 0, easing(style, 'exit')) });
      if (!resolved.reduced_motion) {
        tracks.push({ property: 'translate_y', source: instance.id, keys: keys(start, baseEnd, fps, timing.to_frame, 0, -motionDistance, easing(style, 'exit')) });
      }
    } else if (resolved.behavior === 'CUT') {
      tracks.push({ property: 'opacity', source: instance.id, keys: [{ frame: Math.min(timing.to_frame - 1, frameAt(start, fps)), value: 1 }] });
    } else if (resolved.behavior === 'DRAW_PATH' || resolved.behavior === 'MATCH_LINE') {
      tracks.push({
        property: 'path_progress',
        source: instance.id,
        keys: resolved.reduced_motion
          ? [{ frame: Math.min(timing.to_frame - 1, frameAt(start, fps)), value: 1 }]
          : keys(start, baseEnd, fps, timing.to_frame, 0, 1, easing(style, 'enter')),
      });
    } else if (resolved.behavior === 'CAMERA_PUSH') {
      if (!resolved.reduced_motion) {
        const scale = typeof instance.params?.['scale'] === 'number' ? instance.params['scale'] : 1.06;
        tracks.push({ property: 'scale', source: instance.id, keys: keys(start, baseEnd, fps, timing.to_frame, 1, scale, easing(style, 'inout')) });
      }
    } else if (resolved.behavior === 'FOCUS_REGION') {
      if (!resolved.reduced_motion) {
        const requestedScale = typeof instance.params?.['scale'] === 'number' ? instance.params['scale'] : visual.focus?.scale ?? 1.08;
        tracks.push({ property: 'scale', source: instance.id, keys: keys(start, baseEnd, fps, timing.to_frame, 1, requestedScale, easing(style, 'inout')) });
        tracks.push({ property: 'translate_x', source: instance.id, keys: keys(start, baseEnd, fps, timing.to_frame, 0, visual.focus?.translate_x ?? 0, easing(style, 'inout')) });
        tracks.push({ property: 'translate_y', source: instance.id, keys: keys(start, baseEnd, fps, timing.to_frame, 0, visual.focus?.translate_y ?? 0, easing(style, 'inout')) });
      }
    } else if (resolved.behavior === 'HIGHLIGHT_REGION') {
      tracks.push({ property: 'opacity', source: instance.id, keys: keys(start, baseEnd, fps, timing.to_frame, 0, 1, easing(style, 'enter')) });
      if (!resolved.reduced_motion) {
        tracks.push({ property: 'scale', source: instance.id, keys: keys(start, baseEnd, fps, timing.to_frame, 0.96, 1, easing(style, 'settle')) });
      }
    } else if (resolved.behavior === 'MASK_WIPE') {
      const direction = instance.params?.['direction'] ?? (layer.primitive === 'mask' ? layer.clip.direction : undefined) ?? 'left_to_right';
      const property = direction === 'left_to_right' ? 'clip_right' : direction === 'right_to_left' ? 'clip_left' : direction === 'top_to_bottom' ? 'clip_bottom' : 'clip_top';
      tracks.push({
        property,
        source: instance.id,
        keys: resolved.reduced_motion
          ? [{ frame: Math.min(timing.to_frame - 1, frameAt(start, fps)), value: 0 }]
          : keys(start, baseEnd, fps, timing.to_frame, 1, 0, easing(style, 'enter')),
      });
    } else if (resolved.behavior === 'TYPE_TRACKING') {
      if (layer.primitive !== 'text' || !visual.typography || !instance.target?.run) throw new MotionTrackError([{ code: 'typography.dynamic_target_invalid', path: `layers.${layer.id}.behaviors.${instance.id}`, message: 'TYPE_TRACKING requiert un run textuel et un contexte typographique.' }]);
      const fromEm = instance.params?.['from_em'];
      const toEm = instance.params?.['to_em'];
      if (typeof fromEm !== 'number' || typeof toEm !== 'number') throw new MotionTrackError([{ code: 'typography.tracking_invalid', path: `layers.${layer.id}.behaviors.${instance.id}`, message: 'from_em/to_em finis requis.' }]);
      const target = targetOf(instance);
      const from = fromEm * visual.typography.size;
      const to = toEm * visual.typography.size;
      tracks.push({ property: 'tracking_px', ...(target ? { target } : {}), source: instance.id, keys: resolved.reduced_motion ? [{ frame: Math.min(timing.to_frame - 1, frameAt(start, fps)), value: to }] : keys(start, baseEnd, fps, timing.to_frame, from, to, easing(style, 'inout')) });
    } else if (resolved.behavior === 'TYPE_AXIS') {
      if (layer.primitive !== 'text' || !visual.typography || !instance.target?.run) throw new MotionTrackError([{ code: 'typography.dynamic_target_invalid', path: `layers.${layer.id}.behaviors.${instance.id}`, message: 'TYPE_AXIS requiert un run textuel et un contexte typographique.' }]);
      const axis = instance.params?.['axis'];
      const startValue = instance.params?.from;
      const endValue = instance.params?.to;
      if ((axis !== 'wght' && axis !== 'wdth') || typeof startValue !== 'number' || typeof endValue !== 'number') throw new MotionTrackError([{ code: 'font.axis_invalid', path: `layers.${layer.id}.behaviors.${instance.id}`, message: 'Axe allowlisté et bornes numériques requis.' }]);
      const supported = visual.typography.supported_axes[axis];
      if (!supported) throw new MotionTrackError([{ code: 'font.axis_unsupported', path: `layers.${layer.id}.behaviors.${instance.id}`, message: `Axe ${axis} absent de la fonte active.` }]);
      if (startValue < supported.min || startValue > supported.max || endValue < supported.min || endValue > supported.max) throw new MotionTrackError([{ code: 'font.axis_out_of_range', path: `layers.${layer.id}.behaviors.${instance.id}`, message: `${axis} doit rester dans [${supported.min}, ${supported.max}].` }]);
      const target = targetOf(instance);
      tracks.push({ property: `font_axis.${axis}`, ...(target ? { target } : {}), source: instance.id, keys: resolved.reduced_motion ? [{ frame: Math.min(timing.to_frame - 1, frameAt(start, fps)), value: endValue }] : keys(start, baseEnd, fps, timing.to_frame, startValue, endValue, easing(style, 'inout')) });
    }
  }
  assertNoTrackConflicts(layer.id, tracks);
  return tracks.map((track) => ({
    ...track,
    id: `track_${hashDocument({ layer: layer.id, source: track.source, property: track.property, target: track.target ?? null }).slice(0, 16)}`,
  }));
}

export function assertNoTrackConflicts(layerId: string, tracks: readonly TrackDraft[]): void {
  const diagnostics: TemporalDiagnostic[] = [];
  for (let leftIndex = 0; leftIndex < tracks.length; leftIndex += 1) {
    const left = tracks[leftIndex]!;
    const leftStart = left.keys[0]!.frame;
    const leftEnd = left.keys.at(-1)!.frame + (left.keys.length === 1 ? 1 : 0);
    for (let rightIndex = leftIndex + 1; rightIndex < tracks.length; rightIndex += 1) {
      const right = tracks[rightIndex]!;
      if (left.property !== right.property || JSON.stringify(left.target ?? null) !== JSON.stringify(right.target ?? null)) continue;
      const rightStart = right.keys[0]!.frame;
      const rightEnd = right.keys.at(-1)!.frame + (right.keys.length === 1 ? 1 : 0);
      if (leftStart < rightEnd && rightStart < leftEnd) {
        diagnostics.push({
          code: 'motion.track_conflict',
          path: `layers.${layerId}.tracks`,
          message: `${left.source} et ${right.source} contrôlent ${left.property} sur le même intervalle`,
        });
      }
    }
  }
  if (diagnostics.length > 0) throw new MotionTrackError(diagnostics);
}
