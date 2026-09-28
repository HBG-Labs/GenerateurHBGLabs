import type { TextMetrics } from './harfbuzz-text-engine.ts';

export interface FitFragmentInput {
  id: string;
  source_text: string;
  formatted_text: string;
  color: string;
}

export interface FittedFragment extends FitFragmentInput {
  fragment_id: string;
  metrics: TextMetrics;
}

export interface FittedLine {
  fragments: FittedFragment[];
  width: number;
  ascent: number;
  descent: number;
  line_gap: number;
  height: number;
  baseline: number;
}

export interface FitTextInput {
  paragraphs: FitFragmentInput[][];
  break_policy: 'explicit' | 'balance';
  max_width: number;
  max_height: number;
  preferred_size: number;
  minimum_size: number;
  preferred_line_height: number;
  max_lines: number;
  tracking_em: number;
  shape: (text: string, size: number, trackingPx: number) => TextMetrics;
}

export interface FitTextResult {
  size: number;
  line_height_ratio: number;
  lines: FittedLine[];
  attempts: number;
}

export type TextFitOverflowReason =
  | 'minimum_exceeds_preferred'
  | 'max_lines'
  | 'width'
  | 'height'
  | 'multiple';

export interface TextFitAnalysis {
  readonly fits: boolean;
  readonly preferred_size: number;
  readonly resolved_size: number | null;
  readonly minimum_size: number;
  readonly line_count: number;
  readonly max_lines: number;
  readonly available_width: number;
  readonly available_height: number;
  readonly overflow_reason: TextFitOverflowReason | null;
  readonly result: FitTextResult | null;
}

export class TextOverflowError extends Error {
  readonly diagnostic: {
    code: 'text.overflow';
    preferred_size: number;
    minimum_size: number;
    max_width: number;
    max_height: number;
    max_lines: number;
  };

  constructor(input: FitTextInput) {
    super(`text.overflow: le texte ne tient pas à la taille lisible minimale ${input.minimum_size}px`);
    this.name = 'TextOverflowError';
    this.diagnostic = {
      code: 'text.overflow',
      preferred_size: input.preferred_size,
      minimum_size: input.minimum_size,
      max_width: input.max_width,
      max_height: input.max_height,
      max_lines: input.max_lines,
    };
  }
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function fragment(
  input: FitFragmentInput,
  text: string,
  index: number,
  size: number,
  trackingEm: number,
  shape: FitTextInput['shape'],
): FittedFragment {
  return {
    ...input,
    formatted_text: text,
    fragment_id: index === 0 && text === input.formatted_text ? input.id : `${input.id}_${index + 1}`.slice(0, 64),
    metrics: shape(text, size, trackingEm * size),
  };
}

function tokens(input: FitFragmentInput, size: number, trackingEm: number, shape: FitTextInput['shape']): FittedFragment[] {
  // Seules les espaces ordinaires sont des opportunités de césure. NBSP et
  // NNBSP restent attachées à leur groupe typographique et ne sont jamais
  // perdues par la tokenisation.
  const values = input.formatted_text.match(/[^ \t\r\n]+(?:[ \t]+|$)/gu) ?? [input.formatted_text];
  return values.filter((value) => value.length > 0).map((value, index) => fragment(input, value, index, size, trackingEm, shape));
}

function lineFrom(fragments: FittedFragment[], ratio: number): FittedLine {
  const ascent = Math.max(...fragments.map((item) => item.metrics.ascent), 0);
  const descent = Math.max(...fragments.map((item) => item.metrics.descent), 0);
  const lineGap = Math.max(...fragments.map((item) => item.metrics.line_gap), 0);
  const natural = ascent + descent + lineGap;
  const height = Math.max(natural, (ascent + descent) * ratio);
  return {
    fragments,
    width: round(fragments.reduce((sum, item) => sum + item.metrics.width, 0)),
    ascent: round(ascent),
    descent: round(descent),
    line_gap: round(lineGap),
    height: round(height),
    baseline: round(ascent + Math.max(0, (height - ascent - descent) / 2)),
  };
}

function layoutAt(input: FitTextInput, size: number, lineHeightRatio: number): FittedLine[] {
  const lines: FittedLine[] = [];
  for (const paragraph of input.paragraphs) {
    if (input.break_policy === 'explicit') {
      lines.push(lineFrom(paragraph.map((item) => fragment(item, item.formatted_text, 0, size, input.tracking_em, input.shape)), lineHeightRatio));
      continue;
    }
    const pieces = paragraph.flatMap((item) => tokens(item, size, input.tracking_em, input.shape));
    let current: FittedFragment[] = [];
    let width = 0;
    for (const piece of pieces) {
      if (current.length > 0 && width + piece.metrics.width > input.max_width) {
        const last = current.at(-1);
        if (last) {
          last.formatted_text = last.formatted_text.replace(/ +$/u, '');
          last.metrics = input.shape(last.formatted_text, size, input.tracking_em * size);
        }
        lines.push(lineFrom(current, lineHeightRatio));
        current = [];
        width = 0;
      }
      current.push(piece);
      width += piece.metrics.width;
    }
    if (current.length > 0) lines.push(lineFrom(current, lineHeightRatio));
  }
  return lines;
}

function analyze(input: FitTextInput): TextFitAnalysis {
  if (input.minimum_size > input.preferred_size) return {
    fits: false,
    preferred_size: input.preferred_size,
    resolved_size: null,
    minimum_size: input.minimum_size,
    line_count: 0,
    max_lines: input.max_lines,
    available_width: input.max_width,
    available_height: input.max_height,
    overflow_reason: 'minimum_exceeds_preferred',
    result: null,
  };
  const step = Math.max(1, Math.round(input.preferred_size / 30));
  const ratios = [...new Set([input.preferred_line_height, Math.max(1, input.preferred_line_height - 0.08)])];
  let attempts = 0;
  let lastLines: FittedLine[] = [];
  for (let size = input.preferred_size; size >= input.minimum_size; size = Math.max(input.minimum_size, size - step)) {
    for (const ratio of ratios) {
      attempts += 1;
      const lines = layoutAt(input, size, ratio);
      lastLines = lines;
      const fits =
        lines.length <= input.max_lines &&
        lines.every((line) => line.width <= input.max_width + 0.001) &&
        lines.reduce((sum, line) => sum + line.height, 0) <= input.max_height + 0.001;
      if (fits) {
        const result = { size, line_height_ratio: ratio, lines, attempts };
        return {
          fits: true,
          preferred_size: input.preferred_size,
          resolved_size: size,
          minimum_size: input.minimum_size,
          line_count: lines.length,
          max_lines: input.max_lines,
          available_width: input.max_width,
          available_height: input.max_height,
          overflow_reason: null,
          result,
        };
      }
    }
    if (size === input.minimum_size) break;
  }
  const reasons: TextFitOverflowReason[] = [];
  if (lastLines.length > input.max_lines) reasons.push('max_lines');
  if (lastLines.some((line) => line.width > input.max_width + 0.001)) reasons.push('width');
  if (lastLines.reduce((sum, line) => sum + line.height, 0) > input.max_height + 0.001) reasons.push('height');
  return {
    fits: false,
    preferred_size: input.preferred_size,
    resolved_size: null,
    minimum_size: input.minimum_size,
    line_count: lastLines.length,
    max_lines: input.max_lines,
    available_width: input.max_width,
    available_height: input.max_height,
    overflow_reason: reasons.length === 1 ? reasons[0]! : 'multiple',
    result: null,
  };
}

/** Analyse pure et non lançante utilisant strictement le même fitting que `fitText`. */
export function analyzeTextFit(input: FitTextInput): TextFitAnalysis {
  return analyze(input);
}

export function fitText(input: FitTextInput): FitTextResult {
  const analysis = analyze(input);
  if (analysis.result) return analysis.result;
  throw new TextOverflowError(input);
}
