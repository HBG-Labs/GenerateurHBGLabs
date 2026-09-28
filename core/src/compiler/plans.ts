import type { Anchor, Duration } from '../contracts/common.ts';
import type { MotionSceneSpec } from '../contracts/motion-spec.ts';
import {
  AUDIO_PLAN_VERSION, AudioPlanSchema, SUBTITLE_PLAN_VERSION, SubtitlePlanSchema,
} from '../contracts/render-plan.ts';
import type { AudioPlan, PlanLine, RenderPlan, SubtitlePlan } from '../contracts/render-plan.ts';
import type { ResolvedStyle } from '../contracts/resolved-style.ts';
import { hashDocument } from '../integrity/canonical.ts';
import { fitSubtitleText, resolveSubtitleFittingContext } from '../typography/subtitle-fit.ts';
import type { FontResource } from './compile.ts';

const frameAt = (ms: number, fps: number): number => Math.round(ms * fps / 1_000);
const stableId = (prefix: string, value: unknown): string => `${prefix}_${hashDocument(value).slice(0, 16)}`;

function durationFrames(duration: Duration | null, fps: number, beatMs = 500, breathMs = 750): number {
  if (!duration) return 0;
  if ('ms' in duration) return frameAt(duration.ms, fps);
  if ('beats' in duration) return frameAt(duration.beats * beatMs, fps);
  return frameAt(duration.breaths * breathMs, fps);
}

function timingUnits(spec: MotionSceneSpec, style: ResolvedStyle, sceneId: string): { beatMs: number; breathMs: number } {
  const phase = spec.rhythm.sections.find((section) => section.scenes.includes(sceneId))?.phase ?? 'CALM';
  return { beatMs: style.style.rhythm_personality.tempo.beat_ms[phase], breathMs: style.style.rhythm_personality.tempo.breath_ms };
}

function allSceneNodes(scene: RenderPlan['scenes'][number]): RenderPlan['scenes'][number]['nodes'] {
  const visit = (nodes: RenderPlan['scenes'][number]['nodes']): RenderPlan['scenes'][number]['nodes'] => nodes.flatMap((node) => [node, ...((node.type === 'group' || node.type === 'mask') ? visit(node.children) : [])]);
  return visit(scene.nodes);
}

function anchorFrame(
  anchor: Anchor,
  scene: RenderPlan['scenes'][number],
  fps: number,
  units: { beatMs: number; breathMs: number },
  spec: MotionSceneSpec,
  voiceRanges: ReadonlyMap<string, { scene: string; start: number; end: number }>,
  eventFrames: ReadonlyMap<string, number>,
): number {
  const offset = 'offset' in anchor ? durationFrames(anchor.offset ?? null, fps, units.beatMs, units.breathMs) : 0;
  const nodes = allSceneNodes(scene);
  const behaviorRange = (id: string) => {
    const frames = nodes.flatMap((node) => node.tracks.filter((track) => track.source === id).flatMap((track) => track.keys.map((key) => key.frame)));
    return frames.length > 0 ? { start: Math.min(...frames), end: Math.max(...frames) } : null;
  };
  let base = scene.from;
  if ('event' in anchor) base = anchor.event === 'scene.end' ? scene.to - 1 : scene.from;
  else if ('semantic' in anchor) base = anchor.semantic === 'SCENE_END' || anchor.semantic === 'BEFORE_NEXT' ? scene.to - 1 : scene.from;
  else if ('with' in anchor) base = eventFrames.get(anchor.with) ?? behaviorRange(anchor.with)?.start ?? scene.from;
  else if ('after' in anchor) base = eventFrames.get(anchor.after) ?? behaviorRange(anchor.after)?.end ?? scene.from;
  else if ('layer' in anchor) {
    const node = nodes.find((candidate) => candidate.id === anchor.layer.id);
    const frames = node?.tracks.flatMap((track) => track.keys.map((key) => key.frame)) ?? [];
    base = frames.length === 0 ? scene.from : anchor.layer.relation === 'AFTER_LAYER' ? Math.max(...frames) : Math.min(...frames);
  } else if ('voice_segment' in anchor) {
    const range = voiceRanges.get(anchor.voice_segment.segment);
    base = range ? (anchor.voice_segment.edge === 'end' ? range.end - 1 : range.start) : scene.from;
  } else if ('voice_word' in anchor) {
    const range = voiceRanges.get(anchor.voice_word.segment);
    const segment = spec.voice.segments.find((candidate) => candidate.id === anchor.voice_word.segment);
    if (range && segment) {
      const words = segment.text.match(/[\p{L}\p{N}]+/gu) ?? [];
      const wanted = anchor.voice_word.match.toLocaleLowerCase(spec.locale);
      const matches = words.flatMap((word, index) => word.toLocaleLowerCase(spec.locale) === wanted ? [index] : []);
      const selected = matches[(anchor.voice_word.occurrence ?? 1) - 1] ?? 0;
      base = range.start + Math.round((range.end - range.start) * selected / Math.max(1, words.length));
    }
  }
  return Math.max(scene.from, Math.min(scene.to - 1, base + offset));
}

function segmentRanges(spec: MotionSceneSpec, style: ResolvedStyle, plan: RenderPlan): Map<string, { scene: string; start: number; end: number }> {
  const result = new Map<string, { scene: string; start: number; end: number }>();
  for (const scene of spec.scenes) {
    if (!('voice_segments' in scene.timing.anchor)) continue;
    const planScene = plan.scenes.find((candidate) => candidate.id === scene.id);
    if (!planScene) continue;
    const ids = scene.timing.anchor.voice_segments;
    const units = timingUnits(spec, style, scene.id);
    const weights = ids.map((id) => Math.max(1, spec.voice.segments.find((segment) => segment.id === id)?.text.length ?? 1));
    const total = weights.reduce((sum, value) => sum + value, 0);
    let cursor = planScene.from;
    ids.forEach((id, index) => {
      const slotEnd = index === ids.length - 1 ? planScene.to : cursor + Math.max(1, Math.round((planScene.to - planScene.from) * weights[index]! / total));
      const source = spec.voice.segments.find((segment) => segment.id === id);
      const gap = durationFrames(source?.gap_after ?? null, plan.canvas.fps, units.beatMs, units.breathMs);
      result.set(id, { scene: scene.id, start: cursor, end: Math.max(cursor + 1, Math.min(planScene.to, slotEnd - gap)) });
      cursor = slotEnd;
    });
  }
  const missing = spec.voice.segments.filter((segment) => !result.has(segment.id));
  if (missing.length > 0) {
    const totalWeight = missing.reduce((sum, segment) => sum + Math.max(1, segment.text.length), 0);
    let cursor = 0;
    missing.forEach((segment, index) => {
      const slotEnd = index === missing.length - 1 ? plan.canvas.duration_frames : cursor + Math.max(1, Math.round(plan.canvas.duration_frames * Math.max(1, segment.text.length) / totalWeight));
      const scene = plan.scenes.find((candidate) => cursor >= candidate.from && cursor < candidate.to) ?? plan.scenes[0]!;
      const units = timingUnits(spec, style, scene.id);
      const gap = durationFrames(segment.gap_after, plan.canvas.fps, units.beatMs, units.breathMs);
      result.set(segment.id, { scene: scene.id, start: cursor, end: Math.max(cursor + 1, slotEnd - gap) });
      cursor = slotEnd;
    });
  }
  return result;
}

export function compileAudioPlan(spec: MotionSceneSpec, style: ResolvedStyle, plan: RenderPlan): AudioPlan {
  const ranges = segmentRanges(spec, style, plan);
  const voiceSegments = spec.voice.segments.map((segment) => {
    const range = ranges.get(segment.id)!;
    return {
      id: stableId('voice', { id: segment.id, range }), source_segment_id: segment.id, source_text: segment.text,
      start_frame: range.start, end_frame: range.end, timing_source: 'estimated' as const, asset: null,
      gain_db: 0, priority: 100,
    };
  });
  const silences: AudioPlan['silences'] = [];
  const ordered = [...voiceSegments].sort((a, b) => a.start_frame - b.start_frame);
  if (ordered.length === 0) silences.push({ id: stableId('silence', { start: 0, end: plan.canvas.duration_frames }), start_frame: 0, end_frame: plan.canvas.duration_frames, reason: 'authored' });
  else {
    if (ordered[0]!.start_frame > 0) silences.push({ id: stableId('silence', { start: 0, end: ordered[0]!.start_frame }), start_frame: 0, end_frame: ordered[0]!.start_frame, reason: 'lead_in' });
    ordered.forEach((segment, index) => {
      const next = ordered[index + 1];
      if (next && next.start_frame > segment.end_frame) silences.push({ id: stableId('silence', { start: segment.end_frame, end: next.start_frame }), start_frame: segment.end_frame, end_frame: next.start_frame, reason: 'gap' });
    });
    const last = ordered.at(-1)!;
    if (last.end_frame < plan.canvas.duration_frames) silences.push({ id: stableId('silence', { start: last.end_frame, end: plan.canvas.duration_frames }), start_frame: last.end_frame, end_frame: plan.canvas.duration_frames, reason: 'tail' });
  }
  const cues: AudioPlan['sfx_cues'] = [];
  for (const scene of spec.scenes) {
    const planScene = plan.scenes.find((candidate) => candidate.id === scene.id)!;
    const eventFrames = new Map<string, number>();
    for (const event of scene.events) eventFrames.set(event.id, anchorFrame(event.at, planScene, plan.canvas.fps, timingUnits(spec, style, scene.id), spec, ranges, eventFrames));
    const authored = [
      ...(scene.sound.derive_from_events ? scene.events.flatMap((event) => {
        const cue = style.style.sound_personality.event_cues[event.kind];
        return cue ? [{ cue, at: event.at, source: event.id, gain: undefined as number | undefined }] : [];
      }) : []),
      ...scene.sound.overrides.map((override, index) => ({ cue: override.cue, at: override.at, source: `${scene.id}_override_${index}`, gain: override.gain_db })),
    ];
    authored.forEach((item) => {
      const configured = style.style.sound_personality.cues[item.cue];
      cues.push({
        id: stableId('cue', { scene: scene.id, source: item.source, cue: item.cue }), cue: item.cue,
        at_frame: anchorFrame(item.at, planScene, plan.canvas.fps, timingUnits(spec, style, scene.id), spec, ranges, eventFrames), duration_frames: 0,
        gain_db: item.gain ?? configured?.gain_db ?? -12, priority: 50, source_event: item.source.slice(0, 64), asset: null,
      });
    });
  }
  return AudioPlanSchema.parse({
    schema: 'audio-plan', schema_version: AUDIO_PLAN_VERSION, timing_source: 'estimated', fps: plan.canvas.fps,
    duration_frames: plan.canvas.duration_frames, voice_segments: voiceSegments, silences,
    sfx_cues: cues.sort((a, b) => a.at_frame - b.at_frame || a.id.localeCompare(b.id)).slice(0, style.style.sound_personality.max_cues_per_video), music_regions: [],
    mix: { target_lufs: -16, true_peak_dbtp: -1 },
  });
}

export function compileSubtitlePlan(
  spec: MotionSceneSpec,
  style: ResolvedStyle,
  plan: RenderPlan,
  audio: AudioPlan,
  fontResources: Readonly<Record<string, FontResource>>,
  minimumReadableSize: number,
): { plan: SubtitlePlan; font: RenderPlan['fonts'][number] | null } {
  const context = resolveSubtitleFittingContext({
    resolved_style: style,
    canvas: plan.canvas,
    safe_zone: plan.safe_zone,
    font_resources: fontResources,
    minimum_readable_size: minimumReadableSize,
  });
  const enabledScenes = new Set(spec.scenes.filter((scene) => scene.subtitles.mode === 'auto').map((scene) => scene.id));
  const audioBySource = new Map(audio.voice_segments.map((segment) => [segment.source_segment_id, segment]));
  const ranges = segmentRanges(spec, style, plan);
  const segments: SubtitlePlan['segments'] = [];
  for (const source of spec.voice.segments) {
    const range = ranges.get(source.id)!;
    if (!enabledScenes.has(range.scene)) continue;
    const audioSegment = audioBySource.get(source.id)!;
    const { fitted } = fitSubtitleText({ context, source_id: source.id, text: source.text, locale: spec.locale });
    let top = 0;
    const lines: PlanLine[] = fitted.lines.map((line) => {
      const result: PlanLine = {
        runs: line.fragments.map((fragment) => ({
          id: fragment.fragment_id, source_run: source.id, source_text: source.text, formatted_text: fragment.formatted_text,
          text: fragment.formatted_text, font: context.font.id, weight: context.weight, size: fitted.size,
          tracking_px: context.tracking_em * fitted.size, color: context.color, role: 'base', measured_width: fragment.metrics.width,
          glyphs: fragment.metrics.glyphs,
        })),
        top, height: line.height, measured_width: line.width, ascent: line.ascent, descent: line.descent,
        line_gap: line.line_gap, baseline: line.baseline,
      };
      top += line.height;
      return result;
    });
    segments.push({
      id: stableId('subtitle', { source: source.id, scene: range.scene }), scene_id: range.scene, source_segment_id: source.id,
      start_frame: audioSegment.start_frame, end_frame: audioSegment.end_frame, box: context.box, font: context.font.id, font_size: fitted.size,
      line_height: fitted.line_height_ratio, minimum_size: context.minimum_size, lines,
    });
  }
  const subtitlePlan = SubtitlePlanSchema.parse({
    schema: 'subtitle-plan', schema_version: SUBTITLE_PLAN_VERSION, timing_source: 'estimated', fps: plan.canvas.fps,
    duration_frames: plan.canvas.duration_frames, safe_region: context.box, style_role: context.style_role, segments,
  });
  return { plan: subtitlePlan, font: segments.length > 0 ? context.font : null };
}
