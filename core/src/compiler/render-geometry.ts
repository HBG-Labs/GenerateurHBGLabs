import type { Platform } from '../contracts/common.ts';
import type { MotionSceneSpec } from '../contracts/motion-spec.ts';
import type { PlatformPresets } from '../contracts/platform.ts';
import type { Box } from '../contracts/render-plan.ts';
import type { ResolvedStyle } from '../contracts/resolved-style.ts';
import { intersectBoxes } from '../visual/layout.ts';

export interface RenderGeometry {
  readonly canvas: { readonly width: number; readonly height: number };
  readonly safe_zone: Box;
}

export interface ResolveRenderGeometryInput {
  readonly format: MotionSceneSpec['format'];
  readonly platform_presets: PlatformPresets;
  readonly resolved_style: ResolvedStyle;
  readonly render_scale?: number;
}

type ErrorFactory = (message: string) => Error;

function platformSafeBox(
  presets: PlatformPresets,
  platform: Platform,
  format: string,
  outputWidth: number,
  outputHeight: number,
  error: ErrorFactory,
): Box {
  const canvas = presets.formats[format];
  const preset = presets.platforms[platform];
  if (!canvas || !preset) throw error(`Preset ${platform}/${format} introuvable.`);
  const reference = presets.formats[preset.safe_zone.format];
  if (!reference) throw error(`Format de zone sûre « ${preset.safe_zone.format} » introuvable.`);
  const sx = outputWidth / reference.width;
  const sy = outputHeight / reference.height;
  const i = preset.safe_zone.insets;
  return { x: i.left * sx, y: i.top * sy, w: outputWidth - (i.left + i.right) * sx, h: outputHeight - (i.top + i.bottom) * sy };
}

export function resolveRenderGeometry(
  input: ResolveRenderGeometryInput,
  error: ErrorFactory = (message) => new Error(message),
): RenderGeometry {
  const presetCanvas = input.platform_presets.formats[input.format.preset];
  if (!presetCanvas) throw error(`Format « ${input.format.preset} » introuvable.`);
  const renderScale = input.render_scale ?? 1;
  if (!Number.isFinite(renderScale) || renderScale <= 0 || renderScale > 1) throw error('render_scale doit être dans ]0, 1].');
  const canvas = { width: Math.round(presetCanvas.width * renderScale), height: Math.round(presetCanvas.height * renderScale) };
  const platform = input.format.platform_safe_zones[0];
  if (!platform) throw error('Une plateforme de zone sûre est requise.');
  const platformBox = platformSafeBox(input.platform_presets, platform, input.format.preset, canvas.width, canvas.height, error);
  const sx = canvas.width / input.resolved_style.style.reference_canvas.width;
  const sy = canvas.height / input.resolved_style.style.reference_canvas.height;
  const margin = input.resolved_style.style.grid.margin;
  const styleBox = {
    x: margin.left * sx,
    y: margin.top * sy,
    w: canvas.width - (margin.left + margin.right) * sx,
    h: canvas.height - (margin.top + margin.bottom) * sy,
  };
  const safeZone = intersectBoxes(platformBox, styleBox);
  if (safeZone.w <= 0 || safeZone.h <= 0) throw error('safe_zone.empty: les contraintes plateforme et style ne se recouvrent pas');
  return { canvas, safe_zone: safeZone };
}
