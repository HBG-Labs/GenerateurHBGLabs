import type { ContentSlot } from '@motion-engine/creative-core';

import type {
  PlanningGenerationOutput,
  ProviderCapability,
  ProviderMetadata,
  ProviderUsage,
  ResolutionGenerationOutput,
} from '../contracts.ts';
import type { CreativeProvider, ProviderInvocation, ProviderResponse } from '../provider.ts';
import { GatewayProviderError } from '../provider.ts';

const TEST_USAGE: ProviderUsage = {
  input_units: 120,
  output_units: 240,
  cached_units: 0,
  request_count: 1,
  provider_reported_cost: null,
};

function metadata(
  providerId: string,
  capabilities: readonly ProviderCapability[] = ['structured_output', 'json_schema', 'text_generation'],
): ProviderMetadata {
  return {
    provider_id: providerId,
    adapter_version: '0.1.0',
    capabilities: [...capabilities],
    model_family: 'deterministic_fixture',
    deterministic_test: true,
  };
}

function planningOutput(invocation: ProviderInvocation, variant = 0): PlanningGenerationOutput {
  const request = invocation.request;
  return {
    schema: 'creative-generation-output',
    schema_version: '0.1.0',
    stage: 'planning',
    request_id: request.request_id,
    provenance: 'fixture',
    normalized_topic: variant === 0 ? request.idea : `${request.idea} — variante ${variant + 1}`,
    creative_goal: request.creative_goal,
    audience: request.audience,
    language: request.language,
    locale: request.locale,
    target_duration_ms: request.target_duration_ms,
    target_format: request.target_format,
    tone: [...request.tone],
    pacing: 'fast',
    information_density: 'medium',
    narrative_archetype: 'HYPOTHETICAL',
    desired_reaction: request.desired_reaction,
    factual_mode: request.factual_mode,
    cta: request.cta,
    suggested_constraints: [],
  };
}

const ROLE_TEXT: Readonly<Record<ContentSlot['role'], readonly string[]>> = {
  hook_text: ["Et si les dinosaures existaient encore aujourd’hui ?"],
  narration: [
    'Nos villes changeraient d’échelle.',
    'Nos transports seraient repensés.',
    'La cohabitation serait imprévisible.',
    'La technologie suivrait leurs traces.',
  ],
  explanation: ['Leur présence transformerait nos territoires.'],
  factual_claim: ['Ceci reste une hypothèse créative.'],
  reveal: ['Le vrai défi : cohabiter.'],
  cta: ['Quelle règle choisiriez-vous ?'],
  statistic: ['Une planète, deux mondes.'],
  comparison: ['Nos villes face à leur échelle.'],
  label: ['COHABITATION'],
};

function resolutionOutput(invocation: ProviderInvocation, variant = 0): ResolutionGenerationOutput {
  const context = invocation.resolution_context;
  if (!context) throw new GatewayProviderError('semantic_invalid', 'Contexte de résolution absent.');
  const roleCounts = new Map<ContentSlot['role'], number>();
  return {
    schema: 'creative-generation-output',
    schema_version: '0.1.0',
    stage: 'resolution',
    request_id: invocation.request.request_id,
    plan_id: context.plan_id,
    provenance: 'fixture',
    content: context.content_slots.map((slot) => {
      const index = roleCounts.get(slot.role) ?? 0;
      roleCounts.set(slot.role, index + 1);
      const candidates = ROLE_TEXT[slot.role];
      const selected = candidates[index % candidates.length]!;
      return {
        slot_id: slot.slot_id,
        text: variant === 0 ? selected : `${selected} Variante ${variant + 1}.`,
        provenance: 'fixture' as const,
        uncertainty: slot.factual_requirement === 'none' ? 'none' as const : 'unknown' as const,
        source_required: slot.factual_requirement === 'source_required',
      };
    }),
    asset_descriptions: context.asset_intents.map((asset) => ({
      asset_intent_id: asset.id,
      asset_slot: asset.slot,
      description: asset.content_description ?? `${asset.kind} illustrant ${asset.purpose}`,
      provenance: 'fixture' as const,
    })),
  };
}

export class ValidProvider implements CreativeProvider {
  readonly metadata: ProviderMetadata = metadata('valid_fixture_provider');

  generate(invocation: ProviderInvocation): Promise<ProviderResponse> {
    return Promise.resolve({
      output: invocation.stage === 'planning' ? planningOutput(invocation) : resolutionOutput(invocation),
      usage: TEST_USAGE,
    });
  }
}

export class MalformedProvider implements CreativeProvider {
  readonly metadata: ProviderMetadata = metadata('malformed_fixture_provider');

  generate(_invocation: ProviderInvocation): Promise<ProviderResponse> {
    return Promise.resolve({ output: '{"schema":', usage: TEST_USAGE });
  }
}

export class RepairableProvider implements CreativeProvider {
  readonly metadata: ProviderMetadata = metadata('repairable_fixture_provider');
  private failed = false;

  generate(invocation: ProviderInvocation): Promise<ProviderResponse> {
    if (!this.failed) {
      this.failed = true;
      return Promise.resolve({ output: { unexpected: true }, usage: TEST_USAGE });
    }
    return Promise.resolve({
      output: invocation.stage === 'planning' ? planningOutput(invocation) : resolutionOutput(invocation),
      usage: TEST_USAGE,
    });
  }
}

export class UnknownArchetypeProvider extends ValidProvider {
  override readonly metadata: ProviderMetadata = metadata('unknown_archetype_provider');
  planningCalls = 0;

  override async generate(invocation: ProviderInvocation): Promise<ProviderResponse> {
    const valid = await super.generate(invocation);
    if (invocation.stage !== 'planning') return valid;
    this.planningCalls += 1;
    return {
      ...valid,
      output: {
        ...(valid.output as PlanningGenerationOutput),
        narrative_archetype: 'DYSTOPIE_ALTERNATIVE',
      },
    };
  }
}

export class RepairableArchetypeProvider extends ValidProvider {
  override readonly metadata: ProviderMetadata = metadata('repairable_archetype_provider');
  planningCalls = 0;
  repairDiagnostics: readonly string[] = [];

  override async generate(invocation: ProviderInvocation): Promise<ProviderResponse> {
    const valid = await super.generate(invocation);
    if (invocation.stage !== 'planning') return valid;
    this.planningCalls += 1;
    this.repairDiagnostics = invocation.repair_diagnostics.map((entry) => entry.code);
    if (this.planningCalls > 1) return valid;
    return {
      ...valid,
      output: {
        ...(valid.output as PlanningGenerationOutput),
        narrative_archetype: 'DYSTOPIE_ALTERNATIVE',
      },
    };
  }
}

export class RegistryAwareProvider extends ValidProvider {
  override readonly metadata: ProviderMetadata = metadata('registry_aware_provider');
  allowedArchetypes: readonly string[] = [];
  planningContexts: NonNullable<ProviderInvocation['planning_context']>[] = [];

  override async generate(invocation: ProviderInvocation): Promise<ProviderResponse> {
    const valid = await super.generate(invocation);
    if (invocation.stage !== 'planning') return valid;
    this.allowedArchetypes = invocation.planning_context?.allowed_archetype_ids ?? [];
    if (invocation.planning_context) this.planningContexts.push(invocation.planning_context);
    return {
      ...valid,
      output: {
        ...(valid.output as PlanningGenerationOutput),
        narrative_archetype: this.allowedArchetypes[0],
      },
    };
  }
}

export class ArchetypeConstraintProvider extends ValidProvider {
  override readonly metadata: ProviderMetadata = metadata('archetype_constraint_provider');
  planningCalls = 0;
  repairDiagnostics: readonly string[] = [];
  repairDiagnosticContexts: readonly unknown[] = [];
  planningContexts: NonNullable<ProviderInvocation['planning_context']>[] = [];
  private readonly initial: Pick<PlanningGenerationOutput, 'narrative_archetype' | 'suggested_constraints'>;
  private readonly repaired: Pick<PlanningGenerationOutput, 'narrative_archetype' | 'suggested_constraints'> | undefined;

  constructor(
    initial: Pick<PlanningGenerationOutput, 'narrative_archetype' | 'suggested_constraints'>,
    repaired?: Pick<PlanningGenerationOutput, 'narrative_archetype' | 'suggested_constraints'>,
  ) {
    super();
    this.initial = initial;
    this.repaired = repaired;
  }

  override async generate(invocation: ProviderInvocation): Promise<ProviderResponse> {
    const valid = await super.generate(invocation);
    if (invocation.stage !== 'planning') return valid;
    this.planningCalls += 1;
    this.repairDiagnostics = invocation.repair_diagnostics.map((entry) => entry.code);
    this.repairDiagnosticContexts = invocation.repair_diagnostics.map((entry) => entry.context ?? null);
    if (invocation.planning_context) this.planningContexts.push(invocation.planning_context);
    const variant = this.planningCalls > 1 && this.repaired ? this.repaired : this.initial;
    return {
      ...valid,
      output: {
        ...(valid.output as PlanningGenerationOutput),
        narrative_archetype: variant.narrative_archetype,
        suggested_constraints: variant.suggested_constraints,
      },
    };
  }
}

export class PlannerIncompatibleProvider extends ValidProvider {
  override readonly metadata: ProviderMetadata = metadata('planner_incompatible_provider');
  planningCalls = 0;
  repairDiagnostics: readonly string[] = [];

  override async generate(invocation: ProviderInvocation): Promise<ProviderResponse> {
    const valid = await super.generate(invocation);
    if (invocation.stage !== 'planning') return valid;
    this.planningCalls += 1;
    this.repairDiagnostics = invocation.repair_diagnostics.map((entry) => entry.code);
    if (this.planningCalls > 1) return valid;
    return {
      ...valid,
      output: {
        ...(valid.output as PlanningGenerationOutput),
        suggested_constraints: [
          { id: 'require_hook', kind: 'require_role', role: 'hook' },
          { id: 'forbid_hook', kind: 'forbid_role', role: 'hook' },
        ],
      },
    };
  }
}

export class AlwaysInvalidProvider implements CreativeProvider {
  readonly metadata: ProviderMetadata = metadata('always_invalid_provider');

  generate(_invocation: ProviderInvocation): Promise<ProviderResponse> {
    return Promise.resolve({ output: { motionSpec: { scenes: [] }, jsx: '<AbsoluteFill />' }, usage: TEST_USAGE });
  }
}

export class CapabilityLimitedProvider implements CreativeProvider {
  readonly metadata: ProviderMetadata = metadata('limited_fixture_provider', ['text_generation']);
  calls = 0;

  generate(_invocation: ProviderInvocation): Promise<ProviderResponse> {
    this.calls += 1;
    return Promise.resolve({ output: null, usage: TEST_USAGE });
  }
}

export class SlowCancellableProvider extends ValidProvider {
  override readonly metadata: ProviderMetadata = metadata('slow_fixture_provider');
  readonly delayMs: number;
  cancellationObserved = false;

  constructor(delayMs = 40) {
    super();
    this.delayMs = delayMs;
  }

  override async generate(invocation: ProviderInvocation): Promise<ProviderResponse> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, this.delayMs);
      invocation.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        this.cancellationObserved = true;
        reject(new GatewayProviderError('cancelled', 'Fake provider annulé.'));
      }, { once: true });
    });
    return super.generate(invocation);
  }
}

export class AlternatingProvider implements CreativeProvider {
  readonly metadata: ProviderMetadata = metadata('alternating_fixture_provider');
  private variant = -1;

  generate(invocation: ProviderInvocation): Promise<ProviderResponse> {
    if (invocation.stage === 'planning') this.variant += 1;
    return Promise.resolve({
      output: invocation.stage === 'planning'
        ? planningOutput(invocation, this.variant)
        : resolutionOutput(invocation, this.variant),
      usage: TEST_USAGE,
    });
  }
}

export class ThrowingSecretProvider implements CreativeProvider {
  readonly metadata: ProviderMetadata = metadata('throwing_fixture_provider');

  generate(_invocation: ProviderInvocation): Promise<ProviderResponse> {
    return Promise.reject(new Error('provider failed with api_key=sk-super-secret-value'));
  }
}

export class UnknownFieldProvider extends ValidProvider {
  override readonly metadata: ProviderMetadata = metadata('unknown_field_provider');

  override async generate(invocation: ProviderInvocation): Promise<ProviderResponse> {
    const valid = await super.generate(invocation);
    return {
      ...valid,
      output: { ...(valid.output as Record<string, unknown>), shellCommand: 'echo unsafe', filesystemPath: 'C:/secret' },
    };
  }
}

export class HallucinatedSourceProvider extends ValidProvider {
  override readonly metadata: ProviderMetadata = metadata('hallucinated_source_provider');

  override async generate(invocation: ProviderInvocation): Promise<ProviderResponse> {
    const valid = await super.generate(invocation);
    if (invocation.stage !== 'resolution') return valid;
    const output = valid.output as ResolutionGenerationOutput;
    return {
      ...valid,
      output: {
        ...output,
        content: output.content.map((entry, index) => index === 0
          ? { ...entry, source: 'https://provider.example/not-evidence' }
          : entry),
      },
    };
  }
}

export class UnavailableProvider implements CreativeProvider {
  readonly metadata: ProviderMetadata = metadata('unavailable_fixture_provider');

  generate(_invocation: ProviderInvocation): Promise<ProviderResponse> {
    return Promise.reject(new GatewayProviderError('provider_unavailable', 'Provider fixture indisponible.'));
  }
}
