import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ImageAssetMetadataSchema } from './contracts/visual.ts';
import type { MotionSceneSpec } from './contracts/motion-spec.ts';
import { sha256Hex } from './integrity/canonical.ts';
import { P14_BEHAVIOR_DEFINITIONS } from './motion/behavior-registry.ts';
import { resolveTemporalPlan } from './temporal/resolve.ts';
import { analyzeTextFit, fitText, TextOverflowError } from './typography/fit-text.ts';
import { formatTypography } from './typography/formatter.ts';
import { HarfBuzzTextEngine, TypographyEngineError } from './typography/harfbuzz-text-engine.ts';
import { AssetValidationError, inspectImage, placeImage, resolveContainedAssetPath, validateImageResource } from './visual/assets.ts';
import { boxContains, resolveVisualLayout } from './visual/layout.ts';
import { compileNormalizedPath, PathGeometryError } from './visual/path.ts';
import { readFixture, resolvedSignal } from './test-support.ts';

const fonts = path.join(import.meta.dirname, '..', 'test-fixtures', 'fonts');
const variableBytes = readFileSync(path.join(fonts, 'noto-sans-mono-wdth-wght.ttf'));
const variableHash = sha256Hex(variableBytes);

function fakePng(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe('TypographyFormatter P1.4', () => {
  it.each([
    ['disparaissait ?', 'disparaissait\u202f?'],
    ['Vraiment !', 'Vraiment\u202f!'],
    ['Note : oui ; non', 'Note\u00a0: oui\u202f; non'],
    ['« bonjour »', '«\u202fbonjour\u202f»'],
    ["l'espace", 'l’espace'],
    ['12 kg', '12\u202fkg'],
  ])('formate %s sans perdre la source', (source, expected) => {
    expect(formatTypography(source, 'fr-FR')).toMatchObject({ source_text: source, formatted_text: expected });
  });

  it('ne francise pas silencieusement une autre locale', () => {
    expect(formatTypography('Really ?', 'en-US').formatted_text).toBe('Really ?');
  });
});

describe('HarfBuzz, variable fonts et fitting', () => {
  const engine = new HarfBuzzTextEngine();

  it('expose les axes et produit métriques, baseline et positions déterministes', () => {
    const binary = { sha256: variableHash, data: variableBytes, axes: { wght: 700, wdth: 82 } };
    expect(engine.supportedAxes(binary)).toMatchObject({ wght: { min: 100, max: 900 }, wdth: { min: 62.5, max: 100 } });
    const first = engine.shape('ÉÈÀÇÙ — l’été\u202f!', 72, -1.2, binary, 'fr-FR');
    const second = engine.shape('ÉÈÀÇÙ — l’été\u202f!', 72, -1.2, binary, 'fr-FR');
    expect(first).toEqual(second);
    expect(first.width).toBeGreaterThan(0);
    expect(first.ascent).toBeGreaterThan(0);
    expect(first.descent).toBeGreaterThan(0);
    expect(first.glyphs.every((glyph) => Number.isFinite(glyph.x) && glyph.glyph_id > 0)).toBe(true);
  });

  it('applique réellement weight/width et refuse un axe invalide', () => {
    const wide = engine.shape('VARIABLE', 80, 0, { sha256: variableHash, data: variableBytes, axes: { wght: 400, wdth: 100 } }, 'fr-FR');
    const narrow = engine.shape('VARIABLE', 80, 0, { sha256: variableHash, data: variableBytes, axes: { wght: 800, wdth: 65 } }, 'fr-FR');
    expect(narrow.width).toBeLessThan(wide.width);
    expect(() => engine.supportedAxes({ sha256: variableHash, data: variableBytes, axes: { wdth: 20 } })).toThrow(/hors/);
  });

  it('refuse une police corrompue avec un diagnostic typé', () => {
    try {
      engine.supportedAxes({ sha256: '0'.repeat(64), data: new Uint8Array([1, 2, 3, 4]) });
      throw new Error('la police corrompue aurait dû être refusée');
    } catch (error) {
      expect(error).toBeInstanceOf(TypographyEngineError);
      expect((error as TypographyEngineError).diagnostic.code).toBe('font.corrupt_or_unsupported');
    }
  });

  it('wrappe puis réduit par paliers sans franchir la taille lisible', () => {
    const binary = { sha256: variableHash, data: variableBytes, axes: { wght: 500, wdth: 82 } };
    const result = fitText({
      paragraphs: [[{ id: 'run', source_text: 'Texte français assez long', formatted_text: 'Texte français assez long', color: '#111111' }]],
      break_policy: 'balance', max_width: 420, max_height: 180, preferred_size: 64, minimum_size: 32,
      preferred_line_height: 1.15, max_lines: 3, tracking_em: 0,
      shape: (text, size, tracking) => engine.shape(text, size, tracking, binary, 'fr-FR'),
    });
    expect(result.lines.length).toBeGreaterThan(1);
    expect(result.size).toBeGreaterThanOrEqual(32);
    expect(result.lines.every((line) => line.width <= 420)).toBe(true);
  });

  it('préserve les mots reliés par les espaces insécables françaises pendant le wrapping', () => {
    const binary = { sha256: variableHash, data: variableBytes, axes: { wght: 700, wdth: 82 } };
    const formatted = formatTypography('« L’espace change ? »', 'fr-FR').formatted_text.toLocaleUpperCase('fr-FR');
    const result = fitText({
      paragraphs: [[{ id: 'run', source_text: '« L’espace change ? »', formatted_text: formatted, color: '#111111' }]],
      break_policy: 'balance', max_width: 500, max_height: 300, preferred_size: 64, minimum_size: 32,
      preferred_line_height: 1.1, max_lines: 3, tracking_em: 0,
      shape: (text, size, tracking) => engine.shape(text, size, tracking, binary, 'fr-FR'),
    });
    const rendered = result.lines.map((line) => line.fragments.map((item) => item.formatted_text).join('').trimEnd()).join(' ');
    expect(rendered).toBe(formatted);
  });

  it('retourne une erreur structurée pour un texte impossible', () => {
    const binary = { sha256: variableHash, data: variableBytes, axes: { wght: 500, wdth: 82 } };
    expect(() => fitText({
      paragraphs: [[{ id: 'run', source_text: 'IMPOSSIBLE'.repeat(30), formatted_text: 'IMPOSSIBLE'.repeat(30), color: '#111111' }]],
      break_policy: 'explicit', max_width: 80, max_height: 20, preferred_size: 64, minimum_size: 32,
      preferred_line_height: 1.1, max_lines: 1, tracking_em: 0,
      shape: (text, size, tracking) => engine.shape(text, size, tracking, binary, 'fr-FR'),
    })).toThrow(TextOverflowError);
  });

  it('analyse sans lancer avec exactement la même décision que fitText', () => {
    const binary = { sha256: variableHash, data: variableBytes, axes: { wght: 500, wdth: 82 } };
    const makeInput = (text: string) => ({
      paragraphs: [[{ id: 'run', source_text: text, formatted_text: text, color: '#111111' }]],
      break_policy: 'balance' as const,
      max_width: 420,
      max_height: 180,
      preferred_size: 64,
      minimum_size: 32,
      preferred_line_height: 1.15,
      max_lines: 3,
      tracking_em: 0,
      shape: (value: string, size: number, tracking: number) => engine.shape(value, size, tracking, binary, 'fr-FR'),
    });
    const fitted = analyzeTextFit(makeInput('Texte français assez long pour demander un ajustement contrôlé'));
    expect(fitted.fits).toBe(true);
    expect(fitted.result).toEqual(fitText(makeInput('Texte français assez long pour demander un ajustement contrôlé')));
    expect(fitted.resolved_size).toBeGreaterThanOrEqual(fitted.minimum_size);
    expect(fitted.resolved_size).toBeLessThan(fitted.preferred_size);

    const overflow = analyzeTextFit(makeInput('W'.repeat(300)));
    expect(overflow).toMatchObject({ fits: false, resolved_size: null, overflow_reason: expect.any(String) });
    expect(() => fitText(makeInput('W'.repeat(300)))).toThrow(TextOverflowError);
  });

  it('distingue un dépassement max_lines à la taille minimale', () => {
    const binary = { sha256: variableHash, data: variableBytes, axes: { wght: 500, wdth: 82 } };
    const text = Array.from({ length: 20 }, () => 'mot').join(' ');
    const analysis = analyzeTextFit({
      paragraphs: [[{ id: 'run', source_text: text, formatted_text: text, color: '#111111' }]],
      break_policy: 'balance', max_width: 180, max_height: 1_000, preferred_size: 48, minimum_size: 32,
      preferred_line_height: 1.1, max_lines: 1, tracking_em: 0,
      shape: (value, size, tracking) => engine.shape(value, size, tracking, binary, 'fr-FR'),
    });
    expect(analysis).toMatchObject({ fits: false, overflow_reason: 'max_lines' });
    expect(analysis.line_count).toBeGreaterThan(analysis.max_lines);
  });

  it.each([
    ['très court', 'Oui'],
    ['court', 'Une idée claire'],
    ['moyen', 'Une composition typographique mesurée et stable'],
    ['long', 'Une composition typographique plus longue qui doit se répartir proprement sur plusieurs lignes sans devenir microscopique'],
  ])('ajuste un cas %s de la matrice texte', (_label, text) => {
    const binary = { sha256: variableHash, data: variableBytes, axes: { wght: 500, wdth: 82 } };
    const result = fitText({
      paragraphs: [[{ id: 'run', source_text: text, formatted_text: text, color: '#111111' }]],
      break_policy: 'balance', max_width: 620, max_height: 360, preferred_size: 58, minimum_size: 28,
      preferred_line_height: 1.15, max_lines: 5, tracking_em: 0,
      shape: (value, size, tracking) => engine.shape(value, size, tracking, binary, 'fr-FR'),
    });
    expect(result.size).toBeGreaterThanOrEqual(28);
    expect(result.lines.every((line) => line.width <= 620)).toBe(true);
  });
});

describe('Image, régions, layout et sécurité', () => {
  it('résout cover/contain et déplace le crop cover vers le point focal', () => {
    const landscape = { width: 1200, height: 800 };
    const box = { x: 0, y: 0, w: 400, h: 600 };
    const left = placeImage(landscape, box, 'cover', { x: 0.1, y: 0.5 });
    const right = placeImage(landscape, box, 'cover', { x: 0.9, y: 0.5 });
    const contain = placeImage(landscape, box, 'contain', { x: 0.5, y: 0.5 });
    expect(left.crop.x).toBeLessThan(right.crop.x);
    expect(contain.crop).toEqual({ x: 0, y: 0, w: 1200, h: 800 });
    expect(contain.destination.h).toBeLessThan(box.h);
  });

  it('valide octets, hash, dimensions et provenance', () => {
    const data = fakePng(64, 32);
    const resource = {
      ref: 'fixture_image', src: 'pack:fixture.png' as const, file: 'fixture.png', sha256: sha256Hex(data), mime: 'image/png' as const,
      width: 64, height: 32, regions: [{ id: 'quiet', kind: 'negative_space' as const, box: { x: 0.5, y: 0, w: 0.5, h: 1 }, source: 'fixture' as const }],
      provenance: { license: 'CC0-1.0', source: 'test', author: 'test', commercial_use: 'allowed' as const }, data,
    };
    expect(inspectImage(data, 'image/png')).toEqual({ width: 64, height: 32 });
    expect(validateImageResource(resource)).toBe(resource);
    expect(() => validateImageResource({ ...resource, sha256: '0'.repeat(64) })).toThrow(AssetValidationError);
    expect(() => inspectImage(new Uint8Array([1, 2, 3]), 'image/png')).toThrow(/invalid_image/);
  });

  it('refuse traversal, URL, SVG et dimensions hostiles', () => {
    expect(() => resolveContainedAssetPath('C:/safe/root', '../secret.png')).toThrow(/path_traversal/);
    expect(() => resolveContainedAssetPath('C:/safe/root', 'https://example.test/a.png')).toThrow(/network_forbidden/);
    expect(ImageAssetMetadataSchema.safeParse({ ref: 'hostile', src: 'pack:x.svg', sha256: '0'.repeat(64), mime: 'image/svg+xml', width: 1, height: 1, regions: [], provenance: { license: 'x', source: 'x', author: 'x', commercial_use: 'unknown' } }).success).toBe(false);
    expect(() => inspectImage(fakePng(20_000, 20_000), 'image/png')).toThrow(/dimensions_too_large/);
    expect(ImageAssetMetadataSchema.safeParse({ ref: 'bad_focus', src: 'pack:x.png', sha256: '0'.repeat(64), mime: 'image/png', width: 1, height: 1, focal_point: { x: 1.2, y: -0.1 }, regions: [], provenance: { license: 'x', source: 'x', author: 'x', commercial_use: 'unknown' } }).success).toBe(false);
  });

  it('couvre les six stratégies de layout sans solveur généraliste', () => {
    const box = { x: 10, y: 20, w: 600, h: 900 };
    for (const kind of ['stack', 'split', 'overlay', 'aligned_region', 'image_hero', 'text_over_negative_space'] as const) {
      const regions = resolveVisualLayout(kind, box, { count: 2, gap: 20, region: { x: 0.5, y: 0.1, w: 0.4, h: 0.5 } });
      expect(regions.length).toBeGreaterThan(0);
      expect(regions.every((region) => boxContains(box, region))).toBe(true);
    }
  });
});

describe('Path, behaviors et CUT explicite', () => {
  it('convertit uniquement des segments normalisés internes', () => {
    const d = compileNormalizedPath({ segments: [
      { command: 'move', to: { x: 0, y: 0.5 } },
      { command: 'cubic', control1: { x: 0.25, y: 0 }, control2: { x: 0.75, y: 1 }, to: { x: 1, y: 0.5 } },
    ] }, { x: 0, y: 0, w: 200, h: 100 });
    expect(d).toBe('M0 50 C50 0 150 100 200 50');
    expect(() => compileNormalizedPath({ segments: [{ command: 'line', to: { x: 1, y: 1 } }, { command: 'close' }] }, { x: 0, y: 0, w: 1, h: 1 })).toThrow(PathGeometryError);
  });

  it('ferme le catalogue P1.4 aux six visual behaviors attendus', () => {
    expect(P14_BEHAVIOR_DEFINITIONS.map((item) => item.id)).toEqual([
      'REVEAL_TEXT', 'ACCENT_WORD', 'SETTLE', 'EXIT_CLEAR', 'CUT',
      'DRAW_PATH', 'MATCH_LINE', 'CAMERA_PUSH', 'FOCUS_REGION', 'HIGHLIGHT_REGION', 'MASK_WIPE',
    ]);
  });

  it('rend les frontières de scènes CUT traçables dans le plan temporel', () => {
    const spec = structuredClone(readFixture('moon.spec.json')) as unknown as MotionSceneSpec;
    const clearBehaviors = (layers: MotionSceneSpec['scenes'][number]['layers']): void => {
      layers.forEach((layer) => {
        layer.behaviors = [];
        if (layer.primitive === 'group' || layer.primitive === 'mask') clearBehaviors(layer.children);
      });
    };
    spec.scenes[0]!.timing = { anchor: { duration: { ms: 3_000 } }, min_hold: { ms: 0 } };
    clearBehaviors(spec.scenes[0]!.layers);
    const second = structuredClone(spec.scenes[0]!);
    second.id = 'visual_second';
    spec.scenes.push(second);
    spec.rhythm.sections[0]!.scenes.push(second.id);
    const result = resolveTemporalPlan({ spec, resolvedStyle: resolvedSignal(), fps: 30 });
    expect(result.transitions).toHaveLength(spec.scenes.length - 1);
    expect(result.transitions.at(-1)).toEqual({
      from_scene: spec.scenes.at(-2)!.id,
      to_scene: 'visual_second',
      behavior: 'CUT',
      version: '1.0.0',
      at_frame: result.scenes.at(-2)!.to_frame,
    });
  });
});
