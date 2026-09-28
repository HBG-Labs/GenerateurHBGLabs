import { canonicalCreativeJson, creativeSha256 } from './canonical.ts';
import { StableIdSchema } from './contracts/common.ts';

/** Dérivation optionnelle et pure pour les futurs planificateurs. */
export function deriveCreativeId(namespace: string, semanticKey: unknown): string {
  const normalized = namespace.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  const safeNamespace = /^[a-z]/.test(normalized) ? normalized.slice(0, 48) : `id_${normalized}`.slice(0, 48);
  const result = `${safeNamespace}_${creativeSha256(canonicalCreativeJson(semanticKey)).slice(0, 14)}`;
  return StableIdSchema.parse(result);
}
