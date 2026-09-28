import { z } from 'zod';

import { hashCreativeDocument } from '../canonical.ts';
import { SemanticTagSchema } from '../contracts/common.ts';
import type { PlannerInput } from './contracts.ts';
import {
  ArchetypeIdSchema,
  InformationDensitySchema,
  NarrativeRoleSchema,
  type ArchetypeId,
  type InformationDensity,
  type NarrativeRole,
} from './contracts.ts';

export const ArchetypeRoleRuleSchema = z.strictObject({
  role: NarrativeRoleSchema,
  required: z.boolean(),
  activation_duration_ms: z.number().int().nonnegative(),
  importance: z.number().int().min(1).max(100),
  duration_weight: z.number().int().positive().max(1_000),
  information_density: InformationDensitySchema,
  splittable: z.boolean(),
});
export type ArchetypeRoleRule = z.infer<typeof ArchetypeRoleRuleSchema>;

export const NarrativeArchetypeSchema = z.strictObject({
  id: ArchetypeIdSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  selection_goals: z.array(SemanticTagSchema).max(16),
  selection_priority: z.number().int().min(0).max(1_000),
  supported_roles: z.array(NarrativeRoleSchema).min(1),
  required_roles: z.array(NarrativeRoleSchema).min(1),
  optional_roles: z.array(NarrativeRoleSchema),
  ordering_constraints: z.array(
    z.strictObject({ before: NarrativeRoleSchema, after: NarrativeRoleSchema }),
  ),
  role_rules: z.array(ArchetypeRoleRuleSchema).min(1),
  duration_strategy: z.strictObject({
    minimum_total_ms: z.number().int().positive(),
    minimum_scene_ms: z.number().int().positive(),
    scene_count_bands: z
      .array(
        z.strictObject({
          max_duration_ms: z.number().int().positive(),
          max_scenes: z.number().int().positive(),
        }),
      )
      .min(1),
  }),
  pacing_strategy: z.strictObject({
    default: z.enum(['slow', 'measured', 'medium', 'fast', 'aggressive']),
    role_overrides: z.partialRecord(NarrativeRoleSchema, z.enum(['slow', 'measured', 'medium', 'fast', 'aggressive'])),
  }),
  validation_rules: z.strictObject({
    allow_cta: z.boolean(),
    max_repeated_role_scenes: z.number().int().positive().max(8),
  }),
});
export type NarrativeArchetype = z.infer<typeof NarrativeArchetypeSchema>;

interface RoleInput {
  readonly role: NarrativeRole;
  readonly required: boolean;
  readonly at?: number;
  readonly importance: number;
  readonly weight: number;
  readonly density: InformationDensity;
  readonly splittable?: boolean;
}

function archetype(
  id: ArchetypeId,
  selectionGoals: readonly string[],
  roles: readonly RoleInput[],
  bands: readonly { max_duration_ms: number; max_scenes: number }[],
  options: { minimum_total_ms?: number; minimum_scene_ms?: number; pacing?: NarrativeArchetype['pacing_strategy']['default'] } = {},
): NarrativeArchetype {
  const supportedRoles = [...roles.map((entry) => entry.role), 'cta' as const];
  return NarrativeArchetypeSchema.parse({
    id,
    version: '1.0.0',
    selection_goals: selectionGoals,
    selection_priority: 100 - DEFAULT_ARCHETYPE_ORDER.findIndex((entry) => entry === id),
    supported_roles: [...new Set(supportedRoles)],
    required_roles: roles.filter((entry) => entry.required).map((entry) => entry.role),
    optional_roles: [...roles.filter((entry) => !entry.required).map((entry) => entry.role), 'cta'],
    ordering_constraints: roles.slice(0, -1).map((entry, index) => ({ before: entry.role, after: roles[index + 1]!.role })),
    role_rules: roles.map((entry) => ({
      role: entry.role,
      required: entry.required,
      activation_duration_ms: entry.at ?? 0,
      importance: entry.importance,
      duration_weight: entry.weight,
      information_density: entry.density,
      splittable: entry.splittable ?? entry.role !== 'hook',
    })),
    duration_strategy: {
      minimum_total_ms: options.minimum_total_ms ?? 3_000,
      minimum_scene_ms: options.minimum_scene_ms ?? 1_000,
      scene_count_bands: bands,
    },
    pacing_strategy: { default: options.pacing ?? 'medium', role_overrides: {} },
    validation_rules: { allow_cta: true, max_repeated_role_scenes: 4 },
  });
}

export const DEFAULT_ARCHETYPE_ORDER = [
  'HYPOTHETICAL',
  'EXPLAINER',
  'PROBLEM_SOLUTION',
  'LIST',
  'COMPARISON',
  'REVEAL',
  'DEMONSTRATION',
] as const satisfies readonly ArchetypeId[];

const commonBands = [
  { max_duration_ms: 6_000, max_scenes: 2 },
  { max_duration_ms: 12_000, max_scenes: 3 },
  { max_duration_ms: 20_000, max_scenes: 4 },
  { max_duration_ms: 40_000, max_scenes: 6 },
  { max_duration_ms: 90_000, max_scenes: 8 },
  { max_duration_ms: 180_000, max_scenes: 12 },
] as const;

export const DEFAULT_ARCHETYPES: readonly NarrativeArchetype[] = Object.freeze([
  archetype(
    'HYPOTHETICAL',
    ['hypothetical'],
    [
      { role: 'hook', required: true, importance: 100, weight: 12, density: 'low' },
      { role: 'premise', required: true, importance: 82, weight: 18, density: 'medium' },
      { role: 'consequence', required: false, at: 10_000, importance: 78, weight: 18, density: 'high' },
      { role: 'escalation', required: false, at: 15_000, importance: 88, weight: 18, density: 'high' },
      { role: 'reveal', required: true, importance: 96, weight: 20, density: 'medium' },
      { role: 'payoff', required: true, importance: 86, weight: 14, density: 'low' },
    ],
    commonBands,
  ),
  archetype(
    'EXPLAINER',
    ['explain', 'educate'],
    [
      { role: 'hook', required: true, importance: 95, weight: 12, density: 'low' },
      { role: 'context', required: false, at: 8_000, importance: 65, weight: 14, density: 'medium' },
      { role: 'explanation', required: true, importance: 95, weight: 34, density: 'high' },
      { role: 'example', required: false, at: 15_000, importance: 72, weight: 22, density: 'medium' },
      { role: 'takeaway', required: true, importance: 85, weight: 18, density: 'low' },
    ],
    commonBands,
    { pacing: 'measured' },
  ),
  archetype(
    'PROBLEM_SOLUTION',
    ['problem_solution'],
    [
      { role: 'hook', required: false, at: 8_000, importance: 88, weight: 10, density: 'low' },
      { role: 'problem', required: true, importance: 96, weight: 22, density: 'medium' },
      { role: 'consequence', required: false, at: 12_000, importance: 75, weight: 16, density: 'medium' },
      { role: 'solution', required: true, importance: 98, weight: 26, density: 'medium' },
      { role: 'demonstration', required: false, at: 18_000, importance: 80, weight: 18, density: 'high' },
      { role: 'payoff', required: true, importance: 84, weight: 14, density: 'low' },
    ],
    commonBands,
  ),
  archetype(
    'LIST',
    ['list'],
    [
      { role: 'hook', required: true, importance: 92, weight: 12, density: 'low' },
      { role: 'item', required: true, importance: 72, weight: 24, density: 'medium' },
      { role: 'development', required: false, at: 18_000, importance: 68, weight: 18, density: 'high' },
      { role: 'strongest_item', required: true, importance: 94, weight: 28, density: 'medium' },
      { role: 'takeaway', required: true, importance: 82, weight: 18, density: 'low' },
    ],
    commonBands,
    { pacing: 'fast' },
  ),
  archetype(
    'COMPARISON',
    ['compare'],
    [
      { role: 'hook', required: true, importance: 90, weight: 10, density: 'low' },
      { role: 'comparison_a', required: true, importance: 80, weight: 20, density: 'medium' },
      { role: 'comparison_b', required: true, importance: 80, weight: 20, density: 'medium' },
      { role: 'contrast', required: true, importance: 96, weight: 30, density: 'high' },
      { role: 'takeaway', required: true, importance: 84, weight: 20, density: 'low' },
    ],
    commonBands,
  ),
  archetype(
    'REVEAL',
    ['reveal'],
    [
      { role: 'hook', required: false, at: 8_000, importance: 90, weight: 10, density: 'low' },
      { role: 'setup', required: true, importance: 76, weight: 18, density: 'medium' },
      { role: 'tension', required: false, at: 12_000, importance: 86, weight: 18, density: 'medium' },
      { role: 'partial_information', required: false, at: 18_000, importance: 72, weight: 16, density: 'high' },
      { role: 'reveal', required: true, importance: 100, weight: 28, density: 'medium' },
      { role: 'payoff', required: true, importance: 84, weight: 18, density: 'low' },
    ],
    commonBands,
  ),
  archetype(
    'DEMONSTRATION',
    ['demonstrate'],
    [
      { role: 'problem', required: false, at: 12_000, importance: 72, weight: 12, density: 'medium' },
      { role: 'context', required: true, importance: 70, weight: 14, density: 'low' },
      { role: 'action', required: true, importance: 96, weight: 30, density: 'high' },
      { role: 'result', required: true, importance: 92, weight: 22, density: 'medium' },
      { role: 'proof', required: false, at: 25_000, importance: 82, weight: 18, density: 'high' },
      { role: 'takeaway', required: true, importance: 80, weight: 16, density: 'low' },
    ],
    commonBands,
    { pacing: 'medium' },
  ),
]);

function validateDefinition(definition: NarrativeArchetype): void {
  const roles = definition.role_rules.map((rule) => rule.role);
  if (new Set(roles).size !== roles.length) throw new Error(`Rôle dupliqué dans ${definition.id}`);
  for (const role of definition.required_roles) {
    if (!definition.role_rules.some((rule) => rule.role === role && rule.required)) {
      throw new Error(`Rôle requis incohérent dans ${definition.id}: ${role}`);
    }
  }
  let previousDuration = 0;
  for (const band of definition.duration_strategy.scene_count_bands) {
    if (band.max_duration_ms <= previousDuration) throw new Error(`Bandes de durée non ordonnées dans ${definition.id}`);
    previousDuration = band.max_duration_ms;
  }
}

export class ArchetypeRegistry {
  readonly #definitions: ReadonlyMap<string, NarrativeArchetype>;

  constructor(definitions: readonly NarrativeArchetype[]) {
    const parsed = definitions.map((definition) => NarrativeArchetypeSchema.parse(definition));
    const map = new Map<string, NarrativeArchetype>();
    for (const definition of parsed) {
      validateDefinition(definition);
      if (map.has(definition.id)) throw new Error(`Archétype dupliqué : ${definition.id}`);
      map.set(definition.id, Object.freeze(definition));
    }
    this.#definitions = map;
  }

  get(id: string): NarrativeArchetype | undefined {
    return this.#definitions.get(id);
  }

  definitions(): readonly NarrativeArchetype[] {
    return [...this.#definitions.values()].sort((left, right) => left.id.localeCompare(right.id, 'en'));
  }

  fingerprint(): string {
    return hashCreativeDocument(this.definitions());
  }

  select(input: PlannerInput):
    | { readonly definition: NarrativeArchetype; readonly selection: 'received' | 'goal_match' | 'defaulted' }
    | null {
    if (input.narrative_archetype) {
      const definition = this.get(input.narrative_archetype);
      return definition ? { definition, selection: 'received' } : null;
    }
    const matches = this.definitions()
      .filter((definition) => definition.selection_goals.includes(input.creative_goal))
      .sort((left, right) => right.selection_priority - left.selection_priority || left.id.localeCompare(right.id, 'en'));
    if (matches[0]) return { definition: matches[0], selection: 'goal_match' };
    const fallback = this.get('EXPLAINER');
    return fallback ? { definition: fallback, selection: 'defaulted' } : null;
  }
}

export const DEFAULT_ARCHETYPE_REGISTRY = new ArchetypeRegistry(DEFAULT_ARCHETYPES);
