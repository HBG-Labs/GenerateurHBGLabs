import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertInputLimits,
  assertPlanLimits,
  assertRenderGate,
  assertRendererCompatible,
  assertStyleVersionPolicy,
  affectedNodes,
  buildReproducibilityManifest,
  canonicalJson,
  DEFAULT_ENGINE_LIMITS,
  hashDocument,
  readVersioned,
  referenceEligibility,
  RendererCompatibilityError,
  RenderGateError,
  versionRegistry,
  AudioPlanSchema,
  SubtitlePlanSchema,
  compilePipeline,
} from '@motion-engine/core';
import { REMOTION_CAPABILITIES, REMOTION_RENDERER_VERSION, RemotionMotionRenderer } from '@motion-engine/renderer-remotion';

import { buildP14Pipeline } from './p1.4-support.ts';
import { platforms } from './p1.2-support.ts';
import { buildP12Pipeline, fontResources } from './p1.2-support.ts';
import { CORE, WORKSPACE } from './support.ts';

describe('P1.5 — fermeture du pipeline', () => {
  it('produit quatre sorties validées, gelées et reliées', () => {
    const result = buildP14Pipeline().signalPipeline;
    expect(AudioPlanSchema.safeParse(result.audio_plan).success).toBe(true);
    expect(SubtitlePlanSchema.safeParse(result.subtitle_plan).success).toBe(true);
    expect(result.preflight.summary).toMatchObject({ errors: 0 });
    expect(result.preflight.issues.some((issue) => issue.severity === 'warning')).toBe(true);
    expect(result.preflight.issues.some((issue) => issue.severity === 'info' && issue.code === 'preflight.completed')).toBe(true);
    expect(result.preflight.status).toBe('warn');
    expect(result.dependency_graph.nodes.some((node) => node.kind === 'asset')).toBe(true);
    expect(result.dependency_graph.nodes.some((node) => node.kind === 'track')).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.render_plan.scenes)).toBe(true);
  });

  it('emploie des IDs de track stables et uniques', () => {
    const first = buildP14Pipeline().signalPlan;
    const second = buildP14Pipeline().signalPlan;
    const tracks = (plan: typeof first) => {
      const visit = (nodes: typeof plan.scenes[number]['nodes']): string[] => nodes.flatMap((node) => [
        ...node.tracks.map((track) => track.id),
        ...((node.type === 'group' || node.type === 'mask') ? visit(node.children) : []),
      ]);
      return plan.scenes.flatMap((scene) => visit(scene.nodes));
    };
    expect(tracks(first)).toEqual(tracks(second));
    expect(new Set(tracks(first)).size).toBe(tracks(first).length);
  });

  it('résout AudioPlan estimé et SubtitlePlan avec shaping, wrapping et zone sûre', () => {
    const legacy = buildP12Pipeline();
    const spec = structuredClone(legacy.spec);
    spec.voice.segments = [{ id: 'voice_question', text: 'Et si la Lune disparaissait ?', gap_after: { beats: 1 }, emphasis: ['disparaissait'] }];
    spec.scenes.forEach((scene) => {
      scene.subtitles = { mode: 'auto' };
      scene.sound.derive_from_events = true;
      scene.timing.anchor = { voice_segments: ['voice_question'] };
      const root = scene.layers[0];
      const text = root?.primitive === 'group' ? root.children.find((layer) => layer.primitive === 'text') : undefined;
      text?.behaviors.push({ id: 'audio_anchor', behavior: 'REVEAL_TEXT', version: '1.0.0', at: { event: 'scene.start', offset: { ms: 300 } }, duration: { ms: 500 } });
      scene.events.push({ id: 'event_behavior_cue', kind: 'REVEAL', at: { with: 'audio_anchor' } });
    });
    const result = compilePipeline({
      spec, resolvedStyle: legacy.signalStyle, platformPresets: platforms(), pattern: legacy.pattern,
      fontResources: fontResources(legacy.signalStyle, path.join(CORE, 'test-fixtures', 'fonts')),
      config: { fps: 30, scene_duration_frames: 90 },
    });
    expect(result.audio_plan.timing_source).toBe('estimated');
    expect(result.audio_plan.voice_segments).toHaveLength(1);
    expect(result.audio_plan.voice_segments[0]?.asset).toBeNull();
    const behaviorCue = result.audio_plan.sfx_cues.find((cue) => cue.source_event === 'event_behavior_cue');
    expect(behaviorCue?.at_frame).toBeGreaterThan(result.render_plan.scenes[0]!.from);
    expect(result.subtitle_plan.segments).toHaveLength(1);
    const subtitle = result.subtitle_plan.segments[0]!;
    expect(subtitle.lines.flatMap((line) => line.runs).every((run) => run.measured_width > 0 && run.glyphs.length > 0)).toBe(true);
    expect(subtitle.font_size).toBeGreaterThanOrEqual(subtitle.minimum_size);
    expect(result.preflight.issues.map((issue) => issue.code)).not.toContain('subtitle.unsafe');
  });

  it('affiche plusieurs voice_segments successifs comme unités de sous-titre distinctes', () => {
    const legacy = buildP12Pipeline();
    const spec = structuredClone(legacy.spec);
    spec.voice.segments = [
      { id: 'voice_first', text: 'Dans la ville, le premier signal apparaît.', gap_after: null, emphasis: [] },
      { id: 'voice_second', text: 'Puis le récit avance avec une seconde idée claire.', gap_after: null, emphasis: [] },
      { id: 'voice_third', text: 'Enfin, la conclusion tient dans sa propre unité.', gap_after: null, emphasis: [] },
    ];
    const scene = spec.scenes[0]!;
    scene.subtitles = { mode: 'auto' };
    scene.timing.anchor = { voice_segments: ['voice_first', 'voice_second', 'voice_third'] };
    const result = compilePipeline({
      spec, resolvedStyle: legacy.signalStyle, platformPresets: platforms(), pattern: legacy.pattern,
      fontResources: fontResources(legacy.signalStyle, path.join(CORE, 'test-fixtures', 'fonts')),
      config: { fps: 30, scene_duration_frames: 180 },
    });
    expect(result.subtitle_plan.segments).toHaveLength(3);
    expect(result.subtitle_plan.segments.map((segment) => segment.source_segment_id)).toEqual(['voice_first', 'voice_second', 'voice_third']);
    expect(result.subtitle_plan.segments[0]!.end_frame).toBeLessThanOrEqual(result.subtitle_plan.segments[1]!.start_frame);
    expect(result.subtitle_plan.segments[1]!.end_frame).toBeLessThanOrEqual(result.subtitle_plan.segments[2]!.start_frame);
    expect(result.subtitle_plan.segments.every((segment) => segment.lines.length <= 2)).toBe(true);
  });

  it('conserve text.overflow comme dernier filet P1 pour les sous-titres impossibles', () => {
    const legacy = buildP12Pipeline();
    const spec = structuredClone(legacy.spec);
    spec.voice.segments = [{ id: 'voice_overflow', text: 'W'.repeat(300), gap_after: null, emphasis: [] }];
    const scene = spec.scenes[0]!;
    scene.subtitles = { mode: 'auto' };
    scene.timing.anchor = { voice_segments: ['voice_overflow'] };
    expect(() => compilePipeline({
      spec, resolvedStyle: legacy.signalStyle, platformPresets: platforms(), pattern: legacy.pattern,
      fontResources: fontResources(legacy.signalStyle, path.join(CORE, 'test-fixtures', 'fonts')),
      config: { fps: 30, scene_duration_frames: 120 },
    })).toThrow(/text\.overflow/u);
  });

  it('déclare les capacités requises et refuse un renderer incomplet', () => {
    const plan = buildP14Pipeline().signalPlan;
    expect(plan.requirements.capabilities).toEqual(expect.arrayContaining(['IMAGE', 'MASK', 'PATH', 'TEXT']));
    expect(() => assertRendererCompatible(plan, { name: 'minimal', version: '1.0.0', capabilities: ['TEXT'] })).toThrow(RendererCompatibilityError);
    expect(() => assertRendererCompatible(plan, { name: 'remotion', version: REMOTION_RENDERER_VERSION, capabilities: REMOTION_CAPABILITIES })).not.toThrow();
  });

  it('bloque le render gate dès qu’un ERROR existe', () => {
    const plan = structuredClone(buildP14Pipeline().signalPlan);
    plan.preflight.status = 'fail';
    plan.preflight.issues.push({ code: 'test.blocking', severity: 'error', path: 'test', message: 'blocage déterministe' });
    expect(() => assertRenderGate(plan)).toThrow(RenderGateError);
  });

  it('refuse avant bundling et ne crée aucun fichier final sur preflight ERROR', async () => {
    const plan = structuredClone(buildP14Pipeline().signalPlan);
    plan.preflight.status = 'fail';
    plan.preflight.issues.push({ code: 'test.blocking', severity: 'error', path: 'test', message: 'blocage avant Remotion' });
    const renderer = new RemotionMotionRenderer();
    const output = path.join(WORKSPACE, 'out', 'p1.5-test-blocked.mp4');
    await expect(renderer.renderVideo({ plan, output_file: output, resource_root: WORKSPACE })).rejects.toThrow(RenderGateError);
    expect(existsSync(output)).toBe(false);
    renderer.dispose();
  });

  it('rend le graphe exploitable pour la régénération sélective future', () => {
    const graph = buildP14Pipeline().signalPipeline.dependency_graph;
    const affected = affectedNodes(graph, 'asset:neutral_landscape');
    expect(affected).toContain('asset:neutral_landscape');
    expect(affected.some((id) => id.startsWith('layer:'))).toBe(true);
    const users = graph.edges.filter((edge) => edge.from === 'asset:neutral_landscape').map((edge) => edge.to);
    expect(users.length).toBeGreaterThan(0);
  });

  it('centralise et applique les EngineLimits', () => {
    const pipeline = buildP14Pipeline();
    expect(() => assertInputLimits(pipeline.spec, { neutral_landscape: pipeline.asset }, { ...DEFAULT_ENGINE_LIMITS, max_layers: 1 })).toThrow(/dépasse/u);
    expect(() => assertInputLimits(pipeline.spec, { neutral_landscape: pipeline.asset }, { ...DEFAULT_ENGINE_LIMITS, max_text_length: 1 })).toThrow(/dépasse/u);
    expect(() => assertInputLimits(pipeline.spec, { neutral_landscape: pipeline.asset }, { ...DEFAULT_ENGINE_LIMITS, max_asset_bytes: 1 })).toThrow(/dépasse/u);
    expect(() => assertInputLimits(pipeline.spec, { neutral_landscape: pipeline.asset }, { ...DEFAULT_ENGINE_LIMITS, max_asset_dimensions: 1 })).toThrow(/dépasse/u);
    const tooManyScenes = structuredClone(pipeline.spec);
    tooManyScenes.scenes.push({ ...structuredClone(tooManyScenes.scenes[0]!), id: 'visual_scene_two' });
    expect(() => assertInputLimits(tooManyScenes, { neutral_landscape: pipeline.asset }, { ...DEFAULT_ENGINE_LIMITS, max_scenes: 1 })).toThrow(/dépasse/u);
    expect(() => assertPlanLimits(pipeline.signalPlan, { ...DEFAULT_ENGINE_LIMITS, max_duration_frames: 1 })).toThrow(/dépasse/u);
    expect(() => assertPlanLimits(pipeline.signalPlan, { ...DEFAULT_ENGINE_LIMITS, max_keyframes: 1 })).toThrow(/dépasse/u);
  });

  it('applique la politique version + hash des styles', () => {
    const style = buildP14Pipeline().signalStyle;
    expect(() => assertStyleVersionPolicy(style, { ...style.sources.style, sha256: '0'.repeat(64) })).toThrow(/sans changement de version/u);
    expect(() => assertStyleVersionPolicy(style, style.sources.style)).not.toThrow();
  });

  it('expose le registre de versions et migre MotionSpec 0.1', () => {
    const pipeline = buildP14Pipeline();
    expect(versionRegistry().find((entry) => entry.kind === 'motion-scene-spec')?.automatic_from).toContain('0.1.0');
    const old = structuredClone(pipeline.spec) as any;
    old.schema_version = '0.1.0';
    const strip = (layers: any[]) => layers.forEach((layer) => {
      layer.behaviors.forEach((behavior: any) => delete behavior.version);
      if (layer.children) strip(layer.children);
    });
    old.scenes.forEach((scene: any) => { strip(scene.layers); if (scene.transition_out) delete scene.transition_out.version; });
    const migrated = readVersioned('motion-scene-spec', old);
    expect(migrated.ok && migrated.migratedFrom).toBe('0.1.0');
  });

  it('canonicalise les clés sans effacer la sémantique des tableaux', () => {
    expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 4 }, b: 2 }));
    expect(hashDocument({ values: [1, 2] })).not.toBe(hashDocument({ values: [2, 1] }));
    expect(() => canonicalJson({ invalid: Number.NaN })).toThrow(/non fini/u);
  });

  it('est déterministe dans deux processus Node séparés', () => {
    const child = path.join(WORKSPACE, 'integration', 'p1.5-determinism-child.ts');
    const run = () => execFileSync(process.execPath, ['--experimental-strip-types', child], { cwd: WORKSPACE, encoding: 'utf8' }).trim();
    expect(run()).toBe(run());
  });

  it('calcule l’éligibilité et capture un manifeste complet', () => {
    const pipeline = buildP14Pipeline();
    const descriptor = { name: '@motion-engine/renderer-remotion', version: REMOTION_RENDERER_VERSION, capabilities: REMOTION_CAPABILITIES };
    expect(referenceEligibility({ engine: { name: 'core', version: '0.5.0', git_commit: '705b5a6', git_dirty: true }, plan: pipeline.signalPlan, platformPresets: null, renderer: null, rendererDescriptor: null })).toEqual({ eligible: false, reasons: ['git_dirty', 'platform_version_unknown', 'renderer_unknown', 'toolchain_unknown'] });
    const manifest = buildReproducibilityManifest({
      createdAt: '2026-09-27T20:00:00-04:00',
      engine: { name: '@motion-engine/core', version: '0.5.0', git_commit: '705b5a6', git_dirty: false, reference_eligible: true },
      spec: pipeline.spec, resolvedStyle: pipeline.signalStyle, plan: pipeline.signalPlan,
      audioPlan: pipeline.signalPipeline.audio_plan, subtitlePlan: pipeline.signalPipeline.subtitle_plan,
      dependencyGraph: pipeline.signalPipeline.dependency_graph,
      platformPresets: platforms(),
      rendererDescriptor: descriptor,
      toolchain: { node: process.version, package_manager: 'npm@11.17.0', lockfile_sha256: '0'.repeat(64), remotion: '4.0.529', chromium: 'Chrome for Testing', ffmpeg: null, renderer_package: REMOTION_RENDERER_VERSION, os: process.platform, arch: process.arch },
      renderConfig: { width: 540, height: 960, fps: 30, codec: 'h264', crf: 18, pixel_format: 'yuv420p' },
    });
    expect(manifest.engine.reference_eligible).toBe(true);
    expect(manifest.audio_plan_sha256).toBe(pipeline.signalPipeline.hashes.audio_plan);
    expect(manifest.toolchain).toMatchObject({ harfbuzzjs: '1.6.2', os: process.platform, arch: process.arch });
    expect(manifest.configuration.network_required).toBe(false);
  });
});
