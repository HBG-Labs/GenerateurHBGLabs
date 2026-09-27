import type { Platform } from '../contracts/common.ts';
import type { CreativeIntent } from '../contracts/creative-intent.ts';
import {
  MOTION_SPEC_VERSION,
  MotionSceneSpecSchema,
} from '../contracts/motion-spec.ts';
import type { Layer, MotionSceneSpec, StyleBinding } from '../contracts/motion-spec.ts';
import type { PatternDefinition } from '../contracts/pattern.ts';
import type { PlatformPresets } from '../contracts/platform.ts';
import type { ResolvedStyle } from '../contracts/resolved-style.ts';
import { hashDocument } from '../integrity/canonical.ts';
import { validateIntent, validatePatternDefinition, validatePlatformPresets, validateResolvedStyle } from '../validation/validate.ts';

export const SPEC_BUILDER_VERSION = '0.2.0';

export interface SpecContentLine {
  text: string;
  accent?: boolean;
}

export interface BuildSpecInput {
  intent: CreativeIntent;
  resolvedStyle: ResolvedStyle;
  platformPresets: PlatformPresets;
  platform: Platform;
  pattern: PatternDefinition;
  content: { lines: readonly SpecContentLine[] };
}

export class SpecBuilderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpecBuilderError';
  }
}

function requireValid(label: string, result: { ok: boolean; issues?: readonly { path: string; message: string }[] }): void {
  if (result.ok) return;
  const detail = (result.issues ?? []).map((issue) => `${issue.path}: ${issue.message}`).join('; ');
  throw new SpecBuilderError(`${label} invalide${detail ? ` — ${detail}` : ''}`);
}

function bindingFor(style: ResolvedStyle): StyleBinding {
  if (style.mode === 'brand') {
    if (!style.sources.brand) throw new SpecBuilderError('Style résolu en mode brand sans source brand.');
    return { kind: 'brand', id: style.sources.brand.id, version: style.sources.brand.version };
  }
  if (style.mode === 'series') {
    if (!style.sources.series) throw new SpecBuilderError('Style résolu en mode series sans source series.');
    return { kind: 'series', id: style.sources.series.id, version: style.sources.series.version };
  }
  return { kind: 'style', id: style.sources.style.id, version: style.sources.style.version };
}

/**
 * P1.2 : expansion déterministe d'un pattern stack vers Group/Text/Shape.
 * Aucun choix artistique n'est fait ici : ordre, slots et rôles viennent du pattern.
 */
export function buildMotionSceneSpec(input: BuildSpecInput): MotionSceneSpec {
  requireValid('CreativeIntent', validateIntent(input.intent));
  requireValid('ResolvedStyle', validateResolvedStyle(input.resolvedStyle));
  requireValid('PlatformPreset', validatePlatformPresets(input.platformPresets));
  requireValid('PatternDefinition', validatePatternDefinition(input.pattern));

  if (!input.intent.platforms.includes(input.platform)) {
    throw new SpecBuilderError(`La plateforme « ${input.platform} » n'est pas déclarée dans l'intent.`);
  }
  const platform = input.platformPresets.platforms[input.platform];
  if (!platform?.formats.includes('vertical_9x16')) {
    throw new SpecBuilderError(`La plateforme « ${input.platform} » ne supporte pas vertical_9x16.`);
  }
  if (
    input.content.lines.length < input.pattern.constraints.min_lines ||
    input.content.lines.length > input.pattern.constraints.max_lines
  ) {
    throw new SpecBuilderError(
      `Le pattern exige ${input.pattern.constraints.min_lines} à ${input.pattern.constraints.max_lines} lignes explicites.`,
    );
  }

  const children: Layer[] = [...input.pattern.slots]
    .sort((a, b) => a.order - b.order)
    .map((slot) => {
      if (slot.primitive === 'shape') {
        return {
          id: 'shape_interrupt',
          primitive: 'shape',
          shape: 'rect',
          slot: slot.id,
          fill: slot.style.fill,
          behaviors: [],
        };
      }
      return {
        id: 'text_statement',
        primitive: 'text',
        slot: slot.id,
        content: {
          runs: input.content.lines.map((line, index) => ({
            id: `line_${index + 1}`,
            text: line.text,
            ...(line.accent ? { role: 'accent' as const } : {}),
            ...(index < input.content.lines.length - 1 ? { break_after: true } : {}),
          })),
          break_policy: 'explicit',
        },
        style: {
          type: slot.style.type,
          color: slot.style.color,
          accent_color: slot.style.accent_color,
          align: input.pattern.layout.align_x,
        },
        behaviors: [],
      };
    });

  return MotionSceneSpecSchema.parse({
    schema: 'motion-scene-spec',
    schema_version: MOTION_SPEC_VERSION,
    spec_id: input.intent.intent_id,
    revision: 1,
    parent_revision: null,
    created_from: {
      intent_id: input.intent.intent_id,
      intent_sha256: hashDocument(input.intent),
      builder_version: SPEC_BUILDER_VERSION,
    },
    locale: input.intent.locale,
    style_binding: bindingFor(input.resolvedStyle),
    format: { preset: 'vertical_9x16', platform_safe_zones: [input.platform] },
    system: { id: input.pattern.id, version: input.pattern.version },
    rhythm: {
      curve: input.intent.tension_curve,
      sections: [{ id: 'section_interrupt', phase: 'INTERRUPTION', scenes: ['scene_interrupt'] }],
    },
    voice: {
      direction: { persona: 'narrator', intention: 'non rendue en P1.2', tempo: 'measured' },
      segments: [],
    },
    scenes: [
      {
        id: 'scene_interrupt',
        pattern: { id: input.pattern.id, version: input.pattern.version, variation: {} },
        purpose: 'hook',
        locks: [],
        timing: { anchor: { duration: { beats: 8 } }, min_hold: 'reading' },
        background: { fill: input.pattern.background },
        layers: [
          {
            id: 'group_statement',
            primitive: 'group',
            slot: 'composition.root',
            behaviors: [],
            children,
          },
        ],
        events: [{ id: 'event_interrupt', kind: 'INTERRUPTION', at: { event: 'scene.start' } }],
        sound: { derive_from_events: false, overrides: [] },
        subtitles: { mode: 'off', reason: 'texte à l’écran ; audio hors périmètre P1.2' },
      },
    ],
  });
}
