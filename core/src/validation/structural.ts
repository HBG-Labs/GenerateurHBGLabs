import type { z } from 'zod';

import type { ValidationIssue } from './issues.ts';

export function formatPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const segment of path) {
    if (typeof segment === 'number') out += `[${segment}]`;
    else out += out ? `.${String(segment)}` : String(segment);
  }
  return out;
}

/** Validation structurelle : le document respecte-t-il exactement son schéma ? */
export function parseStructure<T>(
  schema: z.ZodType<T>,
  input: unknown,
): { ok: true; value: T } | { ok: false; issues: ValidationIssue[] } {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      code: `schema.${issue.code}`,
      path: formatPath(issue.path),
      message: issue.message,
      severity: 'error' as const,
    })),
  };
}
