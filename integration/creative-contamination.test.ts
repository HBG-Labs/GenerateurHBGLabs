import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CREATIVE_CORE } from './support.ts';

const FORBIDDEN_BRANDS = ['REZO360', 'HBG Labs', 'TikTok', 'Instagram', 'OpenAI', 'Anthropic', 'Gemini'];
const FORBIDDEN_RUNTIME_PATTERNS = [
  /from\s+['"]node:https?['"]/u,
  /from\s+['"](?:axios|undici|node-fetch)['"]/u,
  /\bfetch\s*\(/u,
  /\beval\s*\(/u,
  /new\s+Function\s*\(/u,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|json)$/u.test(name) ? [full] : [];
  });
}

describe('contamination du Creative Core', () => {
  const productionFiles = [
    ...sourceFiles(path.join(CREATIVE_CORE, 'src')).filter((file) => !file.endsWith('.test.ts')),
    ...sourceFiles(path.join(CREATIVE_CORE, 'fixtures')),
  ];

  it('analyse un périmètre réel', () => {
    expect(productionFiles.length).toBeGreaterThan(10);
  });

  it('ne contient aucune marque, plateforme ou provider interdit', () => {
    const hits = productionFiles.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return FORBIDDEN_BRANDS.filter((term) => text.toLocaleLowerCase('en').includes(term.toLocaleLowerCase('en'))).map(
        (term) => `${path.relative(CREATIVE_CORE, file)}: ${term}`,
      );
    });
    expect(hits).toEqual([]);
  });

  it('ne contient aucun client réseau ni exécution dynamique', () => {
    const hits = productionFiles.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return FORBIDDEN_RUNTIME_PATTERNS.filter((pattern) => pattern.test(text)).map(
        (pattern) => `${path.relative(CREATIVE_CORE, file)}: ${String(pattern)}`,
      );
    });
    expect(hits).toEqual([]);
  });

  it('ne dépend que de son validateur de schéma', () => {
    const manifest = JSON.parse(readFileSync(path.join(CREATIVE_CORE, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    expect(manifest.dependencies).toEqual({ zod: '4.4.3' });
  });
});
