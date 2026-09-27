import { BehaviorDefinitionSchema } from '../contracts/behavior.ts';
import type { BehaviorDefinition } from '../contracts/behavior.ts';
import type { BehaviorInfo, SemanticRegistry } from '../validation/semantic-spec.ts';

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
