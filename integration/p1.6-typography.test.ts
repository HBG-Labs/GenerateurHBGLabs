import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { fitText, formatTypography, HarfBuzzTextEngine, hashDocument, sha256Hex } from '@motion-engine/core';

import { CORE } from './support.ts';

const fontBytes = readFileSync(path.join(CORE, 'test-fixtures', 'fonts', 'noto-sans-mono-wdth-wght.ttf'));
const fontHash = sha256Hex(fontBytes);
const binary = { data: fontBytes, sha256: fontHash, axes: { wght: 700, wdth: 82 } };

describe('P1.6 — certification typographique HarfBuzz', () => {
  it('verrouille la police contrôlée et le corpus français difficile', () => {
    expect(fontHash).toBe('2cb2adb378a8f574213e23df697050b83c54c27df465a2015552740b2769a081');
    const engine = new HarfBuzzTextEngine();
    const corpus = [
      'Électricité',
      "L'intervention est terminée.",
      '1 249,90 €',
      'Aujourd’hui, votre équipe intervient à Fort-de-France.',
      'office efficace',
    ].map((source) => {
      const formatted = formatTypography(source, 'fr-FR').formatted_text;
      const metrics = engine.shape(formatted, 48, 0, binary, 'fr-FR');
      return {
        source,
        formatted,
        width: metrics.width,
        ascent: metrics.ascent,
        descent: metrics.descent,
        line_gap: metrics.line_gap,
        glyph_ids: metrics.glyphs.map((glyph) => glyph.glyph_id),
        clusters: metrics.glyphs.map((glyph) => glyph.cluster),
        positions: metrics.glyphs.map((glyph) => [glyph.x, glyph.x_advance, glyph.x_offset]),
      };
    });
    expect(corpus[1]?.formatted).toBe('L’intervention est terminée.');
    expect(corpus[2]?.formatted).toBe('1\u202f249,90\u202f€');
    expect(corpus.every((entry) => entry.glyph_ids.every((glyph) => glyph > 0))).toBe(true);
    expect(hashDocument(corpus)).toBe('7b22c0a512a2aa2673df78c1f8f9e6eda1675be669367b4c8c21bb21cafe58eb');
  });

  it('verrouille line breaking, fitting et taille minimale sans font système', () => {
    const engine = new HarfBuzzTextEngine();
    const source = 'Aujourd’hui, votre équipe intervient à Fort-de-France. L’intervention est terminée.';
    const formatted = formatTypography(source, 'fr-FR').formatted_text;
    const fit = () => fitText({
      paragraphs: [[{ id: 'certification', source_text: source, formatted_text: formatted, color: '#111111' }]],
      break_policy: 'balance', max_width: 460, max_height: 260, preferred_size: 52, minimum_size: 28,
      preferred_line_height: 1.12, max_lines: 4, tracking_em: 0,
      shape: (text, size, tracking) => engine.shape(text, size, tracking, binary, 'fr-FR'),
    });
    const first = fit();
    const second = fit();
    expect(first).toEqual(second);
    expect(first.size).toBeGreaterThanOrEqual(28);
    expect(first.lines.length).toBeLessThanOrEqual(4);
    expect(first.lines.every((line) => line.width <= 460)).toBe(true);
    expect(hashDocument(first)).toBe('5784467e4e37c47196436daac21f0176f3d1138b0ca5e003fafc6d089da293ae');
  });
});
