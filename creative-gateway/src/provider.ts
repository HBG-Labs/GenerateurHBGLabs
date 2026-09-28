import type {
  AssetIntent,
  ContentSlot,
  CreativeDiagnostic,
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
  readonly content_slots: readonly ContentSlot[];
  readonly asset_intents: readonly AssetIntent[];
}

export interface ProviderInvocation {
  readonly stage: 'planning' | 'resolution';
  readonly mode: 'generate' | 'repair';
  readonly attempt: number;
  readonly request: CreativeGenerationRequest;
  readonly prompt: PromptContract;
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
