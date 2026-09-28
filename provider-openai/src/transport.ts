import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
  AuthenticationError,
  RateLimitError,
} from 'openai';
import { ContentFilterFinishReasonError, LengthFinishReasonError } from 'openai/error';
import { zodTextFormat } from 'openai/helpers/zod';
import type { z } from 'zod';

import { GatewayProviderError, type ProviderUsage } from '@motion-engine/creative-gateway';

import type { OpenAIProviderConfig } from './contracts.ts';

export interface OpenAITransportRequest {
  readonly model: string;
  readonly instructions: string;
  readonly input: string;
  readonly schema_name: string;
  readonly schema: z.ZodType;
  readonly reasoning_effort: OpenAIProviderConfig['reasoning_effort'];
  readonly max_output_tokens: number;
  readonly safety_identifier: string;
  readonly signal: AbortSignal;
}

export interface OpenAITransportResponse {
  readonly output: unknown;
  readonly usage: ProviderUsage;
  readonly response_id: string;
  readonly model: string;
}

export interface OpenAIStructuredTransport {
  generate(request: OpenAITransportRequest): Promise<OpenAITransportResponse>;
}

function statusOf(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('status' in error)) return undefined;
  return typeof error.status === 'number' ? error.status : undefined;
}

export function mapOpenAIError(error: unknown): GatewayProviderError {
  if (error instanceof GatewayProviderError) return error;
  if (error instanceof APIUserAbortError || (error instanceof Error && error.name === 'AbortError')) {
    return new GatewayProviderError('cancelled', 'L’appel provider a été annulé.');
  }
  if (error instanceof AuthenticationError || statusOf(error) === 401 || statusOf(error) === 403) {
    return new GatewayProviderError('provider_auth_invalid', 'L’authentification du provider a été refusée.');
  }
  if (error instanceof RateLimitError || statusOf(error) === 429) {
    return new GatewayProviderError('provider_rate_limited', 'Le provider a refusé l’appel à cause de sa limite de débit.');
  }
  if (error instanceof APIConnectionTimeoutError) {
    return new GatewayProviderError('provider_timeout', 'Le transport provider a dépassé son timeout.');
  }
  if (error instanceof ContentFilterFinishReasonError) {
    return new GatewayProviderError('provider_safety_refusal', 'Le provider a refusé la génération pour des raisons de sûreté.');
  }
  if (error instanceof LengthFinishReasonError) {
    return new GatewayProviderError('provider_output_incomplete', 'La sortie provider est incomplète faute de budget de sortie.');
  }
  if (error instanceof APIConnectionError) {
    return new GatewayProviderError('provider_network_error', 'Le provider est inaccessible au niveau transport.');
  }
  return new GatewayProviderError('provider_unavailable', 'Le provider est indisponible.');
}

function refusalText(response: { output: readonly unknown[] }): string | null {
  for (const item of response.output) {
    if (!item || typeof item !== 'object') continue;
    const itemRecord = item as Record<string, unknown>;
    if (itemRecord['type'] !== 'message' || !Array.isArray(itemRecord['content'])) continue;
    for (const content of itemRecord['content'] as unknown[]) {
      if (!content || typeof content !== 'object') continue;
      const contentRecord = content as Record<string, unknown>;
      if (contentRecord['type'] === 'refusal') return 'refused';
    }
  }
  return null;
}

export class OpenAISdkTransport implements OpenAIStructuredTransport {
  readonly #client: OpenAI;

  constructor(apiKey: string, config: OpenAIProviderConfig) {
    this.#client = new OpenAI({
      apiKey,
      maxRetries: config.max_transport_retries,
      timeout: config.timeout_ms,
    });
  }

  async generate(request: OpenAITransportRequest): Promise<OpenAITransportResponse> {
    try {
      const response = await this.#client.responses.parse({
        model: request.model,
        instructions: request.instructions,
        input: request.input,
        reasoning: { effort: request.reasoning_effort },
        max_output_tokens: request.max_output_tokens,
        safety_identifier: request.safety_identifier,
        store: false,
        text: { format: zodTextFormat(request.schema, request.schema_name) },
      }, { signal: request.signal });
      if (refusalText(response) !== null) {
        throw new GatewayProviderError('provider_safety_refusal', 'Le provider a explicitement refusé la génération.');
      }
      if (response.status !== undefined && response.status !== 'completed') {
        const kind = response.status === 'cancelled' ? 'cancelled' : 'provider_output_incomplete';
        throw new GatewayProviderError(kind, 'Le provider n’a pas produit une réponse complète.');
      }
      if (response.output_parsed === null) {
        throw new GatewayProviderError('provider_malformed_response', 'Le provider n’a produit aucune sortie structurée exploitable.');
      }
      return {
        output: response.output_parsed,
        response_id: response.id,
        model: response.model,
        usage: {
          input_units: response.usage?.input_tokens ?? null,
          output_units: response.usage?.output_tokens ?? null,
          cached_units: response.usage?.input_tokens_details.cached_tokens ?? null,
          request_count: 1,
          provider_reported_cost: null,
        },
      };
    } catch (error) {
      throw mapOpenAIError(error);
    }
  }
}
