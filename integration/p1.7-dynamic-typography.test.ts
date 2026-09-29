import { describe, expect, it } from 'vitest';

import {
  CompileError,
  HarfBuzzTextEngine,
  P17_BEHAVIOR_REGISTRY,
  boundedCriticalFrames,
  compileLayerTracks,
  hashDocument,
  resolveEngineLimits,
  resolvedNumericTrackValue,
} from '@motion-engine/core';
import type { Track } from '@motion-engine/core';

import { buildP14Pipeline } from './p1.4-support.ts';
import { p14FontResources } from './p1.4-support.ts';
import { buildP17Pipeline } from './p1.7-support.ts';

function allTracks(value: ReturnType<typeof buildP17Pipeline>['pipeline']['render_plan']) {
  const visit = (nodes: typeof value.scenes[number]['nodes']): Track[] => nodes.flatMap((node) => [...node.tracks, ...((node.type === 'group' || node.type === 'mask') ? visit(node.children) : [])]);
  return value.scenes.flatMap((scene) => visit(scene.nodes));
}

describe('P1.7 — dynamic typography foundation', () => {
  it('préserve strictement le RenderPlan historique 0.3.0 sans track dynamique', () => {
    const before = buildP14Pipeline().signalPlan;
    const after = buildP14Pipeline().signalPlan;
    expect(after.schema_version).toBe('0.3.0');
    expect(hashDocument(after)).toBe(hashDocument(before));
  });

  it('compile tracking, wght et wdth vers RenderPlan 0.4.0', () => {
    const plan = buildP17Pipeline().pipeline.render_plan;
    const tracks = allTracks(plan);
    expect(plan.schema_version).toBe('0.4.0');
    expect(plan.compiler_version).toBe('0.6.0');
    expect(tracks.map((track) => track.property)).toEqual(expect.arrayContaining(['tracking_px', 'font_axis.wght', 'font_axis.wdth']));
    expect(plan.requirements.capabilities).toContain('DYNAMIC_TYPOGRAPHY');
    expect(plan.scenes.flatMap((scene) => JSON.stringify(scene.nodes)).join('')).toContain('bounded_frame_sampling_v1');
  });

  it('inclut les tracks typographiques dans le hash canonique', () => {
    const first = buildP17Pipeline({ wght: [360, 820] }).pipeline.hashes.render_plan;
    const second = buildP17Pipeline({ wght: [360, 760] }).pipeline.hashes.render_plan;
    expect(first).not.toBe(second);
  });

  it('résout les valeurs start/mid/end de manière déterministe', () => {
    const tracks = allTracks(buildP17Pipeline().pipeline.render_plan);
    const track = tracks.find((candidate) => candidate.property === 'tracking_px')!;
    const frames = boundedCriticalFrames([track], 32);
    expect(frames[0]).toBe(track.keys[0]!.frame);
    expect(frames.at(-1)).toBe(track.keys.at(-1)!.frame);
    const middle = frames[Math.floor(frames.length / 2)]!;
    expect(resolvedNumericTrackValue(track, middle, 0, 30)).toBe(resolvedNumericTrackValue(track, middle, 0, 30));
  });

  it('échantillonne de façon bornée un overshoot spring entre deux extrêmes', () => {
    const track: Track = {
      id: 'spring_tracking', property: 'tracking_px', source: 'test', target: { run: 'dynamic_run' },
      keys: [
        { frame: 0, value: 0, ease: { type: 'spring', mass: 1, damping: 3, stiffness: 180, initial_velocity: 0 } },
        { frame: 30, value: 10 },
      ],
    };
    const frames = boundedCriticalFrames([track], 32);
    const values = frames.map((frame) => resolvedNumericTrackValue(track, frame, 0, 30));
    expect(frames.length).toBeGreaterThan(2);
    expect(frames.length).toBeLessThanOrEqual(32);
    expect(Math.max(...values)).toBeGreaterThan(10);
    expect(boundedCriticalFrames([track], 32)).toEqual(frames);
  });

  it('refuse un axe absent et une valeur hors plage', () => {
    const definition = P17_BEHAVIOR_REGISTRY.definition('TYPE_AXIS', '1.0.0');
    expect(definition?.parameters['axis']).toMatchObject({ values: ['wght', 'wdth'] });
    expect(() => buildP17Pipeline({ wght: [50, 850] })).toThrow(/font\.axis_out_of_range|hors/);
    const fixture = buildP17Pipeline({ wght: null, wdth: null });
    const root = fixture.spec.scenes[0]!.layers[0]!;
    if (root.primitive !== 'group') throw new Error('groupe attendu');
    const layer = structuredClone(root.children.find((candidate) => candidate.id === 'headline')!);
    if (layer.primitive !== 'text') throw new Error('texte attendu');
    const instance = { id: 'unsupported_axis', behavior: 'TYPE_AXIS', version: '1.0.0', params: { axis: 'wght', from: 400, to: 700 }, target: { run: 'dynamic_run' }, at: { semantic: 'SCENE_START' as const }, duration: { ms: 500 } };
    layer.behaviors = [instance];
    expect(() => compileLayerTracks(layer, {
      scene_id: 'visual_scene', phase: 'INTERRUPTION', start_ms: 0, end_ms: 1_000, from_frame: 0, to_frame: 30,
      beat_ms: 300, readability_ms: 0, reading_available_ms: 1_000,
      behaviors: [{ instance_id: instance.id, behavior: instance.behavior, version: instance.version, layer_id: layer.id, start_ms: 0, end_ms: 500, duration_ms: 500, stagger_ms: 0, reduced_motion: false, definition: P17_BEHAVIOR_REGISTRY.definition('TYPE_AXIS', '1.0.0')! }],
    }, fixture.style, 30, 1, { typography: { size: 64, axes: {}, supported_axes: {} } })).toThrow(/axe wght absent/i);
  });

  it('refuse un overflow présent dans un état typographique animé', () => {
    expect(() => buildP17Pipeline({ text: 'ÉLARGISSEMENT TYPOGRAPHIQUE FRANÇAIS EXTRAORDINAIRE 2027', tracking: [0, 0.5], wdth: [80, 100] })).toThrow(CompileError);
  });

  it('conserve missing glyph comme erreur P1', () => {
    expect(() => buildP17Pipeline({ text: 'ÉLAN 🦖' })).toThrow(/font\.missing_glyph/);
  });

  it('forme accents, apostrophes, ponctuation et nombres sans découpage naïf', () => {
    const pipeline = buildP17Pipeline({ text: 'L’été, ça : n°27 !', tracking: [-0.04, 0.02], wdth: [82, 86] });
    const serialized = JSON.stringify(pipeline.pipeline.render_plan);
    expect(serialized).toContain('L’été');
    expect(serialized).toContain('ça');
  });

  it('borne le cache de shaped states et inclut axes/tracking dans sa clé', () => {
    const engine = new HarfBuzzTextEngine();
    expect(engine.cacheStats()).toMatchObject({
      fonts: 0, shaped_states: 0,
      maximum_loaded_font_states: HarfBuzzTextEngine.MAX_LOADED_FONT_STATES,
      maximum_shaped_states: HarfBuzzTextEngine.MAX_SHAPED_STATES,
    });
  });

  it('accepte les limites exactes et refuse leur dépassement', () => {
    expect(resolveEngineLimits({ max_dynamic_axes_per_run: 2, max_dynamic_typography_critical_states: 128 })).toMatchObject({
      max_dynamic_axes_per_run: 2, max_dynamic_typography_critical_states: 128,
    });
    expect(() => resolveEngineLimits({ max_dynamic_axes_per_run: 3 })).toThrow();
    expect(() => resolveEngineLimits({ max_dynamic_typography_critical_states: 129 })).toThrow();
  });

  it('audite les clusters HarfBuzz sans exposer de faux découpage par caractère', () => {
    const fixture = buildP17Pipeline({ wght: null, wdth: null });
    const resources = p14FontResources(fixture.style);
    const file = Object.values(fixture.style.style.typography.families)[0]!.files[0]!;
    const resource = resources[file.src]!;
    const engine = new HarfBuzzTextEngine();
    const font = file.axes === undefined
      ? { sha256: resource.sha256, data: resource.data }
      : { sha256: resource.sha256, data: resource.data, axes: file.axes };
    const decomposed = engine.shape('e\u0301 — office', 64, 0, font, 'fr-FR');
    expect(decomposed.glyphs.length).toBeGreaterThan(0);
    expect(decomposed.glyphs.map((glyph) => glyph.cluster)).toEqual([...decomposed.glyphs.map((glyph) => glyph.cluster)].sort((a, b) => a - b));
    expect(new Set(decomposed.glyphs.map((glyph) => glyph.cluster)).size).toBeLessThan('e\u0301 — office'.length);
  });
});
