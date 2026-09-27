export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  code: string;
  /** Chemin lisible dans le document : `scenes[0].layers[1].behaviors[0].at`. */
  path: string;
  message: string;
  severity: IssueSeverity;
}

export type ValidationResult<T> =
  | { ok: true; value: T; warnings: ValidationIssue[] }
  | { ok: false; issues: ValidationIssue[] };

export function hasErrors(issues: readonly ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}

export function formatIssues(issues: readonly ValidationIssue[]): string {
  return issues.map((i) => `[${i.severity}] ${i.code} @ ${i.path || '(racine)'} : ${i.message}`).join('\n');
}

export class ValidationFailure extends Error {
  readonly issues: ValidationIssue[];
  constructor(what: string, issues: ValidationIssue[]) {
    super(`${what} invalide :\n${formatIssues(issues)}`);
    this.name = 'ValidationFailure';
    this.issues = issues;
  }
}

export class IssueCollector {
  readonly issues: ValidationIssue[] = [];
  error(code: string, path: string, message: string): void {
    this.issues.push({ code, path, message, severity: 'error' });
  }
  warn(code: string, path: string, message: string): void {
    this.issues.push({ code, path, message, severity: 'warning' });
  }
}
