import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WORKSPACE } from './support.ts';

const productionFiles = [
  'compiler.ts', 'contracts.ts', 'index.ts', 'profile.ts', 'resolution.ts',
].map((file) => path.join(WORKSPACE, 'creative-compiler', 'src', file));

describe('P2.3 — contamination', () => {
  it('ne contient aucune marque, campagne ou provider dans le bridge de production', () => {
    const source = productionFiles.map((file) => readFileSync(file, 'utf8')).join('\n').toLowerCase();
    for (const forbidden of ['rezo360', 'hbg labs', 'openai', 'anthropic', 'claude', 'gemini', 'hugging face']) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('ne dépend ni de React, ni de Remotion, ni d’un client réseau', () => {
    const source = productionFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(source).not.toMatch(/from\s+['"](?:react|react-dom|remotion|@remotion\/)/u);
    expect(source).not.toMatch(/from\s+['"](?:node:)?(?:http|https|net|tls|dns)['"]/u);
    expect(source).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/u);
  });
});
