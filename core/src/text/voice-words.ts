export interface VoiceWord {
  /** Index du mot dans le segment (séparation par espaces). */
  index: number;
  raw: string;
  /** Minuscules, sans diacritiques ni ponctuation de bord. */
  normalized: string;
  /** Partie après une élision : « l'administratif » → « administratif ». */
  core: string;
}

const APOSTROPHES = /['’]/;

export function normalizeWord(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

export function voiceWords(text: string): VoiceWord[] {
  return text
    .split(/\s+/)
    .filter((raw) => raw.length > 0)
    .map((raw, index) => {
      const normalized = normalizeWord(raw);
      const parts = raw.split(APOSTROPHES);
      const core = normalizeWord(parts[parts.length - 1] ?? raw);
      return { index, raw, normalized, core };
    });
}

/** Indices des mots correspondant à `match`, dans l'ordre du texte. */
export function findWordMatches(text: string, match: string): number[] {
  const target = normalizeWord(match);
  if (!target) return [];
  return voiceWords(text)
    .filter((word) => word.normalized === target || word.core === target)
    .map((word) => word.index);
}
