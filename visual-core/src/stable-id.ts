import { hashVisualDocument } from './canonical.ts';

export function visualStableId(prefix: string, value: unknown): string {
  const safe = prefix.toLowerCase().replace(/[^a-z0-9_]/gu, '_').replace(/^[^a-z]+/u, '').slice(0, 46) || 'visual';
  return `${safe}_${hashVisualDocument(value).slice(0, 16)}`;
}
