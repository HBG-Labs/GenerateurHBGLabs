import { createHash } from 'node:crypto';

/**
 * Même contrat canonique que P1, conservé localement pour ne pas créer une
 * dépendance Creative Core → Motion Core : clés triées, `undefined` omis,
 * tableaux ordonnés, Unicode préservé et nombres non finis refusés.
 */
export function canonicalCreativeJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return Object.fromEntries(entries.map(([key, entry]) => [key, sortDeep(entry)]));
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(`Nombre non fini refusé dans un CreativePlan canonique : ${String(value)}`);
  }
  return value;
}

export function creativeSha256(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hashCreativeDocument(value: unknown): string {
  return creativeSha256(canonicalCreativeJson(value));
}
