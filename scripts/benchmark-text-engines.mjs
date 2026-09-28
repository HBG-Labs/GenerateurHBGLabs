import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import * as fontkit from 'fontkit';
import * as hb from 'harfbuzzjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fontPath = path.join(root, 'packs/fonts/noto_sans_mono/noto-sans-mono-wdth-wght.ttf');
const bytes = readFileSync(fontPath);
const samples = [
  'disparaissait\u202f?',
  '«\u202fÉÈÀÇÙ\u00a0: l’été\u202f!\u202f»',
  'office affine efficace',
  'AVATAR To Wa',
  '12\u202fkg\u00a0; 3,5\u202fm',
  'A simple English line.',
];
const iterations = Number.parseInt(process.env.BENCH_ITERATIONS ?? '3000', 10);

function summarize(positions, glyphs, upem) {
  return {
    glyphs: glyphs.map((glyph) => glyph.id),
    clusters: glyphs.map((glyph) => glyph.cluster),
    width_em: Number((positions.reduce((sum, item) => sum + item.xAdvance, 0) / upem).toFixed(6)),
    positions: positions.map((item) => ({
      x_advance: Number((item.xAdvance / upem).toFixed(6)),
      x_offset: Number((item.xOffset / upem).toFixed(6)),
      y_offset: Number((item.yOffset / upem).toFixed(6)),
    })),
  };
}

const setupStartFontkit = performance.now();
const fontkitBase = fontkit.create(bytes);
const fontkitFont = fontkitBase.getVariation({ wght: 700, wdth: 85 });
const fontkitSetupMs = performance.now() - setupStartFontkit;

const setupStartHarfBuzz = performance.now();
const hbBlob = new hb.Blob(bytes);
const hbFace = new hb.Face(hbBlob);
const hbFont = new hb.Font(hbFace);
hbFont.setScale(hbFace.upem, hbFace.upem);
hbFont.setVariations([new hb.Variation('wght', 700), new hb.Variation('wdth', 85)]);
const harfbuzzSetupMs = performance.now() - setupStartHarfBuzz;

const featureBytes = readFileSync(path.join(root, 'packs/fonts/playfair_display/playfair-display-latin-700.ttf'));
const featureFontkit = fontkit.create(featureBytes);
const featureHbFace = new hb.Face(new hb.Blob(featureBytes));
const featureHbFont = new hb.Font(featureHbFace);
featureHbFont.setScale(featureHbFace.upem, featureHbFace.upem);

function featureComparison(text) {
  const fontkitRun = featureFontkit.layout(text, { kern: true, liga: true });
  const buffer = new hb.Buffer();
  buffer.addText(text);
  buffer.setLanguage('fr');
  buffer.guessSegmentProperties();
  hb.shape(featureHbFont, buffer, [new hb.Feature('kern', 1), new hb.Feature('liga', 1)]);
  return {
    source_codepoints: [...text].length,
    fontkit: { glyph_count: fontkitRun.glyphs.length, glyphs: fontkitRun.glyphs.map((glyph) => glyph.id), width_em: Number((fontkitRun.advanceWidth / featureFontkit.unitsPerEm).toFixed(6)) },
    harfbuzzjs: { glyph_count: buffer.getGlyphInfos().length, glyphs: buffer.getGlyphInfos().map((glyph) => glyph.codepoint), width_em: Number((buffer.getGlyphPositions().reduce((sum, value) => sum + value.xAdvance, 0) / featureHbFace.upem).toFixed(6)) },
  };
}

function shapeFontkit(text) {
  const run = fontkitFont.layout(text, { kern: true, liga: true });
  return summarize(
    run.positions,
    // fontkit 2.0.4 n'expose pas l'index de cluster dans son API publique.
    // L'index séquentiel reste utile au rapport ; le moteur de production devra
    // donc reconstruire les clusters à partir des codePoints si fontkit est retenu.
    run.glyphs.map((glyph, index) => ({ id: glyph.id, cluster: index })),
    fontkitFont.unitsPerEm,
  );
}

function shapeHarfBuzz(text) {
  const buffer = new hb.Buffer();
  buffer.addText(text);
  buffer.setLanguage('fr');
  buffer.guessSegmentProperties();
  hb.shape(hbFont, buffer, [new hb.Feature('kern', 1), new hb.Feature('liga', 1)]);
  const infos = buffer.getGlyphInfos();
  return summarize(
    buffer.getGlyphPositions(),
    infos.map((glyph) => ({ id: glyph.codepoint, cluster: glyph.cluster })),
    hbFace.upem,
  );
}

for (const text of samples) {
  shapeFontkit(text);
  shapeHarfBuzz(text);
}

function timed(shape) {
  const start = performance.now();
  let checksum = 0;
  for (let index = 0; index < iterations; index += 1) {
    for (const text of samples) checksum += shape(text).width_em;
  }
  return { total_ms: Number((performance.now() - start).toFixed(3)), checksum: Number(checksum.toFixed(3)) };
}

const report = {
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  font: {
    file: path.relative(root, fontPath).replaceAll('\\', '/'),
    axes_fontkit: fontkitBase.variationAxes,
    axes_harfbuzz: hbFace.getAxisInfos(),
    units_per_em: { fontkit: fontkitFont.unitsPerEm, harfbuzzjs: hbFace.upem },
  },
  versions: {
    fontkit: JSON.parse(readFileSync(path.join(root, 'node_modules/fontkit/package.json'), 'utf8')).version,
    harfbuzzjs_package: JSON.parse(readFileSync(path.join(root, 'node_modules/harfbuzzjs/package.json'), 'utf8')).version,
    harfbuzz: hb.versionString(),
  },
  setup_ms: { fontkit: Number(fontkitSetupMs.toFixed(3)), harfbuzzjs: Number(harfbuzzSetupMs.toFixed(3)) },
  samples: samples.map((text) => ({ text, fontkit: shapeFontkit(text), harfbuzzjs: shapeHarfBuzz(text) })),
  opentype_features: {
    font: 'packs/fonts/playfair_display/playfair-display-latin-700.ttf',
    ligatures: featureComparison('office affine efficace'),
    kerning: featureComparison('AVATAR To Wa'),
  },
  throughput: { iterations, fontkit: timed(shapeFontkit), harfbuzzjs: timed(shapeHarfBuzz) },
};

const json = `${JSON.stringify(report, null, 2)}\n`;
if (process.env.BENCH_OUTPUT) {
  const target = path.resolve(root, process.env.BENCH_OUTPUT);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, json, 'utf8');
  process.stdout.write(`${path.relative(root, target).replaceAll('\\', '/')}\n`);
} else {
  process.stdout.write(json);
}
