import type { TokenNamespace } from '../contracts/common.ts';
import type { ResolvedStyle } from '../contracts/resolved-style.ts';

/** Table d'un espace de noms de jetons dans le style résolu. */
export function tokenTable(resolved: ResolvedStyle, namespace: TokenNamespace): Record<string, unknown> {
  const style = resolved.style;
  switch (namespace) {
    case 'color':
      return style.palette;
    case 'type':
      return style.typography.scale;
    case 'space':
      return style.space;
    case 'stroke':
      return style.strokes;
    case 'motif':
      return style.motifs;
    case 'ease':
      return style.motion_personality.easings;
    case 'logo':
      return resolved.identity.logos;
  }
}

export function splitToken(ref: string): { namespace: TokenNamespace; key: string } {
  const dot = ref.indexOf('.');
  return { namespace: ref.slice(0, dot) as TokenNamespace, key: ref.slice(dot + 1) };
}

export function hasToken(resolved: ResolvedStyle, ref: string): boolean {
  const { namespace, key } = splitToken(ref);
  return Object.prototype.hasOwnProperty.call(tokenTable(resolved, namespace), key);
}
