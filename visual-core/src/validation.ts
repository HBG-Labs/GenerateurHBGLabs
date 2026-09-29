import { VisualPlanSchema } from './contracts.ts';
import type { VisualDiagnostic, VisualPlan } from './contracts.ts';
import { DEFAULT_VISUAL_LIMITS } from './limits.ts';
import type { VisualEngineLimits } from './limits.ts';

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function inspect(value: unknown, path: string, depth: number, diagnostics: VisualDiagnostic[]): void {
  if (depth > 48) {
    diagnostics.push({ code: 'visual.security.depth_exceeded', severity: 'error', path, message: 'Profondeur maximale dépassée.', suggested_action: 'Réduire l’imbrication du document.' });
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) inspect(value[index], `${path}[${index}]`, depth + 1, diagnostics);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(key)) diagnostics.push({ code: 'visual.security.prototype_key', severity: 'error', path: `${path}.${key}`, message: `Propriété interdite : ${key}.`, suggested_action: 'Supprimer la propriété dangereuse.' });
      inspect(child, `${path}.${key}`, depth + 1, diagnostics);
    }
  }
}
export type VisualValidationResult =
  | { readonly ok: true; readonly value: VisualPlan; readonly diagnostics: readonly VisualDiagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly VisualDiagnostic[] };

export function validateVisualPlan(input: unknown, limits: VisualEngineLimits = DEFAULT_VISUAL_LIMITS): VisualValidationResult {
  const diagnostics: VisualDiagnostic[] = [];
  inspect(input, '$', 0, diagnostics);
  let encoded: string;
  try {
    encoded = JSON.stringify(input);
  } catch {
    diagnostics.push({ code: 'visual.security.cyclic_input', severity: 'error', path: '$', message: 'Document cyclique refusé.', suggested_action: 'Fournir un objet JSON acyclique.' });
    return { ok: false, diagnostics };
  }
  if (encoded.length > limits.max_json_bytes) diagnostics.push({
    code: 'visual.limit.json_bytes', severity: 'error', path: '$', message: `Payload ${encoded.length} octets > ${limits.max_json_bytes}.`, suggested_action: 'Réduire le VisualPlan.',
  });
  const parsed = VisualPlanSchema.safeParse(input);
  if (!parsed.success) {
    diagnostics.push(...parsed.error.issues.map((issue): VisualDiagnostic => ({
      code: 'visual.schema.invalid', severity: 'error', path: issue.path.length === 0 ? '$' : `$.${issue.path.join('.')}`,
      message: issue.message, suggested_action: 'Corriger le document selon VisualPlan 0.1.0.',
    })));
  }
  if (!parsed.success || diagnostics.some((entry) => entry.severity === 'error')) return { ok: false, diagnostics };
  return { ok: true, value: parsed.data, diagnostics };
}
