import { inspectCreativeInput, type CreativeDiagnostic } from '@motion-engine/creative-core';

import type { GatewayLimits } from './limits.ts';
import { DEFAULT_GATEWAY_LIMITS } from './limits.ts';

const SECRET_KEY = /(?:api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|password|client[_-]?secret)/iu;
const SECRET_VALUE = /(?:\bsk-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+\/-]{8,}|\b(?:api[_-]?key|token|secret)\s*[:=]\s*[^\s,;]{6,})/giu;

export function redactSensitiveText(value: string): string {
  return value.replace(SECRET_VALUE, '[REDACTED]');
}

export function inspectGatewayInput(
  input: unknown,
  kind: 'request' | 'provider_response' | 'snapshot',
  limits: GatewayLimits = DEFAULT_GATEWAY_LIMITS,
): CreativeDiagnostic[] {
  const maximumBytes = kind === 'request' ? limits.max_request_json_bytes : limits.max_response_json_bytes;
  const inspection = inspectCreativeInput(input, {
    max_json_bytes: maximumBytes,
    max_depth: limits.max_depth,
    max_nodes: limits.max_nodes,
    max_string_characters: limits.max_string_characters,
    max_scenes: 128,
    max_duration_seconds: 180,
    max_script_characters: limits.max_string_characters * 2,
    max_on_screen_characters_per_scene: limits.max_string_characters,
    max_asset_intents: limits.max_asset_descriptions,
    max_elements_per_scene: limits.max_content_resolutions,
    max_content_items_per_scene: limits.max_content_resolutions,
    max_narrative_sections: 128,
  });
  const diagnostics = inspection.diagnostics.map((entry): CreativeDiagnostic => ({
    ...entry,
    code: entry.code.replace(/^security\./u, `gateway.security.${kind}.`),
    message: redactSensitiveText(entry.message.replace('CreativePlan', kind)),
  }));
  const active = new WeakSet<object>();
  const visit = (value: unknown, path: string): void => {
    if (value === null || typeof value !== 'object') {
      if (typeof value === 'string' && SECRET_VALUE.test(value)) {
        diagnostics.push({
          code: 'gateway.security.secret_detected', severity: 'error', path,
          message: 'Une valeur ressemblant à un secret est interdite dans ce contrat.',
          suggested_action: 'Retirer le secret avant validation ou snapshot.',
        });
      }
      SECRET_VALUE.lastIndex = 0;
      return;
    }
    if (active.has(value)) return;
    active.add(value);
    if (Array.isArray(value)) value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
    else for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(key)) {
        diagnostics.push({
          code: 'gateway.security.secret_field', severity: 'error', path: `${path}.${key}`,
          message: 'Un champ susceptible de contenir un secret est interdit.',
          context: { field: key }, suggested_action: 'Conserver les credentials hors du Gateway et de ses snapshots.',
        });
      } else visit(entry, `${path}.${key}`);
    }
    active.delete(value);
  };
  visit(input, '$');
  return diagnostics.slice(0, 64);
}
