import type { StyleBinding } from '../contracts/motion-spec.ts';
import type { ResolvedStyle } from '../contracts/resolved-style.ts';

/** La spec a-t-elle été écrite pour ce style résolu ? */
export function bindingMatches(binding: StyleBinding, resolved: ResolvedStyle): boolean {
  const same = (ref: { id: string; version: string } | null) =>
    ref !== null && ref.id === binding.id && ref.version === binding.version;
  switch (binding.kind) {
    case 'style':
      return resolved.mode === 'creative' && same(resolved.sources.style);
    case 'brand':
      return resolved.mode === 'brand' && same(resolved.sources.brand);
    case 'series':
      return resolved.mode === 'series' && same(resolved.sources.series);
  }
}

export function describeResolved(resolved: ResolvedStyle): string {
  const source =
    resolved.mode === 'series'
      ? resolved.sources.series
      : resolved.mode === 'brand'
        ? resolved.sources.brand
        : resolved.sources.style;
  return `${resolved.mode}:${source?.id ?? '?'}@${source?.version ?? '?'}`;
}
