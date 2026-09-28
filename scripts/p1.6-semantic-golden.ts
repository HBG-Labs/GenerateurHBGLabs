import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { canonicalJson } from '@motion-engine/core';

import { buildCertificationPair } from '../integration/p1.6-support.ts';

const workspace = path.resolve(import.meta.dirname, '..');
const golden = path.join(workspace, 'certification', 'goldens', 'p1.6-semantic.json');
const update = process.argv.includes('--update');
const value = canonicalJson(buildCertificationPair().semantic);

if (update) {
  mkdirSync(path.dirname(golden), { recursive: true });
  writeFileSync(golden, `${value}\n`, 'utf8');
  process.stdout.write(`Golden P1.6 mis à jour explicitement : ${golden}\n`);
} else {
  if (!existsSync(golden)) throw new Error(`Golden P1.6 absent : exécuter npm run golden:update:p1.6`);
  const expected = readFileSync(golden, 'utf8').trim();
  if (expected !== value) throw new Error('Régression sémantique P1.6 : le golden ne peut pas être mis à jour silencieusement.');
  process.stdout.write('Golden sémantique P1.6 vérifié.\n');
}
