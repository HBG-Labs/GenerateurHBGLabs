import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WORKSPACE } from './support.ts';

const runtimeFiles = [
  'coherence.ts', 'context.ts', 'contracts.ts', 'fixture-director.ts', 'index.ts', 'preflight.ts',
  'provider-context.ts', 'registry.ts', 'resolver.ts', 'versioning.ts',
].map((file) => path.join(WORKSPACE, 'visual-director-core', 'src', file));
const source = runtimeFiles.map((file) => readFileSync(file, 'utf8')).join('\n').toLocaleLowerCase('en-US');

describe('P3.3A — contamination et sécurité statique', () => {
  it('ne contient aucune référence benchmark, marque, campagne ou sujet de fixture', () => {
    for (const forbidden of ['will taylor', 'denis gimaev', 'fiesta latina', 'rezo360', 'hbg labs', 'ciel bleu', 'blue sky', 'fintech reference', 'youtu.be', 'youtube.com', 'vimeo.com']) expect(source).not.toContain(forbidden);
  });

  it('ne dépend ni du renderer, provider, réseau, Blender ou exécution dynamique', () => {
    expect(source).not.toMatch(/from\s+['"](?:react|react-dom|remotion|@remotion\/|@motion-engine\/renderer)/u);
    expect(source).not.toMatch(/from\s+['"](?:node:)?(?:http|https|net|tls|dns|child_process)['"]/u);
    expect(source).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket|eval|Function)\s*\(/u);
    expect(source).not.toMatch(/\b(?:openai|astra|luna|blender|cuda|nvidia|rocm)\b/iu);
  });

  it('ne fait jamais entrer les documents P3.2.5 dans le runtime', () => {
    expect(source).not.toContain('references/motion');
    expect(source).not.toContain('motion-benchmark-catalog');
  });
});
