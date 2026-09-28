import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertAuxiliaryPlanLimits,
  AudioPlanSchema,
  assertInputLimits,
  assertPlanLimits,
  assertRendererCompatible,
  canonicalJson,
  compilePipeline,
  DEFAULT_ENGINE_LIMITS,
  hashDocument,
  manifestHash,
  manifestSemanticHash,
  readVersioned,
  referenceEligibility,
  RendererCompatibilityError,
  verifyManifest,
  SubtitlePlanSchema,
} from '@motion-engine/core';
import type { ImageResource, RenderPlan } from '@motion-engine/core';
import { REMOTION_CAPABILITIES } from '@motion-engine/renderer-remotion';

import { buildP14Pipeline } from './p1.4-support.ts';
import { buildP12Pipeline, fontResources, platforms } from './p1.2-support.ts';
import { buildCertificationPair, toolchainFingerprint } from './p1.6-support.ts';
import { WORKSPACE } from './support.ts';
import { CORE } from './support.ts';

const GOLDEN = path.join(WORKSPACE, 'certification', 'goldens', 'p1.6-semantic.json');

function expectLimit(task: () => void, code: string): void {
  try { task(); throw new Error(`La limite ${code} aurait dû échouer.`); }
  catch (error) {
    const diagnostics = (error as { diagnostics?: Array<{ code: string }> }).diagnostics ?? [];
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(code);
  }
}

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const full = path.join(root, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.(ts|tsx)$/u.test(name) && !/\.test\./u.test(name) ? [full] : [];
  });
}

function genericTextFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const full = path.join(root, name);
    return statSync(full).isDirectory() ? genericTextFiles(full) : /\.(ts|tsx|json)$/u.test(name) && !/\.test\./u.test(name) ? [full] : [];
  });
}

describe('P1.6 — certification déterministe', () => {
  it('correspond au golden sémantique versionné pour Signal et Nocturne', () => {
    const expected = JSON.parse(readFileSync(GOLDEN, 'utf8')) as { signal: unknown; nocturne: unknown };
    const first = buildCertificationPair();
    const second = buildCertificationPair();
    expect(first.semantic).toEqual(second.semantic);
    expect(first.semantic).toEqual(expected);
    expect(first.signal.hashes).toEqual(buildP14Pipeline().signalPipeline.hashes);
    expect(first.signal.hashes.render_plan).not.toBe(first.nocturne.hashes.render_plan);
    expect(first.metrics.signal.phases_ms.resolve_typography).toBeGreaterThan(0);
    expect(first.metrics.signal.phases_ms.build_manifest).toBeGreaterThan(0);
  });

  it('est strictement identique dans deux processus Node séparés', () => {
    const child = path.join(WORKSPACE, 'integration', 'p1.6-determinism-child.ts');
    const run = () => execFileSync(process.execPath, ['--experimental-strip-types', child], { cwd: WORKSPACE, encoding: 'utf8' }).trim();
    expect(run()).toBe(run());
    expect(JSON.parse(run())).toEqual(buildCertificationPair().semantic);
  });

  it('sépare le manifeste sémantique du fingerprint hôte', () => {
    const manifest = buildCertificationPair().signal.manifest;
    const other = structuredClone(manifest);
    other.created_at = '2030-01-01T00:00:00.000Z';
    other.toolchain.os = 'linux';
    other.toolchain.arch = 'arm64';
    other.toolchain.node = 'v24.99.0';
    other.manifest_sha256 = manifestHash(other);
    expect(other.manifest_sha256).not.toBe(manifest.manifest_sha256);
    expect(manifestSemanticHash(other)).toBe(manifestSemanticHash(manifest));
  });

  it('conserve les warnings honnêtes, stables, attachés et non bloquants', () => {
    for (const compiled of [buildCertificationPair().signal, buildCertificationPair().nocturne]) {
      const warnings = compiled.preflight.issues.filter((issue) => issue.severity === 'warning');
      expect(warnings).toHaveLength(2);
      expect(warnings.every((issue) => issue.code === 'contrast.unknown_on_image')).toBe(true);
      expect(warnings.every((issue) => issue.node_id === 'headline' && issue.scene_id === 'visual_scene')).toBe(true);
      expect(compiled.preflight.status).toBe('warn');
      expect(compiled.manifest.preflight_sha256).toBe(hashDocument(compiled.preflight));
      expect(compiled.manifest.engine.reference_ineligibility_reasons).toContain('git_dirty');
    }
  });
});

describe('P1.6 — capabilities et manifeste', () => {
  it('certifie chaque capability Remotion et refuse chacune lorsqu’elle manque', () => {
    const base = buildP14Pipeline().signalPlan;
    expect(new Set(REMOTION_CAPABILITIES)).toEqual(new Set(['TEXT', 'SHAPE', 'IMAGE', 'PATH', 'MASK', 'GROUP', 'TRANSFORM', 'OPACITY', 'CLIP', 'PATH_PROGRESS', 'COLOR', 'VARIABLE_FONT', 'CUT']));
    for (const capability of REMOTION_CAPABILITIES) {
      const plan = structuredClone(base);
      plan.requirements.capabilities = [capability];
      plan.requirements.fingerprint = hashDocument([capability]);
      const renderer = { name: 'negative-probe', version: '1.0.0', capabilities: REMOTION_CAPABILITIES.filter((item) => item !== capability) };
      expect(() => assertRendererCompatible(plan, renderer)).toThrow(RendererCompatibilityError);
    }
  });

  it('capture npm et lockfile, détecte un manifeste et un hash falsifiés', () => {
    const pair = buildCertificationPair();
    const toolchain = toolchainFingerprint();
    expect(toolchain.package_manager).toMatch(/^npm@/u);
    expect(toolchain.lockfile_sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(verifyManifest(pair.signal.manifest)).toBe(true);
    const altered = structuredClone(pair.signal.manifest);
    altered.render_plan_sha256 = '0'.repeat(64);
    expect(verifyManifest(altered)).toBe(false);
  });

  it('rend toutes les causes d’inéligibilité explicites', () => {
    const pair = buildCertificationPair();
    const eligibility = referenceEligibility({
      engine: { name: '@motion-engine/core', version: '0.5.0', git_commit: null, git_dirty: true },
      plan: pair.signal.render_plan, platformPresets: null, renderer: null, rendererDescriptor: null,
    });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reasons).toEqual(expect.arrayContaining(['git_dirty', 'git_commit_unknown', 'platform_version_unknown', 'renderer_unknown', 'toolchain_unknown']));
  });
});

describe('P1.6 — AudioPlan et SubtitlePlan non muets', () => {
  it('résout les ancres event, behavior, layer et voice avec shaping estimé', () => {
    const legacy = buildP12Pipeline();
    const spec = structuredClone(legacy.spec);
    spec.voice.segments = [{ id: 'voice_certification', text: 'Aujourd’hui, votre équipe intervient à Fort-de-France.', gap_after: { beats: 1 }, emphasis: ['équipe'] }];
    const scene = spec.scenes[0]!;
    scene.subtitles = { mode: 'auto' };
    scene.timing.anchor = { voice_segments: ['voice_certification'] };
    const root = scene.layers[0]!;
    if (root.primitive !== 'group') throw new Error('Groupe racine attendu.');
    const text = root.children.find((layer) => layer.primitive === 'text');
    if (!text) throw new Error('Layer texte attendu.');
    text.behaviors.push({ id: 'behavior_audio_anchor', behavior: 'REVEAL_TEXT', version: '1.0.0', at: { event: 'scene.start', offset: { ms: 300 } }, duration: { ms: 500 } });
    scene.events.push({ id: 'event_audio_anchor', kind: 'REVEAL', at: { event: 'scene.start', offset: { ms: 150 } } });
    scene.sound.overrides = [
      { cue: 'BLIP', at: { with: 'event_audio_anchor' }, gain_db: -18 },
      { cue: 'BLIP', at: { with: 'behavior_audio_anchor' }, gain_db: -17 },
      { cue: 'BLIP', at: { layer: { id: text.id, relation: 'WITH_LAYER' }, offset: { ms: 50 } }, gain_db: -16 },
      { cue: 'BLIP', at: { voice_segment: { segment: 'voice_certification', edge: 'start' }, offset: { ms: 75 } }, gain_db: -15 },
    ];
    const compiled = compilePipeline({
      spec, resolvedStyle: legacy.signalStyle, platformPresets: platforms(), pattern: legacy.pattern,
      fontResources: fontResources(legacy.signalStyle, path.join(CORE, 'test-fixtures', 'fonts')),
      config: { fps: 30, scene_duration_frames: 120 },
    });
    expect(AudioPlanSchema.safeParse(compiled.audio_plan).success).toBe(true);
    expect(SubtitlePlanSchema.safeParse(compiled.subtitle_plan).success).toBe(true);
    expect(compiled.audio_plan.timing_source).toBe('estimated');
    expect(compiled.audio_plan.voice_segments).toHaveLength(1);
    expect(buildP14Pipeline().signalPipeline.audio_plan.silences).toEqual(expect.arrayContaining([expect.objectContaining({ reason: 'authored' })]));
    expect(compiled.audio_plan.sfx_cues).toHaveLength(4);
    expect(new Set(compiled.audio_plan.sfx_cues.map((cue) => cue.at_frame)).size).toBeGreaterThan(2);
    expect(compiled.audio_plan.sfx_cues.map((cue) => cue.gain_db).sort((a, b) => a - b)).toEqual([-18, -17, -16, -15]);
    expect(compiled.audio_plan.voice_segments[0]?.priority).toBe(100);
    expect(compiled.audio_plan.sfx_cues.every((cue) => cue.priority === 50)).toBe(true);
    const musicContract = structuredClone(compiled.audio_plan);
    musicContract.music_regions = [{
      id: 'music_certification', start_frame: 0, end_frame: musicContract.duration_frames,
      gain_db: -20, priority: 20, asset: null,
      ducking: { enabled: true, target: 'voice', attenuation_db: -12 },
    }];
    expect(AudioPlanSchema.safeParse(musicContract).success).toBe(true);
    const subtitle = compiled.subtitle_plan.segments[0]!;
    expect(subtitle.lines.flatMap((line) => line.runs).every((run) => run.glyphs.length > 0 && run.measured_width > 0)).toBe(true);
    expect(subtitle.font_size).toBeGreaterThanOrEqual(subtitle.minimum_size);
    expect(subtitle.box.x).toBeGreaterThanOrEqual(compiled.render_plan.safe_zone.x);
  });
});

describe('P1.6 — migrations et canonicalisation', () => {
  it('rend MotionSpec 0.1 → 0.2 déterministe et idempotente', () => {
    const current = buildP14Pipeline().spec;
    const old = structuredClone(current) as unknown as Record<string, unknown>;
    old['schema_version'] = '0.1.0';
    const strip = (layers: any[]): void => layers.forEach((layer) => {
      layer.behaviors.forEach((behavior: any) => delete behavior.version);
      if (layer.children) strip(layer.children);
    });
    (old['scenes'] as any[]).forEach((scene) => { strip(scene.layers); if (scene.transition_out) delete scene.transition_out.version; });
    const first = readVersioned('motion-scene-spec', old);
    expect(first.ok && first.migratedFrom).toBe('0.1.0');
    if (!first.ok) return;
    const second = readVersioned('motion-scene-spec', first.value);
    expect(second.ok && second.migratedFrom).toBeNull();
    if (second.ok) expect(hashDocument(second.value)).toBe(hashDocument(first.value));
    expect(readVersioned('render-plan', { schema: 'render-plan', schema_version: '0.2.0' }).ok).toBe(false);
  });

  it('canonicalise des permutations déterministes sans normaliser Unicode ni tableaux', () => {
    const entries = [['alpha', 1], ['beta', { z: 3, a: 2 }], ['gamma', [1, 2, 3]]] as const;
    const permutations = [entries, [entries[2], entries[0], entries[1]], [entries[1], entries[2], entries[0]]];
    expect(new Set(permutations.map((items) => canonicalJson(Object.fromEntries(items)))).size).toBe(1);
    expect(hashDocument('é')).not.toBe(hashDocument('e\u0301'));
    expect(hashDocument([1, 2])).not.toBe(hashDocument([2, 1]));
    expect(() => canonicalJson({ value: Number.POSITIVE_INFINITY })).toThrow(/non fini/u);
  });
});

describe('P1.6 — EngineLimits aux frontières', () => {
  it('verrouille les onze valeurs centrales', () => {
    expect(DEFAULT_ENGINE_LIMITS).toEqual({
      max_duration_frames: 18_000, max_scenes: 64, max_layers: 512, max_text_length: 20_000,
      max_keyframes: 20_000, max_asset_dimensions: 16_384, max_asset_bytes: 64 * 1024 * 1024,
      max_assets: 128, max_fonts: 64, max_audio_cues: 1_024, max_subtitle_segments: 1_024,
    });
  });

  it('accepte la limite exacte et refuse limite + 1 pour chaque budget', () => {
    const source = buildP14Pipeline();
    const oneScene = structuredClone(source.spec);
    const baseAsset = source.asset;
    const exactAsset = { ...baseAsset, width: 16_384, height: 16_384, data: { byteLength: 64 * 1024 * 1024 } as Uint8Array };
    expect(() => assertInputLimits(oneScene, { exact: exactAsset }, DEFAULT_ENGINE_LIMITS)).not.toThrow();
    expectLimit(() => assertInputLimits(oneScene, { too_large: { ...exactAsset, width: 16_385 } }, DEFAULT_ENGINE_LIMITS), 'limits.asset_dimensions');
    expectLimit(() => assertInputLimits(oneScene, { too_heavy: { ...exactAsset, data: { byteLength: 64 * 1024 * 1024 + 1 } as Uint8Array } }, DEFAULT_ENGINE_LIMITS), 'limits.asset_bytes');

    const scenesExact = structuredClone(oneScene) as any;
    scenesExact.scenes = Array.from({ length: 64 }, () => ({ ...structuredClone(oneScene.scenes[0]), layers: [] }));
    expect(() => assertInputLimits(scenesExact, {}, DEFAULT_ENGINE_LIMITS)).not.toThrow();
    scenesExact.scenes.push({ ...structuredClone(oneScene.scenes[0]), layers: [] });
    expectLimit(() => assertInputLimits(scenesExact, {}, DEFAULT_ENGINE_LIMITS), 'limits.scenes');

    const layer = { id: 'shape', primitive: 'shape', shape: 'rect', behaviors: [] };
    const layersExact = structuredClone(oneScene) as any;
    layersExact.voice.segments = [];
    layersExact.scenes[0].layers = Array.from({ length: 512 }, () => layer);
    expect(() => assertInputLimits(layersExact, {}, DEFAULT_ENGINE_LIMITS)).not.toThrow();
    layersExact.scenes[0].layers.push(layer);
    expectLimit(() => assertInputLimits(layersExact, {}, DEFAULT_ENGINE_LIMITS), 'limits.layers');

    const textExact = structuredClone(oneScene) as any;
    textExact.scenes[0].layers = [layer];
    textExact.voice.segments = [{ id: 'v', text: 'x'.repeat(20_000), gap_after: null, emphasis: [] }];
    expect(() => assertInputLimits(textExact, {}, DEFAULT_ENGINE_LIMITS)).not.toThrow();
    textExact.voice.segments[0].text += 'x';
    expectLimit(() => assertInputLimits(textExact, {}, DEFAULT_ENGINE_LIMITS), 'limits.text_length');

    const assets = Object.fromEntries(Array.from({ length: 128 }, (_, index) => [`a${index}`, { ...baseAsset, ref: `a${index}`, data: new Uint8Array([0]) }])) as Record<string, ImageResource>;
    expect(() => assertInputLimits(oneScene, assets, DEFAULT_ENGINE_LIMITS)).not.toThrow();
    assets['overflow'] = { ...baseAsset, ref: 'overflow', data: new Uint8Array([0]) };
    expectLimit(() => assertInputLimits(oneScene, assets, DEFAULT_ENGINE_LIMITS), 'limits.assets');

    const exactPlan = structuredClone(source.signalPlan);
    exactPlan.canvas.duration_frames = 18_000;
    exactPlan.scenes[0]!.to = 18_000;
    exactPlan.fonts = Array.from({ length: 64 }, (_, index) => ({ ...source.signalPlan.fonts[0]!, id: `font_${index}` }));
    const clearTracks = (nodes: RenderPlan['scenes'][number]['nodes']): void => nodes.forEach((node) => {
      node.tracks = [];
      if (node.type === 'group' || node.type === 'mask') clearTracks(node.children);
    });
    clearTracks(exactPlan.scenes[0]!.nodes);
    const firstNode = exactPlan.scenes[0]!.nodes[0]!;
    firstNode.tracks = [{ id: 'track_limit', property: 'opacity', source: 'certification', keys: Array.from({ length: 20_000 }, (_, frame) => ({ frame, value: 1, ease: { type: 'linear' as const } })) }];
    expect(() => assertPlanLimits(exactPlan, DEFAULT_ENGINE_LIMITS)).not.toThrow();
    exactPlan.canvas.duration_frames += 1;
    expectLimit(() => assertPlanLimits(exactPlan, DEFAULT_ENGINE_LIMITS), 'limits.duration');
    exactPlan.canvas.duration_frames -= 1;
    firstNode.tracks[0]!.keys.push({ frame: 20_000, value: 1, ease: { type: 'linear' } });
    expectLimit(() => assertPlanLimits(exactPlan, DEFAULT_ENGINE_LIMITS), 'limits.keyframes');
    firstNode.tracks[0]!.keys.pop();
    exactPlan.fonts.push({ ...source.signalPlan.fonts[0]!, id: 'font_overflow' });
    expectLimit(() => assertPlanLimits(exactPlan, DEFAULT_ENGINE_LIMITS), 'limits.fonts');

    const audio = structuredClone(source.signalPipeline.audio_plan);
    const subtitle = structuredClone(source.signalPipeline.subtitle_plan);
    audio.sfx_cues = Array.from({ length: 1_024 }, (_, index) => ({ id: `cue_${index}`, cue: 'BLIP', at_frame: 0, duration_frames: 0, gain_db: -12, priority: 1, source_event: `event_${index}`, asset: null }));
    subtitle.segments = Array.from({ length: 1_024 }, (_, index) => ({ id: `subtitle_${index}`, scene_id: source.signalPlan.scenes[0]!.id, source_segment_id: `v_${index}`, start_frame: 0, end_frame: 1, box: source.signalPlan.safe_zone, font: source.signalPlan.fonts[0]!.id, font_size: 28, line_height: 1, minimum_size: 28, lines: [] }));
    expect(() => assertAuxiliaryPlanLimits(audio, subtitle, DEFAULT_ENGINE_LIMITS)).not.toThrow();
    audio.sfx_cues.push({ ...audio.sfx_cues[0]!, id: 'cue_overflow' });
    expectLimit(() => assertAuxiliaryPlanLimits(audio, subtitle, DEFAULT_ENGINE_LIMITS), 'limits.audio_cues');
    audio.sfx_cues.pop();
    subtitle.segments.push({ ...subtitle.segments[0]!, id: 'subtitle_overflow' });
    expectLimit(() => assertAuxiliaryPlanLimits(audio, subtitle, DEFAULT_ENGINE_LIMITS), 'limits.subtitle_segments');
  });
});

describe('P1.6 — régression sécurité offline', () => {
  it('interdit les clients réseau dans le Core de production', () => {
    const files = sourceFiles(path.join(WORKSPACE, 'core', 'src'));
    const forbidden = /(?:from\s+['"]node:(?:http|https|net|tls|dns)|\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b)/u;
    const hits = files.flatMap((file) => readFileSync(file, 'utf8').split(/\r?\n/u).flatMap((line, index) => forbidden.test(line) ? [`${path.relative(WORKSPACE, file)}:${index + 1}`] : []));
    expect(files.length).toBeGreaterThan(20);
    expect(hits).toEqual([]);
  });

  it('interdit toute logique client ou plateforme dans le Core et les packs génériques', () => {
    const files = [...genericTextFiles(path.join(WORKSPACE, 'core', 'src')), ...genericTextFiles(path.join(WORKSPACE, 'packs'))];
    const forbidden = /rezo\s*360|hbg\s*labs|(?:\bif\b|\bswitch\b|\bcase\b)[^\n]*(?:tiktok|instagram|facebook|\bmeta\b)/iu;
    const hits = files.flatMap((file) => readFileSync(file, 'utf8').split(/\r?\n/u).flatMap((line, index) => forbidden.test(line) ? [`${path.relative(WORKSPACE, file)}:${index + 1}`] : []));
    expect(hits).toEqual([]);
  });
});
