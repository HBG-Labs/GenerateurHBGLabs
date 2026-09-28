import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CORE, WORKSPACE } from './support.ts';

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const full = path.join(root, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe('frontières Core / renderer-remotion', () => {
  it('le Core ne dépend ni de React, ni de Remotion, ni du renderer', () => {
    const imports = sourceFiles(path.join(CORE, 'src'))
      .map((file) => readFileSync(file, 'utf8'))
      .flatMap((source) => [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]));
    expect(imports.filter((value) => value && /(^react$|remotion|renderer-remotion)/i.test(value))).toEqual([]);
  });

  it('seul renderer-remotion dépend de Remotion et il dépend du Core', () => {
    const corePackage = JSON.parse(readFileSync(path.join(CORE, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
    const rendererPackage = JSON.parse(readFileSync(path.join(WORKSPACE, 'renderer-remotion', 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(corePackage.dependencies?.['remotion']).toBeUndefined();
    expect(corePackage.dependencies?.['@motion-engine/renderer-remotion']).toBeUndefined();
    expect(rendererPackage.dependencies?.['@motion-engine/core']).toBe('0.3.0');
    expect(rendererPackage.dependencies?.['remotion']).toBe('4.0.529');
  });
});
