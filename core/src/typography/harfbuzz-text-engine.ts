import * as hb from 'harfbuzzjs';

export const TEXT_ENGINE_NAME = 'harfbuzzjs' as const;
export const TEXT_ENGINE_PACKAGE_VERSION = '1.6.2';

export interface FontBinary {
  sha256: string;
  data: Uint8Array;
  axes?: Readonly<Record<string, number>>;
}

export interface GlyphPlacement {
  glyph_id: number;
  cluster: number;
  x: number;
  y: number;
  x_advance: number;
  y_advance: number;
  x_offset: number;
  y_offset: number;
}

export interface TextMetrics {
  width: number;
  ascent: number;
  descent: number;
  line_gap: number;
  glyphs: GlyphPlacement[];
}

export interface SupportedAxis {
  min: number;
  default: number;
  max: number;
}

interface LoadedFont {
  face: hb.Face;
  font: hb.Font;
  supportedAxes: Record<string, SupportedAxis>;
}

export interface TypographyDiagnostic {
  code: string;
  message: string;
  details?: Readonly<Record<string, string | number>>;
}

export class TypographyEngineError extends Error {
  readonly diagnostic: TypographyDiagnostic;

  constructor(diagnostic: TypographyDiagnostic) {
    super(`${diagnostic.code}: ${diagnostic.message}`);
    this.name = 'TypographyEngineError';
    this.diagnostic = diagnostic;
  }
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function assertSfntFont(data: Uint8Array): void {
  if (data.byteLength < 12) throw new Error('en-tête SFNT tronqué');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const signature = view.getUint32(0);
  const supportedSignatures = new Set([0x00010000, 0x4f54544f, 0x74727565]); // TrueType, OpenType/CFF, Apple true.
  if (!supportedSignatures.has(signature)) throw new Error('signature SFNT non supportée');
  const tableCount = view.getUint16(4);
  if (tableCount === 0 || tableCount > 4_096 || 12 + tableCount * 16 > data.byteLength) {
    throw new Error('répertoire de tables SFNT invalide');
  }
  for (let index = 0; index < tableCount; index += 1) {
    const entry = 12 + index * 16;
    const offset = view.getUint32(entry + 8);
    const length = view.getUint32(entry + 12);
    if (offset > data.byteLength || length > data.byteLength - offset) throw new Error('table SFNT hors limites');
  }
}

export class HarfBuzzTextEngine {
  readonly #cache = new Map<string, LoadedFont>();
  readonly #shapeCache = new Map<string, TextMetrics>();
  #shapeCacheHits = 0;
  #shapeCacheMisses = 0;
  static readonly MAX_SHAPED_STATES = 2_048;
  static readonly MAX_LOADED_FONT_STATES = 512;

  readonly descriptor = Object.freeze({
    name: TEXT_ENGINE_NAME,
    package_version: TEXT_ENGINE_PACKAGE_VERSION,
    native_version: hb.versionString(),
    shaping_configuration: {
      direction: 'auto' as const,
      kerning: true,
      ligatures: true,
      cluster_level: 'monotone_graphemes',
    },
  });

  load(binary: FontBinary): LoadedFont {
    const axes = binary.axes ?? {};
    const key = `${binary.sha256}:${Object.entries(axes).sort(([a], [b]) => a.localeCompare(b)).map(([tag, value]) => `${tag}=${value}`).join(',')}`;
    const cached = this.#cache.get(key);
    if (cached) return cached;
    try {
      assertSfntFont(binary.data);
      const blob = new hb.Blob(binary.data);
      const face = new hb.Face(blob);
      if (!Number.isFinite(face.upem) || face.upem <= 0) throw new Error('unitsPerEm invalide');
      const supportedAxes = Object.fromEntries(
        Object.entries(face.getAxisInfos()).map(([tag, axis]) => [tag, { min: axis.min, default: axis.default, max: axis.max }]),
      );
      for (const [tag, value] of Object.entries(axes)) {
        const axis = supportedAxes[tag];
        if (!axis) throw new Error(`axe ${tag} absent`);
        if (value < axis.min || value > axis.max) throw new Error(`axe ${tag}=${value} hors [${axis.min}, ${axis.max}]`);
      }
      const font = new hb.Font(face);
      font.setScale(face.upem, face.upem);
      font.setVariations(Object.entries(axes).map(([tag, value]) => new hb.Variation(tag, value)));
      const loaded = { face, font, supportedAxes };
      if (this.#cache.size >= HarfBuzzTextEngine.MAX_LOADED_FONT_STATES) {
        const oldest = this.#cache.keys().next().value;
        if (oldest !== undefined) this.#cache.delete(oldest);
      }
      this.#cache.set(key, loaded);
      return loaded;
    } catch (error) {
      throw new TypographyEngineError({
        code: 'font.corrupt_or_unsupported',
        message: error instanceof Error ? error.message : 'police illisible',
        details: { sha256: binary.sha256 },
      });
    }
  }

  supportedAxes(binary: FontBinary): Record<string, SupportedAxis> {
    return this.load(binary).supportedAxes;
  }

  shape(text: string, size: number, trackingPx: number, binary: FontBinary, locale: string): TextMetrics {
    const axesKey = Object.entries(binary.axes ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([tag, value]) => `${tag}=${value}`).join(',');
    const shapeKey = `${binary.sha256}:${axesKey}:${locale}:${size}:${trackingPx}:${text}`;
    const cachedMetrics = this.#shapeCache.get(shapeKey);
    if (cachedMetrics) {
      this.#shapeCacheHits += 1;
      return cachedMetrics;
    }
    this.#shapeCacheMisses += 1;
    const loaded = this.load(binary);
    const buffer = new hb.Buffer();
    buffer.addText(text);
    buffer.setLanguage(locale);
    buffer.guessSegmentProperties();
    hb.shape(loaded.font, buffer, [new hb.Feature('kern', 1), new hb.Feature('liga', 1)]);
    const infos = buffer.getGlyphInfos();
    const positions = buffer.getGlyphPositions();
    if (infos.length !== positions.length) {
      throw new TypographyEngineError({ code: 'text.shape_mismatch', message: 'HarfBuzz a renvoyé des tableaux incohérents' });
    }
    if (text.length > 0 && infos.some((glyph) => glyph.codepoint === 0)) {
      throw new TypographyEngineError({ code: 'font.missing_glyph', message: `glyph absent pour « ${text} »` });
    }
    const factor = size / loaded.face.upem;
    let cursorX = 0;
    let cursorY = 0;
    const glyphs: GlyphPlacement[] = infos.map((glyph, index) => {
      const position = positions[index]!;
      const xAdvance = position.xAdvance * factor + (index + 1 < infos.length ? trackingPx : 0);
      const yAdvance = position.yAdvance * factor;
      const result = {
        glyph_id: glyph.codepoint,
        cluster: glyph.cluster,
        x: round(cursorX),
        y: round(cursorY),
        x_advance: round(xAdvance),
        y_advance: round(yAdvance),
        x_offset: round(position.xOffset * factor),
        y_offset: round(position.yOffset * factor),
      };
      cursorX += xAdvance;
      cursorY += yAdvance;
      return result;
    });
    const extents = loaded.font.hExtents();
    const result = {
      width: round(cursorX),
      ascent: round(Math.max(0, extents.ascender * factor)),
      descent: round(Math.max(0, -extents.descender * factor)),
      line_gap: round(Math.max(0, extents.lineGap * factor)),
      glyphs,
    };
    if (this.#shapeCache.size >= HarfBuzzTextEngine.MAX_SHAPED_STATES) {
      const oldest = this.#shapeCache.keys().next().value;
      if (oldest !== undefined) this.#shapeCache.delete(oldest);
    }
    this.#shapeCache.set(shapeKey, result);
    return result;
  }

  cacheStats(): Readonly<{ fonts: number; shaped_states: number; hits: number; misses: number; maximum_loaded_font_states: number; maximum_shaped_states: number }> {
    return Object.freeze({
      fonts: this.#cache.size,
      shaped_states: this.#shapeCache.size,
      hits: this.#shapeCacheHits,
      misses: this.#shapeCacheMisses,
      maximum_loaded_font_states: HarfBuzzTextEngine.MAX_LOADED_FONT_STATES,
      maximum_shaped_states: HarfBuzzTextEngine.MAX_SHAPED_STATES,
    });
  }
}
