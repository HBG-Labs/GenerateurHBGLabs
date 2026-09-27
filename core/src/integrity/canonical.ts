import { createHash } from 'node:crypto';

/**
 * JSON canonique : clés triées récursivement, pas d'espace, `undefined`
 * omis. Deux objets de même contenu donnent la même chaîne, quel que soit
 * l'ordre d'insertion de leurs clés.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries.map(([k, v]) => [k, sortDeep(v)]));
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(`Nombre non fini refusé dans un document canonique : ${value}`);
  }
  return value;
}

export function sha256Hex(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hashDocument(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
