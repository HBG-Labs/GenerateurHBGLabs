import {
  DEFAULT_ARCHETYPE_REGISTRY,
  DEFAULT_PLANNER_LIMITS,
  type PlannerOptions,
} from '@motion-engine/creative-core';

import type { CreativeGenerationRequest } from './contracts.ts';
import type { ProviderPlanningContext } from './provider.ts';

/**
 * Projection provider-agnostic du registre P2.2 actif.
 * Le registre et ses limites restent les seules sources de vérité.
 */
export function createProviderPlanningContext(
  request: CreativeGenerationRequest,
  options: PlannerOptions = {},
): ProviderPlanningContext {
  const registry = options.registry ?? DEFAULT_ARCHETYPE_REGISTRY;
  const limits = options.limits ?? DEFAULT_PLANNER_LIMITS;
  const definitions = registry.definitions();
  return {
    allowed_archetype_ids: definitions.map((definition) => definition.id),
    archetypes: definitions.map((definition) => ({
      archetype_id: definition.id,
      archetype_version: definition.version,
      selection_goals: [...definition.selection_goals],
      supported_roles: [...definition.supported_roles],
      required_roles: [...definition.required_roles],
      optional_roles: [...definition.optional_roles],
      ordering_constraints: definition.ordering_constraints.map((constraint) => ({ ...constraint })),
      cta_allowed: definition.validation_rules.allow_cta,
      duration_constraints: {
        minimum_total_ms: definition.duration_strategy.minimum_total_ms,
        minimum_scene_ms: definition.duration_strategy.minimum_scene_ms,
        maximum_scene_count_for_request: Math.min(
          limits.max_scenes,
          Math.floor(request.target_duration_ms / definition.duration_strategy.minimum_scene_ms),
        ),
      },
    })),
    constraint_policy: {
      maximum_total_constraints: limits.max_constraints,
      request_constraint_count: request.constraints.length,
      maximum_suggested_constraints: Math.max(0, limits.max_constraints - request.constraints.length),
      request_constraint_ids: request.constraints.map((constraint) => constraint.id),
    },
    registry_fingerprint: registry.fingerprint(),
  };
}
