import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WORKSPACE } from './support.ts';

const productionFiles = [
  'contracts.ts', 'gateway.ts', 'index.ts', 'limits.ts', 'mapping.ts', 'provider.ts', 'request.ts', 'security.ts', 'snapshot.ts',
].map((file) => path.join(WORKSPACE, 'creative-gateway', 'src', file));

describe('P2.4 — contamination', () => {
  it('ne contient aucune marque, plateforme commerciale ou provider concret', () => {
    const source = productionFiles.map((file) => readFileSync(file, 'utf8')).join('\n').toLowerCase();
    for (const forbidden of ['rezo360', 'hbg labs', 'tiktok', 'instagram', 'openai', 'anthropic', 'claude', 'gemini', 'google ai', 'hugging face']) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('ne dépend ni du renderer, ni d’un SDK provider, ni d’un client réseau', () => {
    const source = productionFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(source).not.toMatch(/from\s+['"](?:react|react-dom|remotion|@remotion\/)/u);
    expect(source).not.toMatch(/from\s+['"](?:node:)?(?:http|https|net|tls|dns)['"]/u);
    expect(source).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/u);
  });
});
