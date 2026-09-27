import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CORE_ROOT } from './test-support.ts';

// Garde-fous structurels du cœur. Ils ne citent volontairement aucune marque :
// la liste d'interdits nominative vit hors du cœur (tests d'intégration).

function files(dir: string, filter: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : files(full, filter);
    return filter(name) ? [full] : [];
  });
}

const sources = files(path.join(CORE_ROOT, 'src'), (n) => /\.tsx?$/.test(n));
const engineSources = sources.filter((f) => !/\.test\.tsx?$/.test(f) && !f.endsWith('test-support.ts'));
const pkg = JSON.parse(readFileSync(path.join(CORE_ROOT, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!);
}

describe('frontières du cœur', () => {
  it('analyse effectivement le code du moteur', () => {
    expect(engineSources.length).toBeGreaterThan(15);
  });

  it('chaque import relatif reste à l’intérieur de core/', () => {
    const escapes = sources.flatMap((file) =>
      importsOf(file)
        .filter((spec) => spec.startsWith('.'))
        .map((spec) => ({ file, target: path.resolve(path.dirname(file), spec) }))
        .filter(({ target }) => path.relative(CORE_ROOT, target).startsWith('..') || !existsSync(target))
        .map(({ file, target }) => `${path.relative(CORE_ROOT, file)} → ${target}`),
    );
    expect(escapes).toEqual([]);
  });

  it('le code du moteur n’importe que des dépendances déclarées en production', () => {
    const allowed = new Set(Object.keys(pkg.dependencies ?? {}));
    const bare = engineSources.flatMap((file) =>
      importsOf(file)
        .filter((spec) => !spec.startsWith('.') && !spec.startsWith('node:'))
        .filter((spec) => !allowed.has(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!))
        .map((spec) => `${path.relative(CORE_ROOT, file)} : ${spec}`),
    );
    expect(bare).toEqual([]);
  });

  it('aucune couleur n’est codée dans le moteur : elles vivent dans les styles', () => {
    const hits = engineSources.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => /#[0-9a-fA-F]{6}\b/.test(line))
        .map(({ line, i }) => `${path.relative(CORE_ROOT, file)}:${i + 1} ${line.trim()}`),
    );
    expect(hits).toEqual([]);
  });

  it('aucun nom de police n’est codé dans le moteur', () => {
    const fonts = files(path.join(CORE_ROOT, 'test-fixtures', 'fonts'), (n) => n.endsWith('.ttf')).map((f) =>
      path.basename(f).split('-latin')[0]!.replaceAll('-', ' '),
    );
    const hits = engineSources.flatMap((file) => {
      const text = readFileSync(file, 'utf8').toLowerCase().replaceAll('-', ' ');
      return fonts.filter((font) => text.includes(font)).map((font) => `${path.relative(CORE_ROOT, file)} : ${font}`);
    });
    expect(hits).toEqual([]);
  });
});
