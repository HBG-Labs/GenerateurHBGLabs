import type { CreativeIntent } from '../contracts/creative-intent.ts';
import { findWordMatches } from '../text/voice-words.ts';
import { IssueCollector } from './issues.ts';
import type { ValidationIssue } from './issues.ts';

/** Minuscules, sans diacritiques, ponctuation réduite à des espaces. */
function flatten(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function validateIntentSemantics(intent: CreativeIntent): ValidationIssue[] {
  const c = new IssueCollector();
  const ids = new Set<string>();
  intent.beats.forEach((beat, i) => {
    const path = `beats[${i}]`;
    if (ids.has(beat.id)) c.error('id.duplicate', path, `temps « ${beat.id} » en double`);
    ids.add(beat.id);
    beat.emphasis?.forEach((word, k) => {
      if (findWordMatches(beat.voice, word).length === 0) {
        c.error('intent.emphasis_missing', `${path}.emphasis[${k}]`, `« ${word} » absent de la voix`);
      }
    });
    const accent = beat.on_screen?.accent;
    if (accent !== undefined) {
      const screen = flatten(beat.on_screen?.lines.join(' ') ?? '');
      const target = flatten(accent);
      if (!target || !` ${screen} `.includes(` ${target} `)) {
        c.error('intent.accent_missing', `${path}.on_screen.accent`, `« ${accent} » absent du texte à l'écran`);
      }
    }
  });
  const range = intent.target_duration_s;
  if (range && range.min > range.max) {
    c.error('intent.duration_range', 'target_duration_s', 'durée minimale supérieure à la maximale');
  }
  return c.issues;
}
