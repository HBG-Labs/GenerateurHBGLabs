import type { CreativeDiagnostic } from './contracts/diagnostics.ts';
import type { CreativeLimits } from './limits.ts';
import { DEFAULT_CREATIVE_LIMITS } from './limits.ts';

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_DIAGNOSTICS = 64;

export interface InputInspection {
  readonly diagnostics: CreativeDiagnostic[];
  readonly json_bytes: number | null;
  readonly nodes_visited: number;
  readonly max_depth_seen: number;
}

export function inspectCreativeInput(
  input: unknown,
  limits: CreativeLimits = DEFAULT_CREATIVE_LIMITS,
): InputInspection {
  const diagnostics: CreativeDiagnostic[] = [];
  const active = new WeakSet<object>();
  let nodesVisited = 0;
  let maxDepthSeen = 0;
  let traversalStopped = false;

  const add = (diagnostic: CreativeDiagnostic) => {
    if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push(diagnostic);
  };

  const visit = (value: unknown, path: string, depth: number): void => {
    if (traversalStopped) return;
    nodesVisited += 1;
    maxDepthSeen = Math.max(maxDepthSeen, depth);
    if (nodesVisited > limits.max_nodes) {
      traversalStopped = true;
      add({
        code: 'security.node_limit_exceeded',
        severity: 'error',
        path,
        message: `Le document dépasse ${limits.max_nodes} nœuds inspectables.`,
        context: { limit: limits.max_nodes },
        suggested_action: 'Réduire la structure du CreativePlan avant validation.',
      });
      return;
    }
    if (depth > limits.max_depth) {
      add({
        code: 'security.depth_exceeded',
        severity: 'error',
        path,
        message: `La profondeur maximale autorisée est ${limits.max_depth}.`,
        context: { limit: limits.max_depth, actual: depth },
        suggested_action: 'Aplatir les données créatives imbriquées.',
      });
      return;
    }
    if (typeof value === 'string' && [...value].length > limits.max_string_characters) {
      add({
        code: 'security.string_too_long',
        severity: 'error',
        path,
        message: `Une chaîne dépasse ${limits.max_string_characters} caractères.`,
        context: { limit: limits.max_string_characters, actual: [...value].length },
        suggested_action: 'Réduire la chaîne avant validation.',
      });
      return;
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      add({
        code: 'security.non_finite_number',
        severity: 'error',
        path,
        message: 'Les nombres non finis sont interdits.',
        suggested_action: 'Utiliser un nombre JSON fini.',
      });
      return;
    }
    if (value === null || typeof value !== 'object') return;
    if (active.has(value)) {
      add({
        code: 'security.cyclic_reference',
        severity: 'error',
        path,
        message: 'Une référence cyclique a été détectée dans cette entrée non fiable.',
        suggested_action: 'Fournir un document JSON acyclique.',
      });
      return;
    }
    const prototype = Object.getPrototypeOf(value) as object | null;
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
      add({
        code: 'security.invalid_object_prototype',
        severity: 'error',
        path,
        message: 'Seuls les objets JSON simples sont acceptés.',
        suggested_action: 'Convertir l’entrée en données JSON simples.',
      });
      return;
    }
    active.add(value);
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}[${index}]`, depth + 1));
    } else {
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        if (FORBIDDEN_KEYS.has(key)) {
          add({
            code: 'security.forbidden_property',
            severity: 'error',
            path: `${path}.${key}`,
            message: `La propriété « ${key} » est interdite.`,
            context: { property: key },
            suggested_action: 'Supprimer cette propriété du document.',
          });
          continue;
        }
        visit(entry, `${path}.${key}`, depth + 1);
      }
    }
    active.delete(value);
  };

  visit(input, '$', 0);
  let jsonBytes: number | null = null;
  if (!diagnostics.some((issue) => issue.code === 'security.cyclic_reference')) {
    try {
      const serialized = JSON.stringify(input);
      if (serialized !== undefined) jsonBytes = Buffer.byteLength(serialized, 'utf8');
    } catch {
      // La validation structurelle produira le diagnostic restant.
    }
  }
  if (jsonBytes !== null && jsonBytes > limits.max_json_bytes) {
    add({
      code: 'security.payload_too_large',
      severity: 'error',
      path: '$',
      message: `Le document JSON dépasse ${limits.max_json_bytes} octets.`,
      context: { limit: limits.max_json_bytes, actual: jsonBytes },
      suggested_action: 'Réduire le CreativePlan avant validation.',
    });
  }
  return { diagnostics, json_bytes: jsonBytes, nodes_visited: nodesVisited, max_depth_seen: maxDepthSeen };
}
