import type {
  ArchetypeId,
  AssetIntent,
  ContentSlot,
  CreativeDiagnostic,
  NarrativeRole,
} from '@motion-engine/creative-core';

import type {
  CreativeGenerationRequest,
  GatewayFailureKind,
  PromptContract,
  ProviderMetadata,
  ProviderUsage,
} from './contracts.ts';

export interface ProviderResolutionContext {
  readonly plan_id: string;
  readonly content_slots: readonly ProviderContentSlotContext[];
  readonly asset_intents: readonly AssetIntent[];
}

export interface ProviderSceneTimeBudget {
  readonly scene_id: string;
  readonly available_ms: number;
  /** Budget total du calque texte de la scène, partagé entre les slots applicables. */
  readonly maximum_total_words: number;
  readonly maximum_recommended_characters_per_entry: number;
}

export interface ProviderContentSlotContext {
  readonly slot_id: ContentSlot['id'];
  readonly beat_id: ContentSlot['beat_id'];
  readonly role: ContentSlot['role'];
  readonly semantic_context: ContentSlot['semantic_context'];
  readonly constraints: ContentSlot['constraints'];
  readonly required: ContentSlot['required'];
  readonly language: ContentSlot['language'];
  readonly factual_requirement: ContentSlot['factual_requirement'];
  readonly status: ContentSlot['status'];
  /** Scènes canoniques P2.2 auxquelles ce slot peut être appliqué. */
  readonly allowed_scene_ids: readonly string[];
  readonly reading_budget_applies: boolean;
  readonly scene_time_budgets: readonly ProviderSceneTimeBudget[];
  /** Pour `scene_id = null`, budget de la scène admissible la plus restrictive. */
  readonly generic_time_budget: ProviderSceneTimeBudget | null;
  /** `scene_id = null` signifie appliquer la même résolution à toutes les scènes autorisées. */
  readonly generic_resolution_allowed: boolean;
}

export interface ProviderPlanningContext {
  readonly allowed_archetype_ids: readonly ArchetypeId[];
  readonly archetypes: readonly ProviderNarrativeArchetypeContext[];
  readonly constraint_policy: {
    readonly maximum_total_constraints: number;
    readonly request_constraint_count: number;
    readonly maximum_suggested_constraints: number;
    readonly request_constraint_ids: readonly string[];
  };
  readonly registry_fingerprint: string;
}

export interface ProviderNarrativeArchetypeContext {
  readonly archetype_id: ArchetypeId;
  readonly archetype_version: string;
  readonly selection_goals: readonly string[];
  readonly supported_roles: readonly NarrativeRole[];
  readonly required_roles: readonly NarrativeRole[];
  readonly optional_roles: readonly NarrativeRole[];
  readonly ordering_constraints: readonly {
    readonly before: NarrativeRole;
    readonly after: NarrativeRole;
  }[];
  readonly cta_allowed: boolean;
  readonly duration_constraints: {
    readonly minimum_total_ms: number;
    readonly minimum_scene_ms: number;
    readonly maximum_scene_count_for_request: number;
  };
}

export interface ProviderInvocation {
  readonly stage: 'planning' | 'resolution';
  readonly mode: 'generate' | 'repair';
  readonly attempt: number;
  readonly request: CreativeGenerationRequest;
  readonly prompt: PromptContract;
  readonly planning_context?: ProviderPlanningContext;
  readonly resolution_context?: ProviderResolutionContext;
  readonly repair_diagnostics: readonly CreativeDiagnostic[];
  readonly signal: AbortSignal;
}

export interface ProviderResponse {
  /** Donnée brute non fiable. Le Gateway est l’unique frontière de validation. */
  readonly output: unknown;
  readonly usage?: ProviderUsage;
}

export interface CreativeProvider {
  readonly metadata: ProviderMetadata;
  generate(invocation: ProviderInvocation): Promise<ProviderResponse>;
}

export class GatewayProviderError extends Error {
  readonly kind: GatewayFailureKind;

  constructor(kind: GatewayFailureKind, message: string) {
    super(message);
    this.name = 'GatewayProviderError';
    this.kind = kind;
  }
}
