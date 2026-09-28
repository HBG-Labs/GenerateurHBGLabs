import type { ResolvedStyle } from '../contracts/resolved-style.ts';
import type { QualityIssue } from '../contracts/visual.ts';

export interface StyleVersionBaseline {
  id: string;
  version: string;
  sha256: string;
}

export class StyleVersionPolicyError extends Error {
  readonly diagnostics: readonly QualityIssue[];
  constructor(diagnostics: readonly QualityIssue[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join('; '));
    this.name = 'StyleVersionPolicyError';
    this.diagnostics = diagnostics;
  }
}

/** Hash detects content; version communicates intent. Neither replaces the other. */
export function assertStyleVersionPolicy(style: ResolvedStyle, baseline: StyleVersionBaseline | null): void {
  if (!baseline) return;
  const current = style.sources.style;
  if (current.id === baseline.id && current.version === baseline.version && current.sha256 !== baseline.sha256) {
    throw new StyleVersionPolicyError([{
      code: 'style.version_not_bumped', severity: 'error', path: 'resolved_style.sources.style',
      message: `${current.id}@${current.version} a changé de contenu sans changement de version`,
      context: { previous_sha256: baseline.sha256, current_sha256: current.sha256 },
      suggested_action: 'Incrémenter la version du style et conserver son nouveau hash.',
    }]);
  }
}
