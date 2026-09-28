import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pngjs from 'pngjs';

const { PNG } = pngjs;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'fixtures/p1.4/assets/neutral-landscape.png');
const width = 1200;
const height = 1600;
const png = new PNG({ width, height, colorType: 6 });

const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
const smooth = (edge0, edge1, value) => {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const nx = x / width;
    const ny = y / height;
    const horizon = smooth(0.42, 0.75, ny);
    const vignette = Math.hypot(nx - 0.5, ny - 0.48) * 22;
    let r = 19 + 23 * ny + 38 * horizon - vignette;
    let g = 43 + 55 * ny + 45 * horizon - vignette * 0.35;
    let b = 68 + 73 * ny + 28 * horizon;

    // Sujet abstrait à gauche : disque solaire et silhouette minérale.
    const sunDistance = Math.hypot((nx - 0.245) / 0.19, (ny - 0.29) / 0.145);
    const sun = 1 - smooth(0.93, 1.02, sunDistance);
    r = r * (1 - sun) + 239 * sun;
    g = g * (1 - sun) + 133 * sun;
    b = b * (1 - sun) + 91 * sun;
    const ridge = 0.74 - 0.18 * Math.sin(nx * 8.5) - 0.08 * Math.sin(nx * 19.2 + 0.7);
    if (ny > ridge && nx < 0.58) {
      const depth = smooth(ridge, 1, ny);
      r = 21 + depth * 14;
      g = 39 + depth * 18;
      b = 51 + depth * 17;
    }

    // Tracés topographiques subtils, entièrement déterministes.
    const contour = Math.abs(Math.sin((nx * 4.2 + ny * 6.7 + Math.sin(ny * 8) * 0.18) * Math.PI));
    const line = 1 - smooth(0.965, 0.995, contour);
    const quietMask = smooth(0.52, 0.68, nx);
    r += line * 16 * quietMask;
    g += line * 18 * quietMask;
    b += line * 20 * quietMask;

    const index = (y * width + x) * 4;
    png.data[index] = clamp(r);
    png.data[index + 1] = clamp(g);
    png.data[index + 2] = clamp(b);
    png.data[index + 3] = 255;
  }
}

mkdirSync(path.dirname(output), { recursive: true });
const bytes = PNG.sync.write(png, { colorType: 6, inputColorType: 6, bitDepth: 8, deflateLevel: 9 });
writeFileSync(output, bytes);
process.stdout.write(`${path.relative(root, output).replaceAll('\\', '/')} sha256=${createHash('sha256').update(bytes).digest('hex')} ${width}x${height}\n`);
