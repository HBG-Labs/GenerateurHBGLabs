import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WORKSPACE } from './support.ts';

const productionFiles = [
  'visual-core/src/canonical.ts', 'visual-core/src/contracts.ts', 'visual-core/src/diversity.ts', 'visual-core/src/limits.ts',
  'visual-core/src/preflight.ts', 'visual-core/src/registry.ts', 'visual-core/src/stable-id.ts', 'visual-core/src/validation.ts',
  'visual-core/src/versioning.ts', 'visual-compiler/src/compiler.ts', 'visual-compiler/src/contracts.ts', 'visual-compiler/src/planner.ts',
].map((file) => path.join(WORKSPACE, file));

const source = productionFiles.map((file) => readFileSync(file, 'utf8')).join('\n');

describe('P3.1 — contamination et sécurité statique', () => {
  it('ne contient aucune marque, campagne, sujet de fixture ou benchmark', () => {
    const normalized = source.toLocaleLowerCase('en-US');
    for (const forbidden of ['rezo360', 'hbg labs', 'tiktok', 'instagram', 'dinosaur', 'ciel bleu', 'will taylor', 'denis gimaev', 'showreel']) {
      expect(normalized).not.toContain(forbidden);
    }
  });

  it('ne dépend ni de React/Remotion/Blender/provider ni d’un client réseau', () => {
    expect(source).not.toMatch(/from\s+['"](?:react|react-dom|remotion|@remotion\/)/u);
    expect(source).not.toMatch(/from\s+['"](?:node:)?(?:http|https|net|tls|dns|child_process)['"]/u);
    expect(source).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket|eval|Function)\s*\(/u);
    expect(source).not.toMatch(/\b(?:openai|anthropic|gemini|blender|cuda|nvidia|rocm)\b/iu);
  });
});
