// Produit les polices TTF versionnées à partir des paquets @fontsource
// (WOFF, sous-ensemble latin : couvre le français, « œ » et « ’ » compris).
// Chaque cible reçoit aussi la licence OFL du paquet source. Les empreintes
// affichées sont celles à déclarer dans les styles ; la conversion est
// déterministe (mêmes octets à chaque exécution).
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

import { createFont } from 'fonteditor-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const jobs = [
  // Bibliothèque partagée (mode créatif, styles sans marque).
  { out: 'packs/fonts/playfair_display', pkg: '@fontsource/playfair-display', family: 'playfair-display', weights: [700, 900] },
  { out: 'packs/fonts/ibm_plex_mono', pkg: '@fontsource/ibm-plex-mono', family: 'ibm-plex-mono', weights: [500, 700] },
  // Fixtures neutres du cœur : copies autonomes, le cœur ne lit jamais packs/.
  { out: 'core/test-fixtures/fonts', pkg: '@fontsource/playfair-display', family: 'playfair-display', weights: [700, 900] },
  { out: 'core/test-fixtures/fonts', pkg: '@fontsource/ibm-plex-mono', family: 'ibm-plex-mono', weights: [500, 700] },
  // Exemple de marque : ses polices vivent avec elle.
  { out: 'examples/rezo360/fonts', pkg: '@fontsource/archivo', family: 'archivo', weights: [700, 800] },
];

for (const job of jobs) {
  const outDir = path.join(root, job.out);
  mkdirSync(outDir, { recursive: true });
  copyFileSync(path.join(root, 'node_modules', job.pkg, 'LICENSE'), path.join(outDir, `LICENSE-${job.family}.txt`));
  for (const weight of job.weights) {
    const source = path.join(root, 'node_modules', job.pkg, 'files', `${job.family}-latin-${weight}-normal.woff`);
    const font = createFont(readFileSync(source), {
      type: 'woff',
      hinting: true,
      kerning: true,
      inflate: (bytes) => inflateSync(Buffer.from(bytes)),
    });
    const ttf = font.write({ type: 'ttf', hinting: true, kerning: true, toBuffer: true });
    const target = path.join(outDir, `${job.family}-latin-${weight}.ttf`);
    writeFileSync(target, ttf);
    const sha = createHash('sha256').update(ttf).digest('hex');
    console.log(`${path.relative(root, target).replaceAll('\\', '/')}  sha256=${sha}`);
  }
}
