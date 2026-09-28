import { readFileSync } from 'node:fs';
import path from 'node:path';

import { formatIssues, loadBrandFile, loadStyleFile, resolveStyle } from '@motion-engine/core';
import type { ResolvedStyle, ResolveStyleInput } from '@motion-engine/core';

export const WORKSPACE = path.resolve(import.meta.dirname, '..');
export const CORE = path.join(WORKSPACE, 'core');
export const CREATIVE_CORE = path.join(WORKSPACE, 'creative-core');
export const EXAMPLES = path.join(WORKSPACE, 'examples');
export const FONT_LIBRARY = { libraryRoot: path.join(WORKSPACE, 'packs', 'fonts') };

export function readJson(relative: string): Record<string, any> {
  return JSON.parse(readFileSync(path.join(WORKSPACE, relative), 'utf8')) as Record<string, any>;
}

export function mustResolve(input: ResolveStyleInput): ResolvedStyle {
  const result = resolveStyle(input);
  if (!result.ok) throw new Error(formatIssues(result.issues));
  return result.value;
}

export const loadRezoBrand = () => loadBrandFile(path.join(EXAMPLES, 'rezo360', 'brand.json'), FONT_LIBRARY);
export const loadNocturne = () => loadStyleFile(path.join(EXAMPLES, 'control_nocturne', 'style.json'), FONT_LIBRARY);
export const loadCoreFixtureStyle = (id: 'fixture_ink' | 'fixture_signal') =>
  loadStyleFile(path.join(CORE, 'test-fixtures', 'profiles', `${id}.style.json`), {
    libraryRoot: path.join(CORE, 'test-fixtures', 'fonts'),
  });
