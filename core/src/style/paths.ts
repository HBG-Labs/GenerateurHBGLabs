type Plain = Record<string, unknown>;

export function isPlainObject(value: unknown): value is Plain {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Découpe un chemin de style. Les clés de jetons contiennent elles-mêmes des
 * points (`palette.surface.primary`) : la résolution essaie donc la clé la
 * plus longue à chaque niveau.
 */
export function getAtPath(root: unknown, path: string): { found: boolean; value: unknown } {
  const parts = path.split('.');
  let node: unknown = root;
  let i = 0;
  while (i < parts.length) {
    if (!isPlainObject(node)) return { found: false, value: undefined };
    let matched = false;
    for (let j = parts.length; j > i; j--) {
      const key = parts.slice(i, j).join('.');
      if (Object.prototype.hasOwnProperty.call(node, key)) {
        node = node[key];
        i = j;
        matched = true;
        break;
      }
    }
    if (!matched) return { found: false, value: undefined };
  }
  return { found: true, value: node };
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

/** Fusion profonde : les objets se fusionnent, tout le reste (tableaux compris) remplace. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return structuredClone(patch) as T;
  const out: Plain = { ...(structuredClone(base) as Plain) };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? deepMerge(out[key], value) : structuredClone(value);
  }
  return out as T;
}

/** Chemins des feuilles d'un patch (les tableaux sont des feuilles). */
export function leafPaths(patch: unknown, prefix = ''): string[] {
  if (!isPlainObject(patch) || Object.keys(patch).length === 0) return prefix ? [prefix] : [];
  return Object.entries(patch).flatMap(([key, value]) => leafPaths(value, prefix ? `${prefix}.${key}` : key));
}

/** Deux chemins se recouvrent si l'un est égal à l'autre ou le contient. */
export function pathsOverlap(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);
}
