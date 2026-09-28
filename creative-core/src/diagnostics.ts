import type { CreativeDiagnostic, CreativePreflightReport } from './contracts/diagnostics.ts';

const severityOrder = { error: 0, warning: 1, info: 2 } as const;

export function sortCreativeDiagnostics(diagnostics: readonly CreativeDiagnostic[]): CreativeDiagnostic[] {
  return [...diagnostics].sort((left, right) => {
    return (
      severityOrder[left.severity] - severityOrder[right.severity] ||
      left.path.localeCompare(right.path, 'en') ||
      left.code.localeCompare(right.code, 'en') ||
      (left.node_id ?? '').localeCompare(right.node_id ?? '', 'en') ||
      left.message.localeCompare(right.message, 'en')
    );
  });
}

export function summarizeDiagnostics(diagnostics: readonly CreativeDiagnostic[]) {
  return {
    errors: diagnostics.filter((issue) => issue.severity === 'error').length,
    warnings: diagnostics.filter((issue) => issue.severity === 'warning').length,
    infos: diagnostics.filter((issue) => issue.severity === 'info').length,
  };
}

export function reportStatus(diagnostics: readonly CreativeDiagnostic[]): CreativePreflightReport['status'] {
  if (diagnostics.some((issue) => issue.severity === 'error')) return 'fail';
  if (diagnostics.some((issue) => issue.severity === 'warning')) return 'warn';
  return 'pass';
}
