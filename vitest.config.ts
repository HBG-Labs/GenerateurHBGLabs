import { defineConfig } from 'vitest/config';

// Tests d'intégration de l'espace de travail : exemples, packs, contamination
// et isolement du cœur. Les tests du cœur tournent dans core/.
export default defineConfig({
  test: {
    include: ['integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
