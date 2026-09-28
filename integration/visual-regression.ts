import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

import { PNG } from 'pngjs';

export interface PerceptualComparison {
  width: number;
  height: number;
  exact_sha256_match: boolean;
  mean_absolute_error: number;
  root_mean_square_error: number;
  changed_pixel_ratio: number;
  within_tolerance: boolean;
}

export interface PerceptualTolerance {
  max_mean_absolute_error: number;
  max_root_mean_square_error: number;
  max_changed_pixel_ratio: number;
  channel_delta_threshold: number;
}

export const CROSS_ENVIRONMENT_TOLERANCE: PerceptualTolerance = {
  max_mean_absolute_error: 0.012,
  max_root_mean_square_error: 0.035,
  max_changed_pixel_ratio: 0.08,
  channel_delta_threshold: 12,
};

const digest = (value: Buffer): string => createHash('sha256').update(value).digest('hex');

export function comparePngBuffers(
  expectedBytes: Buffer,
  actualBytes: Buffer,
  tolerance: PerceptualTolerance = CROSS_ENVIRONMENT_TOLERANCE,
): PerceptualComparison {
  const expected = PNG.sync.read(expectedBytes);
  const actual = PNG.sync.read(actualBytes);
  if (expected.width !== actual.width || expected.height !== actual.height) {
    throw new Error(`Dimensions de régression différentes : ${expected.width}×${expected.height} vs ${actual.width}×${actual.height}`);
  }
  let absolute = 0;
  let squared = 0;
  let changed = 0;
  const pixels = expected.width * expected.height;
  for (let offset = 0; offset < expected.data.length; offset += 4) {
    let pixelChanged = false;
    for (let channel = 0; channel < 3; channel += 1) {
      const delta = Math.abs(expected.data[offset + channel]! - actual.data[offset + channel]!);
      absolute += delta;
      squared += delta * delta;
      if (delta > tolerance.channel_delta_threshold) pixelChanged = true;
    }
    if (pixelChanged) changed += 1;
  }
  const channelCount = pixels * 3;
  const meanAbsolute = absolute / channelCount / 255;
  const rootMeanSquare = Math.sqrt(squared / channelCount) / 255;
  const changedRatio = changed / pixels;
  return {
    width: expected.width,
    height: expected.height,
    exact_sha256_match: digest(expectedBytes) === digest(actualBytes),
    mean_absolute_error: meanAbsolute,
    root_mean_square_error: rootMeanSquare,
    changed_pixel_ratio: changedRatio,
    within_tolerance:
      meanAbsolute <= tolerance.max_mean_absolute_error &&
      rootMeanSquare <= tolerance.max_root_mean_square_error &&
      changedRatio <= tolerance.max_changed_pixel_ratio,
  };
}

export function comparePngFiles(expectedFile: string, actualFile: string): PerceptualComparison {
  return comparePngBuffers(readFileSync(expectedFile), readFileSync(actualFile));
}

export function createSideBySideBoard(leftFile: string, rightFile: string, outputFile: string): void {
  const left = PNG.sync.read(readFileSync(leftFile));
  const right = PNG.sync.read(readFileSync(rightFile));
  if (left.height !== right.height) throw new Error(`Les frames de comparaison doivent avoir la même hauteur.`);
  const output = new PNG({ width: left.width + right.width, height: left.height });
  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < left.width; x += 1) {
      const source = (y * left.width + x) * 4;
      const destination = (y * output.width + x) * 4;
      left.data.copy(output.data, destination, source, source + 4);
    }
    for (let x = 0; x < right.width; x += 1) {
      const source = (y * right.width + x) * 4;
      const destination = (y * output.width + left.width + x) * 4;
      right.data.copy(output.data, destination, source, source + 4);
    }
  }
  writeFileSync(outputFile, PNG.sync.write(output));
}
