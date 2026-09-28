import path from 'node:path';

import type { Box } from '../contracts/render-plan.ts';
import { ImageAssetMetadataSchema } from '../contracts/visual.ts';
import type { ImageAssetMetadata, NormalizedBox, NormalizedPoint } from '../contracts/visual.ts';
import { sha256Hex } from '../integrity/canonical.ts';

export interface ImageResource extends ImageAssetMetadata {
  file: string;
  data: Uint8Array;
}

export class AssetValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'AssetValidationError';
    this.code = code;
  }
}

export function resolveContainedAssetPath(root: string, file: string): string {
  if (/^[a-z]+:\/\//iu.test(file)) throw new AssetValidationError('asset.network_forbidden', 'les URL réseau sont interdites');
  if (path.isAbsolute(file)) throw new AssetValidationError('asset.absolute_path', 'un chemin d’asset doit être relatif');
  const base = path.resolve(root);
  const resolved = path.resolve(base, file);
  const prefix = `${base}${path.sep}`;
  if (resolved !== base && !resolved.startsWith(prefix)) {
    throw new AssetValidationError('asset.path_traversal', `« ${file} » sort de la racine autorisée`);
  }
  return resolved;
}

function pngDimensions(data: Uint8Array): { width: number; height: number } | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (data.length < 24 || !signature.every((value, index) => data[index] === value)) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (String.fromCharCode(...data.subarray(12, 16)) !== 'IHDR') return null;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegDimensions(data: Uint8Array): { width: number; height: number } | null {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;
  let offset = 2;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) return null;
    const marker = data[offset + 1]!;
    offset += 2;
    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 2 > data.length) return null;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > data.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) };
    }
    offset += length;
  }
  return null;
}

export function inspectImage(data: Uint8Array, mime: ImageAssetMetadata['mime']): { width: number; height: number } {
  const dimensions = mime === 'image/png' ? pngDimensions(data) : jpegDimensions(data);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new AssetValidationError('asset.invalid_image', `octets ${mime} invalides`);
  }
  if (dimensions.width > 16_384 || dimensions.height > 16_384 || dimensions.width * dimensions.height > 100_000_000) {
    throw new AssetValidationError('asset.dimensions_too_large', `${dimensions.width}×${dimensions.height} dépasse les limites`);
  }
  return dimensions;
}

export function validateImageResource(input: ImageResource): ImageResource {
  const { file: _file, data: _data, ...metadata } = input;
  const parsed = ImageAssetMetadataSchema.parse(metadata);
  const hash = sha256Hex(input.data);
  if (hash !== parsed.sha256) throw new AssetValidationError('asset.hash_mismatch', `${parsed.ref}: ${hash} ≠ ${parsed.sha256}`);
  const dimensions = inspectImage(input.data, parsed.mime);
  if (dimensions.width !== parsed.width || dimensions.height !== parsed.height) {
    throw new AssetValidationError(
      'asset.dimension_mismatch',
      `${parsed.ref}: déclaré ${parsed.width}×${parsed.height}, fichier ${dimensions.width}×${dimensions.height}`,
    );
  }
  return input;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function sourceBox(width: number, height: number, crop?: NormalizedBox): Box {
  return crop
    ? { x: crop.x * width, y: crop.y * height, w: crop.w * width, h: crop.h * height }
    : { x: 0, y: 0, w: width, h: height };
}

export function placeImage(
  source: { width: number; height: number },
  destination: Box,
  fit: 'cover' | 'contain',
  focalPoint: NormalizedPoint,
  explicitCrop?: NormalizedBox,
): { crop: Box; destination: Box } {
  const base = sourceBox(source.width, source.height, explicitCrop);
  if (fit === 'contain') {
    const scale = Math.min(destination.w / base.w, destination.h / base.h);
    const w = base.w * scale;
    const h = base.h * scale;
    return {
      crop: base,
      destination: {
        x: destination.x + (destination.w - w) / 2,
        y: destination.y + (destination.h - h) / 2,
        w,
        h,
      },
    };
  }
  const scale = Math.max(destination.w / base.w, destination.h / base.h);
  const cropW = destination.w / scale;
  const cropH = destination.h / scale;
  const focalX = focalPoint.x * source.width;
  const focalY = focalPoint.y * source.height;
  const x = clamp(focalX - cropW / 2, base.x, base.x + base.w - cropW);
  const y = clamp(focalY - cropH / 2, base.y, base.y + base.h - cropH);
  return { crop: { x, y, w: cropW, h: cropH }, destination };
}
