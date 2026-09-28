import type { Box, RenderPlan } from '../contracts/render-plan.ts';
import type { ResolvedStyle } from '../contracts/resolved-style.ts';
import { sha256Hex } from '../integrity/canonical.ts';
import { analyzeTextFit, fitText } from './fit-text.ts';
import type { FitTextInput, FitTextResult, TextFitAnalysis } from './fit-text.ts';
import { formatTypography } from './formatter.ts';
import { HarfBuzzTextEngine } from './harfbuzz-text-engine.ts';

export interface SubtitleFontResource {
  readonly file: string;
  readonly sha256: string;
  readonly data: Uint8Array;
}

export interface SubtitleFittingContextInput {
  readonly resolved_style: ResolvedStyle;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly safe_zone: Box;
  readonly font_resources: Readonly<Record<string, SubtitleFontResource>>;
  readonly minimum_readable_size: number;
}

export interface SubtitleFittingContext {
  readonly box: Box;
  readonly color: string;
  readonly font: RenderPlan['fonts'][number];
  readonly font_resource: SubtitleFontResource;
  readonly preferred_size: number;
  readonly minimum_size: number;
  readonly preferred_line_height: number;
  readonly max_lines: number;
  readonly tracking_em: number;
  readonly weight: number;
  readonly style_role: string;
  readonly axes: Readonly<Record<string, number>>;
}

export interface SubtitleTextFitAnalysis extends TextFitAnalysis {
  readonly source_text: string;
  readonly formatted_text: string;
  readonly box: Box;
  readonly font_id: string;
}

function tokenKey(token: string, prefix: string): string {
  return token.slice(`${prefix}.`.length);
}

function fontId(family: string, weight: number, style: string, axes: Readonly<Record<string, number>>): string {
  const axis = Object.entries(axes).sort(([a], [b]) => a.localeCompare(b)).map(([tag, value]) => `${tag}_${value}`).join('_');
  return `${family}_${weight}_${style}${axis ? `_${axis}` : ''}`.replace(/[^a-z0-9_]/g, '_').slice(0, 64);
}

export function resolveSubtitleFittingContext(input: SubtitleFittingContextInput): SubtitleFittingContext {
  const role = input.resolved_style.style.subtitle_style.type;
  const type = input.resolved_style.style.typography.scale[tokenKey(role, 'type')];
  if (!type) throw new Error(`subtitle.typography_role_invalid: ${role}`);
  const family = input.resolved_style.style.typography.families[type.family];
  if (!family) throw new Error(`subtitle.font_missing: ${type.family}`);
  const file = family.files.find((candidate) => candidate.weight === type.weight && candidate.style === 'normal');
  if (!file) throw new Error(`subtitle.font_missing: ${type.family}/${type.weight}`);
  const resource = input.font_resources[file.src];
  if (!resource || resource.sha256 !== file.sha256 || sha256Hex(resource.data) !== file.sha256) throw new Error(`subtitle.font_missing: ${file.src}`);
  const engine = new HarfBuzzTextEngine();
  const axes = file.axes ?? {};
  const id = fontId(type.family, type.weight, file.style, axes);
  const scale = input.canvas.width / input.resolved_style.style.reference_canvas.width;
  return {
    box: {
      x: input.safe_zone.x,
      y: input.safe_zone.y + input.safe_zone.h * 0.76,
      w: input.safe_zone.w,
      h: input.safe_zone.h * 0.24,
    },
    color: input.resolved_style.style.palette[tokenKey(input.resolved_style.style.subtitle_style.color, 'color')]!,
    font: {
      id,
      css_name: family.css_name,
      weight: type.weight,
      style: file.style,
      file: resource.file,
      sha256: resource.sha256,
      axes,
      supported_axes: engine.supportedAxes({ data: resource.data, sha256: resource.sha256, axes }),
      substituted_for: file.fallback_for ?? null,
    },
    font_resource: resource,
    preferred_size: type.size * scale,
    minimum_size: Math.max(input.minimum_readable_size, (type.min_size ?? type.size * 0.7) * scale),
    preferred_line_height: type.line_height,
    max_lines: input.resolved_style.style.subtitle_style.max_lines,
    tracking_em: type.tracking_em,
    weight: type.weight,
    style_role: tokenKey(role, 'type').replaceAll('.', '_').slice(0, 64),
    axes,
  };
}

function fitInput(context: SubtitleFittingContext, sourceId: string, text: string, locale: string): {
  readonly input: FitTextInput;
  readonly formatted_text: string;
} {
  const formatted = formatTypography(text, locale);
  const engine = new HarfBuzzTextEngine();
  return {
    formatted_text: formatted.formatted_text,
    input: {
      paragraphs: [[{ id: sourceId, source_text: text, formatted_text: formatted.formatted_text, color: context.color }]],
      break_policy: 'balance',
      max_width: context.box.w,
      max_height: context.box.h,
      preferred_size: context.preferred_size,
      minimum_size: context.minimum_size,
      preferred_line_height: context.preferred_line_height,
      max_lines: context.max_lines,
      tracking_em: context.tracking_em,
      shape: (value, size, tracking) => engine.shape(
        value,
        size,
        tracking,
        { data: context.font_resource.data, sha256: context.font_resource.sha256, axes: context.axes },
        locale,
      ),
    },
  };
}

/** Analyse non lançante d'une unité de sous-titre avec la mécanique P1 exacte. */
export function analyzeSubtitleTextFit(input: {
  readonly context: SubtitleFittingContext;
  readonly source_id: string;
  readonly text: string;
  readonly locale: string;
}): SubtitleTextFitAnalysis {
  const prepared = fitInput(input.context, input.source_id, input.text, input.locale);
  return {
    ...analyzeTextFit(prepared.input),
    source_text: input.text,
    formatted_text: prepared.formatted_text,
    box: input.context.box,
    font_id: input.context.font.id,
  };
}

export function fitSubtitleText(input: {
  readonly context: SubtitleFittingContext;
  readonly source_id: string;
  readonly text: string;
  readonly locale: string;
}): { readonly fitted: FitTextResult; readonly formatted_text: string } {
  const prepared = fitInput(input.context, input.source_id, input.text, input.locale);
  return { fitted: fitText(prepared.input), formatted_text: prepared.formatted_text };
}
