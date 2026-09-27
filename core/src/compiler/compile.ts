import type { Platform } from '../contracts/common.ts';
import type { GroupLayer, Layer, ShapeLayer, TextLayer } from '../contracts/motion-spec.ts';
import type { PatternDefinition, PatternSlot } from '../contracts/pattern.ts';
import type { PlatformPresets } from '../contracts/platform.ts';
import {
  RENDER_PLAN_VERSION,
  RenderPlanSchema,
} from '../contracts/render-plan.ts';
import type { Box, PlanNode, PlanRun, PlanTextNode, RenderPlan } from '../contracts/render-plan.ts';
import type { ResolvedStyle } from '../contracts/resolved-style.ts';
import type { TypeStyle } from '../contracts/style-profile.ts';
import { hashDocument } from '../integrity/canonical.ts';
import { compileLayerTracks } from '../motion/compile-tracks.ts';
import { P13_BEHAVIOR_REGISTRY } from '../motion/behavior-registry.ts';
import type { BehaviorRegistry } from '../motion/behavior-registry.ts';
import { resolveTemporalPlan } from '../temporal/resolve.ts';
import type { ResolvedSceneTiming } from '../temporal/resolve.ts';
import { validatePatternDefinition, validatePlatformPresets, validateRenderPlan, validateSpec } from '../validation/validate.ts';
import type { MotionSceneSpec } from '../contracts/motion-spec.ts';

export const COMPILER_VERSION = '0.2.0';

export interface FontResource {
  file: string;
  sha256: string;
}

export interface CompileInput {
  spec: MotionSceneSpec;
  resolvedStyle: ResolvedStyle;
  platformPresets: PlatformPresets;
  pattern: PatternDefinition;
  fontResources: Readonly<Record<string, FontResource>>;
  config: {
    fps: number;
    scene_duration_frames?: number;
    render_scale?: number;
    reduced_motion?: boolean;
    max_render_cost?: number;
    max_attention_cost?: number;
  };
  behaviorRegistry?: BehaviorRegistry;
  allowStyleSubstitution?: boolean;
}

export class CompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompileError';
  }
}

function failValidation(label: string, result: { ok: boolean; issues?: readonly { path: string; message: string }[] }): void {
  if (result.ok) return;
  const detail = (result.issues ?? []).map((issue) => `${issue.path}: ${issue.message}`).join('; ');
  throw new CompileError(`${label} invalide${detail ? ` — ${detail}` : ''}`);
}

function tokenKey(token: string, namespace: string): string {
  const prefix = `${namespace}.`;
  if (!token.startsWith(prefix)) throw new CompileError(`Jeton ${namespace} attendu, reçu « ${token} ».`);
  return token.slice(prefix.length);
}

function resolveColor(style: ResolvedStyle, token: string): string {
  const value = style.style.palette[tokenKey(token, 'color')];
  if (!value) throw new CompileError(`Couleur « ${token} » introuvable.`);
  return value;
}

function resolveSpace(style: ResolvedStyle, token: string, scale: number): number {
  const value = style.style.space[tokenKey(token, 'space')];
  if (value === undefined) throw new CompileError(`Espacement « ${token} » introuvable.`);
  return value * scale;
}

function resolveType(style: ResolvedStyle, token: string): TypeStyle {
  const value = style.style.typography.scale[tokenKey(token, 'type')];
  if (!value) throw new CompileError(`Style typographique « ${token} » introuvable.`);
  return value;
}

function safeBox(presets: PlatformPresets, platform: Platform, format: string, outputWidth: number, outputHeight: number): Box {
  const canvas = presets.formats[format];
  const preset = presets.platforms[platform];
  if (!canvas || !preset) throw new CompileError(`Preset ${platform}/${format} introuvable.`);
  const reference = presets.formats[preset.safe_zone.format];
  if (!reference) throw new CompileError(`Format de zone sûre « ${preset.safe_zone.format} » introuvable.`);
  const sx = outputWidth / reference.width;
  const sy = outputHeight / reference.height;
  const i = preset.safe_zone.insets;
  return {
    x: i.left * sx,
    y: i.top * sy,
    w: outputWidth - (i.left + i.right) * sx,
    h: outputHeight - (i.top + i.bottom) * sy,
  };
}

function alignOffset(container: number, item: number, align: 'start' | 'center' | 'end'): number {
  if (align === 'center') return (container - item) / 2;
  if (align === 'end') return container - item;
  return 0;
}

function explicitLines(layer: TextLayer): TextLayer['content']['runs'][] {
  const lines: TextLayer['content']['runs'][] = [];
  let current: TextLayer['content']['runs'] = [];
  for (const run of layer.content.runs) {
    current.push(run);
    if (run.break_after) {
      lines.push(current);
      current = [];
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

function fontId(family: string, weight: number, style: string): string {
  return `${family}_${weight}_${style}`.replace(/[^a-z0-9_]/g, '_').slice(0, 64);
}

interface CompileContext {
  style: ResolvedStyle;
  scaleX: number;
  scaleY: number;
  fonts: Map<string, RenderPlan['fonts'][number]>;
  resources: Readonly<Record<string, FontResource>>;
  timing: ResolvedSceneTiming;
  fps: number;
}

function compileText(layer: TextLayer, box: Box, context: CompileContext): PlanTextNode {
  const type = resolveType(context.style, layer.style.type);
  const family = context.style.style.typography.families[type.family];
  if (!family) throw new CompileError(`Famille typographique « ${type.family} » introuvable.`);
  const file = family.files.find((candidate) => candidate.weight === type.weight && candidate.style === 'normal');
  if (!file) throw new CompileError(`Fichier ${type.family}/${type.weight}/normal introuvable.`);
  const resource = context.resources[file.src];
  if (!resource || resource.sha256 !== file.sha256) {
    throw new CompileError(`Ressource de police « ${file.src} » absente ou empreinte différente.`);
  }
  const id = fontId(type.family, type.weight, file.style);
  context.fonts.set(id, {
    id,
    css_name: family.css_name,
    weight: type.weight,
    style: file.style,
    file: resource.file,
    sha256: resource.sha256,
  });

  const size = type.size * context.scaleX;
  const lineHeight = size * type.line_height;
  const lines = explicitLines(layer).map((runs, index) => ({
    runs: runs.map((run): PlanRun => {
      const colorToken = run.role === 'accent' ? layer.style.accent_color ?? layer.style.color : layer.style.color;
      return {
        id: run.id,
        text: type.case === 'upper' ? run.text.toLocaleUpperCase() : run.text,
        font: id,
        weight: type.weight,
        size,
        tracking_px: type.tracking_em * size,
        color: resolveColor(context.style, colorToken),
      };
    }),
    top: index * lineHeight,
    height: lineHeight,
    measured_width: null,
  }));
  return {
    id: layer.id,
    type: 'text',
    box,
    origin: { x: 0.5, y: 0.5 },
    opacity: layer.opacity ?? 1,
    align: layer.style.align ?? 'start',
    lines,
    tracks: compileLayerTracks(layer, context.timing, context.style, context.fps, context.scaleY),
  };
}

function compileShape(layer: ShapeLayer, box: Box, context: CompileContext): PlanNode {
  return {
    id: layer.id,
    type: 'shape',
    box,
    origin: { x: 0.5, y: 0.5 },
    opacity: layer.opacity ?? 1,
    shape: layer.shape,
    radius: layer.radius ? resolveSpace(context.style, layer.radius, context.scaleX) : 0,
    fill: layer.fill ? resolveColor(context.style, layer.fill) : null,
    stroke: layer.stroke
      ? {
          color: resolveColor(context.style, layer.stroke.color),
          width:
            (context.style.style.strokes[tokenKey(layer.stroke.weight, 'stroke')] ?? 0) * context.scaleX,
        }
      : null,
    tracks: compileLayerTracks(layer, context.timing, context.style, context.fps, context.scaleY),
  };
}

function slotExtent(slot: PatternSlot, layer: Layer, context: CompileContext, axis: 'width' | 'height', available: number): number {
  const size = slot[axis];
  if (size.kind === 'fill') return available;
  if (size.kind === 'space') return resolveSpace(context.style, size.token, axis === 'width' ? context.scaleX : context.scaleY);
  if (layer.primitive !== 'text') throw new CompileError(`La dimension content exige un calque texte (${layer.id}).`);
  const type = resolveType(context.style, layer.style.type);
  if (axis === 'width') return available;
  return explicitLines(layer).length * type.size * context.scaleX * type.line_height;
}

function compileGroup(group: GroupLayer, groupBox: Box, pattern: PatternDefinition, context: CompileContext): PlanNode {
  const bySlot = new Map(group.children.map((child) => [child.slot, child]));
  const items = [...pattern.slots]
    .sort((a, b) => a.order - b.order)
    .map((slot) => {
      const layer = bySlot.get(slot.id);
      if (!layer) throw new CompileError(`Slot requis « ${slot.id} » absent du groupe ${group.id}.`);
      if (layer.primitive !== slot.primitive) throw new CompileError(`Slot « ${slot.id} » incompatible avec ${layer.primitive}.`);
      return {
        slot,
        layer,
        width: slotExtent(slot, layer, context, 'width', groupBox.w),
        height: slotExtent(slot, layer, context, 'height', groupBox.h),
      };
    });
  const gap = resolveSpace(context.style, pattern.layout.gap, context.scaleY);
  const total = items.reduce((sum, item) => sum + item.height, 0) + gap * Math.max(0, items.length - 1);
  let y = alignOffset(groupBox.h, total, pattern.layout.align_y);
  const children = items.map((item) => {
    const box = {
      x: alignOffset(groupBox.w, item.width, pattern.layout.align_x),
      y,
      w: item.width,
      h: item.height,
    };
    y += item.height + gap;
    if (item.layer.primitive === 'text') return compileText(item.layer, box, context);
    if (item.layer.primitive === 'shape') return compileShape(item.layer, box, context);
    throw new CompileError('Primitive hors périmètre P1.2.');
  });
  return {
    id: group.id,
    type: 'group',
    box: groupBox,
    origin: { x: 0.5, y: 0.5 },
    opacity: group.opacity ?? 1,
    tracks: compileLayerTracks(group, context.timing, context.style, context.fps, context.scaleY),
    children,
  };
}

/** Compilation P1.2 pure : aucune horloge, aucun hasard, aucune lecture disque. */
export function compileMotionScene(input: CompileInput): RenderPlan {
  const registry = input.behaviorRegistry ?? P13_BEHAVIOR_REGISTRY;
  failValidation('PatternDefinition', validatePatternDefinition(input.pattern));
  failValidation('PlatformPresets', validatePlatformPresets(input.platformPresets));
  failValidation(
    'MotionSceneSpecification',
    validateSpec(input.spec, input.resolvedStyle, {
      allowStyleSubstitution: input.allowStyleSubstitution ?? false,
      registry,
    }),
  );
  if (!Number.isInteger(input.config.fps) || input.config.fps <= 0) throw new CompileError('fps doit être un entier positif.');
  if (input.config.scene_duration_frames !== undefined && (!Number.isInteger(input.config.scene_duration_frames) || input.config.scene_duration_frames <= 0)) {
    throw new CompileError('scene_duration_frames doit être un entier positif quand il est fourni.');
  }
  if (input.spec.system.id !== input.pattern.id || input.spec.system.version !== input.pattern.version) {
    throw new CompileError('Le PatternDefinition ne correspond pas au système déclaré par la spec.');
  }

  const presetCanvas = input.platformPresets.formats[input.spec.format.preset];
  if (!presetCanvas) throw new CompileError(`Format « ${input.spec.format.preset} » introuvable.`);
  const renderScale = input.config.render_scale ?? 1;
  if (!Number.isFinite(renderScale) || renderScale <= 0 || renderScale > 1) throw new CompileError('render_scale doit être dans ]0, 1].');
  const canvas = { width: Math.round(presetCanvas.width * renderScale), height: Math.round(presetCanvas.height * renderScale) };
  const platform = input.spec.format.platform_safe_zones[0];
  if (!platform) throw new CompileError('Une plateforme de zone sûre est requise.');
  const box = safeBox(input.platformPresets, platform, input.spec.format.preset, canvas.width, canvas.height);
  const fonts = new Map<string, RenderPlan['fonts'][number]>();
  const temporal = resolveTemporalPlan({
    spec: input.spec,
    resolvedStyle: input.resolvedStyle,
    fps: input.config.fps,
    registry,
    ...(input.config.reduced_motion !== undefined ? { reducedMotion: input.config.reduced_motion } : {}),
    ...(input.config.scene_duration_frames !== undefined ? { fallbackSceneFrames: input.config.scene_duration_frames } : {}),
    ...(input.config.max_render_cost !== undefined ? { maxRenderCost: input.config.max_render_cost } : {}),
    ...(input.config.max_attention_cost !== undefined ? { maxAttentionCost: input.config.max_attention_cost } : {}),
  });

  const scenes = input.spec.scenes.map((scene, index) => {
    if (scene.pattern.id !== input.pattern.id || scene.pattern.version !== input.pattern.version) {
      throw new CompileError(`La scène ${scene.id} utilise un autre pattern.`);
    }
    const timing = temporal.scenes[index];
    if (!timing) throw new CompileError(`Résolution temporelle absente pour ${scene.id}.`);
    const context: CompileContext = {
      style: input.resolvedStyle,
      scaleX: canvas.width / input.resolvedStyle.style.reference_canvas.width,
      scaleY: canvas.height / input.resolvedStyle.style.reference_canvas.height,
      fonts,
      resources: input.fontResources,
      timing,
      fps: input.config.fps,
    };
    const nodes = scene.layers.map((layer) => {
      if (layer.primitive !== 'group') throw new CompileError('P1.2 exige un Group racine.');
      return compileGroup(layer, box, input.pattern, context);
    });
    return {
      id: scene.id,
      from: timing.from_frame,
      to: timing.to_frame,
      background: resolveColor(input.resolvedStyle, scene.background.fill),
      nodes,
    };
  });

  const plan = RenderPlanSchema.parse({
    schema: 'render-plan',
    schema_version: RENDER_PLAN_VERSION,
    spec: { spec_id: input.spec.spec_id, revision: input.spec.revision, sha256: hashDocument(input.spec) },
    style: { mode: input.resolvedStyle.mode, sha256: input.resolvedStyle.sha256 },
    compiler_version: COMPILER_VERSION,
    canvas: {
      width: canvas.width,
      height: canvas.height,
      fps: input.config.fps,
      duration_frames: temporal.duration_frames,
    },
    fonts: [...fonts.values()].sort((a, b) => a.id.localeCompare(b.id)),
    assets: [],
    scenes,
  });
  failValidation('RenderPlan', validateRenderPlan(plan));
  return plan;
}
