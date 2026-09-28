import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WORKSPACE } from './support.ts';

function productionSources(root: string): string {
  const files = ['contracts.ts', 'prompts.ts', 'provider.ts', 'schemas.ts', 'transport.ts', 'index.ts'];
  return files.map((file) => readFileSync(path.join(WORKSPACE, root, 'src', file), 'utf8')).join('\n');
}

describe('P2.5 — frontière provider', () => {
  it('garde le SDK OpenAI hors des Core, Planner, Creative Compiler et Gateway', () => {
    const protectedPackages = ['core', 'creative-core', 'creative-compiler', 'creative-gateway'];
    for (const packageName of protectedPackages) {
      const packageJson = readFileSync(path.join(WORKSPACE, packageName, 'package.json'), 'utf8');
      expect(packageJson, packageName).not.toMatch(/"openai"\s*:/u);
    }
  });

  it('interdit au seul adapter provider de dépendre du renderer, de React ou de Remotion', () => {
    const source = productionSources('provider-openai');
    expect(source).not.toMatch(/@motion-engine\/(?:core|creative-compiler|renderer-remotion)/u);
    expect(source).not.toMatch(/from ['"](?:react|remotion|@remotion\/)/u);
    expect(source).not.toMatch(/node:(?:fs|child_process|vm)|\beval\s*\(|new Function/u);
  });

  it('ne contient aucun secret ou credential littéral', () => {
    const source = productionSources('provider-openai');
    expect(source).not.toMatch(/sk-[A-Za-z0-9_-]{12,}/u);
    expect(source).not.toMatch(/apiKey\s*:\s*['"][^'"]+['"]/u);
  });
});
