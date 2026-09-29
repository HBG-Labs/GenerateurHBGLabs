import { BehaviorDefinitionSchema } from '../contracts/behavior.ts';
import type { BehaviorDefinition } from '../contracts/behavior.ts';
import type { BehaviorInfo, SemanticRegistry } from '../validation/semantic-spec.ts';
import { hashDocument } from '../integrity/canonical.ts';

const definition = (input: BehaviorDefinition): BehaviorDefinition => BehaviorDefinitionSchema.parse(input);

export const P13_BEHAVIOR_DEFINITIONS: readonly BehaviorDefinition[] = Object.freeze([
  definition({
    schema: 'behavior-definition',
    schema_version: '0.1.0',
    id: 'REVEAL_TEXT',
    version: '1.0.0',
    intent: 'Rendre un texte lisible par une entrée progressive dont la personnalité vient du style.',
    compatible_primitives: ['text'],
    variants: ['mask_up', 'fade_up'],
    parameters: {
      unit: { type: 'enum', required: false, default: 'line', values: ['layer', 'line'] },
      stagger: { type: 'enum', required: false, default: 'style', values: ['style', 'tight', 'normal', 'wide'] },
    },
    animatable_properties: ['opacity', 'translate_y'],
    accepted_anchors: ['SCENE_START', 'AFTER_PREVIOUS', 'WITH_LAYER', 'AFTER_LAYER'],
    constraints: { target: 'none', max_instances_per_layer: 1 },
    incompatibilities: ['CUT'],
    duration_budget: { min_ms: 120, default_beats: 1.2, max_ms: 1_600 },
    reduced_motion: { strategy: 'opacity_only' },
    render_cost: { compute: 2, attention: 2 },
  }),
  definition({
    schema: 'behavior-definition',
    schema_version: '0.1.0',
    id: 'ACCENT_WORD',
    version: '1.0.0',
    intent: 'Accentuer un run textuel sans changer le contenu ni introduire de décision de marque.',
    compatible_primitives: ['text'],
    variants: ['color_settle', 'color_only'],
    parameters: {},
    animatable_properties: ['scale'],
    accepted_anchors: ['SCENE_START', 'AFTER_PREVIOUS', 'WITH_LAYER', 'AFTER_LAYER'],
    constraints: { target: 'required_run', max_instances_per_layer: 4 },
    incompatibilities: ['CUT'],
    duration_budget: { min_ms: 100, default_beats: 0.8, max_ms: 1_200 },
    reduced_motion: { strategy: 'instant' },
    render_cost: { compute: 1, attention: 2 },
  }),
  definition({
    schema: 'behavior-definition',
    schema_version: '0.1.0',
    id: 'SETTLE',
    version: '1.0.0',
    intent: 'Amener un élément accentué à son état visuel stable.',
    compatible_primitives: ['group', 'text', 'shape'],
    variants: [],
    parameters: {},
    animatable_properties: ['scale'],
    accepted_anchors: ['SCENE_START', 'AFTER_PREVIOUS', 'WITH_LAYER', 'AFTER_LAYER'],
    constraints: { target: 'optional_run_or_line', max_instances_per_layer: 4 },
    incompatibilities: ['CUT'],
    duration_budget: { min_ms: 100, default_beats: 0.6, max_ms: 1_200 },
    reduced_motion: { strategy: 'instant' },
    render_cost: { compute: 1, attention: 1 },
  }),
  definition({
    schema: 'behavior-definition',
    schema_version: '0.1.0',
    id: 'EXIT_CLEAR',
    version: '1.0.0',
    intent: 'Faire sortir proprement un élément avant la fin de sa scène.',
    compatible_primitives: ['group', 'text', 'shape'],
    variants: [],
    parameters: {},
    animatable_properties: ['opacity', 'translate_y'],
    accepted_anchors: ['SCENE_END', 'BEFORE_NEXT', 'AFTER_PREVIOUS'],
    constraints: { target: 'none', max_instances_per_layer: 1 },
    incompatibilities: ['CUT', 'REVEAL_TEXT'],
    duration_budget: { min_ms: 120, default_beats: 1, max_ms: 1_600 },
    reduced_motion: { strategy: 'opacity_only' },
    render_cost: { compute: 2, attention: 2 },
  }),
  definition({
    schema: 'behavior-definition',
    schema_version: '0.1.0',
    id: 'CUT',
    version: '1.0.0',
    intent: 'Appliquer un changement temporel immédiat sans interpolation artificielle.',
    compatible_primitives: ['group', 'text', 'shape'],
    variants: [],
    parameters: {},
    animatable_properties: ['opacity'],
    accepted_anchors: ['SCENE_START', 'SCENE_END', 'BEFORE_NEXT'],
    constraints: { target: 'none', max_instances_per_layer: 1 },
    incompatibilities: ['REVEAL_TEXT', 'ACCENT_WORD', 'SETTLE', 'EXIT_CLEAR'],
    duration_budget: { min_ms: 0, default_beats: 0, max_ms: 0 },
    reduced_motion: { strategy: 'preserve' },
    render_cost: { compute: 0, attention: 1 },
  }),
]);

export const P14_VISUAL_BEHAVIOR_DEFINITIONS: readonly BehaviorDefinition[] = Object.freeze([
  definition({
    schema: 'behavior-definition', schema_version: '0.1.0', id: 'DRAW_PATH', version: '1.0.0',
    intent: 'Révéler progressivement un tracé interne déjà résolu.', compatible_primitives: ['path'], variants: [],
    parameters: {}, animatable_properties: ['path_progress'],
    accepted_anchors: ['SCENE_START', 'AFTER_PREVIOUS', 'WITH_LAYER', 'AFTER_LAYER'],
    constraints: { target: 'none', max_instances_per_layer: 1 }, incompatibilities: ['CUT'],
    duration_budget: { min_ms: 100, default_beats: 1, max_ms: 2_000 },
    reduced_motion: { strategy: 'instant' }, render_cost: { compute: 1, attention: 1 },
  }),
  definition({
    schema: 'behavior-definition', schema_version: '0.1.0', id: 'MATCH_LINE', version: '1.0.0',
    intent: 'Connecter deux géométries résolues sans coordonnées de marque.', compatible_primitives: ['path'], variants: [],
    parameters: {
      from_layer: { type: 'string', required: true },
      to_layer: { type: 'string', required: true },
    },
    animatable_properties: ['path_progress'], accepted_anchors: ['SCENE_START', 'AFTER_PREVIOUS', 'WITH_LAYER'],
    constraints: { target: 'none', max_instances_per_layer: 1 }, incompatibilities: ['CUT'],
    duration_budget: { min_ms: 100, default_beats: 0.8, max_ms: 1_600 },
    reduced_motion: { strategy: 'instant' }, render_cost: { compute: 1, attention: 1 },
  }),
  definition({
    schema: 'behavior-definition', schema_version: '0.1.0', id: 'CAMERA_PUSH', version: '1.0.0',
    intent: 'Appliquer un push subtil dont l’intensité reste bornée par le style.', compatible_primitives: ['group', 'image'], variants: [],
    parameters: { scale: { type: 'number', required: false, default: 1.06, min: 1, max: 1.25 } },
    animatable_properties: ['scale'], accepted_anchors: ['SCENE_START', 'AFTER_PREVIOUS', 'WITH_LAYER'],
    constraints: { target: 'none', max_instances_per_layer: 1 }, incompatibilities: ['CUT'],
    duration_budget: { min_ms: 300, default_beats: 3, max_ms: 10_000 },
    reduced_motion: { strategy: 'instant' }, render_cost: { compute: 2, attention: 1 },
  }),
  definition({
    schema: 'behavior-definition', schema_version: '0.1.0', id: 'FOCUS_REGION', version: '1.0.0',
    intent: 'Diriger l’attention vers une région sémantique déclarée.', compatible_primitives: ['image'], variants: [],
    parameters: {
      region: { type: 'string', required: true },
      scale: { type: 'number', required: false, default: 1.08, min: 1, max: 1.3 },
    },
    animatable_properties: ['translate_x', 'translate_y', 'scale'], accepted_anchors: ['SCENE_START', 'AFTER_PREVIOUS', 'WITH_LAYER'],
    constraints: { target: 'none', max_instances_per_layer: 1 }, incompatibilities: ['CUT'],
    duration_budget: { min_ms: 200, default_beats: 1.5, max_ms: 4_000 },
    reduced_motion: { strategy: 'opacity_only' }, render_cost: { compute: 2, attention: 2 },
  }),
  definition({
    schema: 'behavior-definition', schema_version: '0.1.0', id: 'HIGHLIGHT_REGION', version: '1.0.0',
    intent: 'Mettre en évidence une région par une primitive graphique générique.', compatible_primitives: ['shape', 'group'],
    variants: ['outline', 'surface', 'accent', 'dim_surrounding'],
    parameters: {
      image_layer: { type: 'string', required: true },
      region: { type: 'string', required: true },
    }, animatable_properties: ['opacity', 'scale', 'color'],
    accepted_anchors: ['SCENE_START', 'AFTER_PREVIOUS', 'WITH_LAYER'],
    constraints: { target: 'none', max_instances_per_layer: 2 }, incompatibilities: ['CUT'],
    duration_budget: { min_ms: 100, default_beats: 0.7, max_ms: 2_000 },
    reduced_motion: { strategy: 'opacity_only' }, render_cost: { compute: 1, attention: 2 },
  }),
  definition({
    schema: 'behavior-definition', schema_version: '0.1.0', id: 'MASK_WIPE', version: '1.0.0',
    intent: 'Révéler une composition par les bords d’un masque résolu.', compatible_primitives: ['mask'], variants: [],
    parameters: {
      direction: { type: 'enum', required: false, default: 'left_to_right', values: ['left_to_right', 'right_to_left', 'top_to_bottom', 'bottom_to_top'] },
    },
    animatable_properties: ['clip_top', 'clip_right', 'clip_bottom', 'clip_left'],
    accepted_anchors: ['SCENE_START', 'AFTER_PREVIOUS', 'WITH_LAYER'],
    constraints: { target: 'none', max_instances_per_layer: 1 }, incompatibilities: ['CUT'],
    duration_budget: { min_ms: 120, default_beats: 1, max_ms: 2_500 },
    reduced_motion: { strategy: 'instant' }, render_cost: { compute: 2, attention: 2 },
  }),
]);

export const P14_BEHAVIOR_DEFINITIONS: readonly BehaviorDefinition[] = Object.freeze([
  ...P13_BEHAVIOR_DEFINITIONS,
  ...P14_VISUAL_BEHAVIOR_DEFINITIONS,
]);

export const P17_DYNAMIC_TYPOGRAPHY_BEHAVIOR_DEFINITIONS: readonly BehaviorDefinition[] = Object.freeze([
  definition({
    schema: 'behavior-definition', schema_version: '0.1.0', id: 'TYPE_TRACKING', version: '1.0.0',
    intent: 'Animer le tracking d’un run façonné sans modifier son contenu.', compatible_primitives: ['text'], variants: [],
    parameters: {
      from_em: { type: 'number', required: true, min: -0.2, max: 0.5 },
      to_em: { type: 'number', required: true, min: -0.2, max: 0.5 },
    },
    animatable_properties: ['tracking_px'], accepted_anchors: ['SCENE_START', 'AFTER_PREVIOUS', 'WITH_LAYER', 'AFTER_LAYER'],
    constraints: { target: 'required_run', max_instances_per_layer: 4 }, incompatibilities: ['CUT'],
    duration_budget: { min_ms: 100, default_beats: 1, max_ms: 5_000 },
    reduced_motion: { strategy: 'instant' }, render_cost: { compute: 2, attention: 2 },
  }),
  definition({
    schema: 'behavior-definition', schema_version: '0.1.0', id: 'TYPE_AXIS', version: '1.0.0',
    intent: 'Animer un axe de fonte variable explicitement supporté et borné.', compatible_primitives: ['text'], variants: [],
    parameters: {
      axis: { type: 'enum', required: true, values: ['wght', 'wdth'] },
      from: { type: 'number', required: true, min: 1, max: 2_000 },
      to: { type: 'number', required: true, min: 1, max: 2_000 },
    },
    animatable_properties: ['font_axis.wght', 'font_axis.wdth'], accepted_anchors: ['SCENE_START', 'AFTER_PREVIOUS', 'WITH_LAYER', 'AFTER_LAYER'],
    constraints: { target: 'required_run', max_instances_per_layer: 4 }, incompatibilities: ['CUT'],
    duration_budget: { min_ms: 100, default_beats: 1, max_ms: 5_000 },
    reduced_motion: { strategy: 'instant' }, render_cost: { compute: 3, attention: 2 },
  }),
]);

export const P17_BEHAVIOR_DEFINITIONS: readonly BehaviorDefinition[] = Object.freeze([
  ...P14_BEHAVIOR_DEFINITIONS,
  ...P17_DYNAMIC_TYPOGRAPHY_BEHAVIOR_DEFINITIONS,
]);

export class BehaviorRegistry implements SemanticRegistry {
  readonly #definitions: Map<string, BehaviorDefinition>;

  constructor(definitions: readonly BehaviorDefinition[]) {
    this.#definitions = new Map();
    for (const input of definitions) {
      const parsed = BehaviorDefinitionSchema.parse(input);
      if (this.#definitions.has(parsed.id)) throw new Error(`BehaviorDefinition en double : ${parsed.id}`);
      this.#definitions.set(parsed.id, parsed);
    }
  }

  behavior(id: string): BehaviorInfo | undefined {
    const value = this.#definitions.get(id);
    return value
      ? {
          applies_to: value.compatible_primitives,
          variants: value.variants,
          version: value.version,
          accepted_anchors: value.accepted_anchors,
          parameters: value.parameters,
          target: value.constraints.target,
          max_instances_per_layer: value.constraints.max_instances_per_layer,
        }
      : undefined;
  }

  definition(id: string, version?: string): BehaviorDefinition | undefined {
    const value = this.#definitions.get(id);
    return value && (version === undefined || value.version === version) ? value : undefined;
  }

  definitions(): readonly BehaviorDefinition[] {
    return [...this.#definitions.values()];
  }
}

export const P13_BEHAVIOR_REGISTRY = new BehaviorRegistry(P13_BEHAVIOR_DEFINITIONS);
export const P14_BEHAVIOR_REGISTRY = new BehaviorRegistry(P14_BEHAVIOR_DEFINITIONS);
export const P17_BEHAVIOR_REGISTRY = new BehaviorRegistry(P17_BEHAVIOR_DEFINITIONS);

export function behaviorRegistryFingerprint(registry: BehaviorRegistry): string {
  return hashDocument(registry.definitions());
}
