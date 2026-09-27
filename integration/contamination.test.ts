import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CORE, EXAMPLES, WORKSPACE } from './support.ts';

// Le cœur et les packs génériques ne doivent contenir AUCUN élément propre à
// un cas d'usage. Deux listes :
// - une liste fixe, pour le premier cas d'usage et son vocabulaire métier ;
// - une liste dérivée automatiquement de chaque profil sous examples/ : toute
//   nouvelle marque ajoutée est protégée sans rien écrire ici.

const FIXED_TERMS = [
  'REZO360',
  'REZO 360',
  'HBG Labs',
  'HBGLabs',
  '#1B44C8',
  'Archivo',
  'artisan',
  'artisans',
  'intervention',
  'interventions',
  'mission',
  'missions',
  'facture',
  'factures',
  'devis',
  'chantier',
  'chantiers',
  'terrain',
  'technicien',
  'techniciens',
  'SaaS',
];

function readDoc(file: string): Record<string, any> {
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, any>;
}

/**
 * Termes distinctifs des cas d'usage : chaque marque ou série d'examples/,
 * et le style qu'elle désigne (identifiants, noms, couleurs, polices propres,
 * logos, lexique). Les polices de la bibliothèque partagée (`lib:`) ne sont
 * pas propres à une marque et restent utilisables par le cœur.
 */
function derivedTerms(): string[] {
  const terms = new Set<string>();
  const addStyle = (style: Record<string, any>) => {
    terms.add(style.id);
    terms.add(style.name);
    const palette: Record<string, string> = style.palette ?? {};
    const families: Record<string, { css_name: string; files: { src: string }[] }> = style.typography?.families ?? {};
    for (const hex of Object.values(palette)) terms.add(hex);
    for (const family of Object.values(families)) {
      const own = family.files.filter((f) => f.src.startsWith('pack:'));
      if (own.length > 0) terms.add(family.css_name);
      for (const f of own) terms.add(path.basename(f.src.slice('pack:'.length)).split('-latin')[0]!);
    }
  };
  for (const example of readdirSync(EXAMPLES)) {
    const dir = path.join(EXAMPLES, example);
    for (const file of ['brand.json', 'series.json']) {
      const full = path.join(dir, file);
      if (!existsSync(full)) continue;
      const doc = readDoc(full);
      terms.add(doc.id);
      terms.add(doc.name);
      const logos: Record<string, { runs: { text: string }[] }> = doc.logos ?? {};
      for (const logo of Object.values(logos)) {
        terms.add(logo.runs.map((r) => r.text).join(''));
      }
      for (const entry of doc.lexicon ?? []) {
        terms.add(entry.term);
        terms.add(entry.say);
      }
      const styleSrc: string | undefined = doc.style?.src;
      if (styleSrc?.startsWith('pack:')) addStyle(readDoc(path.join(dir, styleSrc.slice('pack:'.length))));
    }
  }
  // Un terme trop court ou purement numérique produirait des faux positifs.
  return [...terms].filter((t) => typeof t === 'string' && t.replace(/[^\p{L}\p{N}#]/gu, '').length >= 4 && !/^\d+$/.test(t));
}

function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matcher(term: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(term)}(?![\\p{L}\\p{N}])`, 'iu');
}

function textFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : textFiles(full);
    return /\.(ttf|otf|woff2?|png|jpe?g|webp|mp4|wav|mp3)$/i.test(name) ? [] : [full];
  });
}

export function scan(files: string[], terms: string[]): string[] {
  const patterns = terms.map((term) => ({ term, re: matcher(term) }));
  return files.flatMap((file) => {
    const rel = path.relative(WORKSPACE, file);
    const hits: string[] = [];
    for (const { term, re } of patterns) {
      if (re.test(rel)) hits.push(`${rel} (nom de fichier) : « ${term} »`);
    }
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        for (const { term, re } of patterns) if (re.test(line)) hits.push(`${rel}:${i + 1} : « ${term} »`);
      });
    return hits;
  });
}

// Périmètre protégé : tout le cœur (code, schémas, fixtures neutres, config)
// et les packs génériques. Exceptions par chemin uniquement : examples/ et la
// bibliothèque de polices (données sous licence, sans code).
const PROTECTED = [
  ...textFiles(CORE),
  ...textFiles(path.join(WORKSPACE, 'packs', 'patterns', 'generic')),
  ...textFiles(path.join(WORKSPACE, 'packs', 'platforms')),
];

describe('contamination du cœur', () => {
  const derived = derivedTerms();

  it('la liste dérivée contient bien les éléments du premier cas d’usage', () => {
    expect(derived).toEqual(expect.arrayContaining(['rezo360', 'REZO360', 'Rézo trois-cent-soixante', '#1B44C8', 'rezo360-archivo', 'archivo']));
  });

  it('le scanner détecte réellement une contamination (contrôle positif)', () => {
    const probe = path.join(EXAMPLES, 'rezo360', 'brand.json');
    expect(scan([probe], ['REZO360']).length).toBeGreaterThan(0);
    expect(scan([probe], ['permission'])).toEqual([]);
  });

  it('analyse un périmètre non vide', () => {
    expect(PROTECTED.length).toBeGreaterThan(20);
  });

  it('le cœur et les packs génériques ne contiennent aucun terme interdit (liste fixe)', () => {
    expect(scan(PROTECTED, FIXED_TERMS)).toEqual([]);
  });

  it('le cœur et les packs génériques ne contiennent aucun élément dérivé des exemples', () => {
    expect(scan(PROTECTED, derived)).toEqual([]);
  });
});
