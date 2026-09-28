import { performance } from 'node:perf_hooks';

import {
  GatewayProviderError,
  type CreativeProvider,
  type ProviderInvocation,
  type ProviderMetadata,
  type ProviderResponse,
} from '@motion-engine/creative-gateway';

import {
  OPENAI_PROVIDER_ADAPTER_VERSION,
  createOpenAIProviderFingerprint,
  resolveOpenAIProviderConfig,
  type OpenAIProviderConfig,
  type OpenAIProviderFingerprint,
  type OpenAIProviderLogger,
} from './contracts.ts';
import { createOpenAIPrompt } from './prompts.ts';
import {
  OpenAIPlanningOutputSchema,
  OpenAIResolutionOutputSchema,
  createOpenAIPlanningOutputSchema,
  createOpenAIResolutionOutputSchema,
  createOpenAIResolutionRepairPatchSchema,
  planningWireToGateway,
  resolutionRepairWireToGateway,
  resolutionWireToGateway,
} from './schemas.ts';
import { OpenAISdkTransport, type OpenAIStructuredTransport } from './transport.ts';

export interface OpenAICreativeProviderOptions {
  readonly config?: Partial<OpenAIProviderConfig>;
  readonly transport: OpenAIStructuredTransport;
  readonly logger?: OpenAIProviderLogger;
}

export class OpenAICreativeProvider implements CreativeProvider {
  readonly metadata: ProviderMetadata;
  readonly config: OpenAIProviderConfig;
  readonly fingerprint: OpenAIProviderFingerprint;
  readonly #transport: OpenAIStructuredTransport;
  readonly #logger: OpenAIProviderLogger | undefined;
  #calls = 0;

  constructor(options: OpenAICreativeProviderOptions) {
    this.config = resolveOpenAIProviderConfig(options.config);
    this.#transport = options.transport;
    this.#logger = options.logger;
    this.fingerprint = createOpenAIProviderFingerprint(this.config);
    this.metadata = {
      provider_id: 'openai',
      adapter_version: OPENAI_PROVIDER_ADAPTER_VERSION,
      capabilities: ['structured_output', 'json_schema', 'text_generation'],
      model_family: this.config.model,
      deterministic_test: false,
    };
  }

  get callCount(): number {
    return this.#calls;
  }

  async generate(invocation: ProviderInvocation): Promise<ProviderResponse> {
    if (this.#calls >= this.config.max_provider_calls) {
      throw new GatewayProviderError('provider_call_limit_exceeded', 'Le budget maximal d’appels provider est épuisé.');
    }
    this.#calls += 1;
    const started = performance.now();
    const prompt = createOpenAIPrompt(invocation);
    const planningSchema = invocation.planning_context
      ? createOpenAIPlanningOutputSchema(invocation.planning_context.allowed_archetype_ids)
      : OpenAIPlanningOutputSchema;
    const resolutionSchema = invocation.resolution_context
      ? createOpenAIResolutionOutputSchema(invocation.resolution_context.content_slots.flatMap((slot) => slot.allowed_scene_ids))
      : OpenAIResolutionOutputSchema;
    const repairSchema = invocation.resolution_repair_request
      ? createOpenAIResolutionRepairPatchSchema(invocation.resolution_repair_request)
      : null;
    const selectedSchema = invocation.stage === 'planning'
      ? planningSchema
      : repairSchema ?? resolutionSchema;
    try {
      const response = await this.#transport.generate({
        model: this.config.model,
        instructions: prompt.instructions,
        input: prompt.input,
        schema_name: invocation.stage === 'planning'
          ? 'creative_planning_output'
          : repairSchema ? 'creative_resolution_repair_patch' : 'creative_resolution_output',
        schema: selectedSchema,
        reasoning_effort: this.config.reasoning_effort,
        max_output_tokens: this.config.max_output_tokens,
        safety_identifier: invocation.request.idempotency_key,
        signal: invocation.signal,
      });
      let output: unknown = response.output;
      if (invocation.stage === 'planning') {
        const wire = planningSchema.safeParse(response.output);
        if (wire.success) output = planningWireToGateway(wire.data);
      } else if (repairSchema) {
        const wire = repairSchema.safeParse(response.output);
        if (wire.success) output = resolutionRepairWireToGateway(wire.data);
      } else {
        const wire = resolutionSchema.safeParse(response.output);
        if (wire.success) output = resolutionWireToGateway(wire.data);
      }
      this.#logger?.({
        request_id: invocation.request.request_id,
        stage: invocation.stage,
        provider: 'openai',
        model: this.config.model,
        attempt: invocation.attempt,
        latency_ms: performance.now() - started,
        result: 'accepted',
      });
      return { output, usage: response.usage };
    } catch (error) {
      const failure = error instanceof GatewayProviderError ? error : new GatewayProviderError('provider_unavailable', 'Le provider est indisponible.');
      this.#logger?.({
        request_id: invocation.request.request_id,
        stage: invocation.stage,
        provider: 'openai',
        model: this.config.model,
        attempt: invocation.attempt,
        latency_ms: performance.now() - started,
        result: 'failed',
        failure_kind: failure.kind,
      });
      throw failure;
    }
  }
}

export interface OpenAIEnvironmentOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly config?: Partial<OpenAIProviderConfig>;
  readonly logger?: OpenAIProviderLogger;
}

export function createOpenAIProviderFromEnvironment(options: OpenAIEnvironmentOptions = {}): OpenAICreativeProvider {
  const env = options.env ?? process.env;
  const apiKey = env['OPENAI_API_KEY']?.trim();
  if (!apiKey) {
    throw new GatewayProviderError('provider_auth_missing', 'OPENAI_API_KEY est absent de l’environnement hôte.');
  }
  const config = resolveOpenAIProviderConfig({
    ...options.config,
    ...(env['OPENAI_MODEL'] ? { model: env['OPENAI_MODEL'] } : {}),
  });
  return new OpenAICreativeProvider({
    config,
    transport: new OpenAISdkTransport(apiKey, config),
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  });
}
