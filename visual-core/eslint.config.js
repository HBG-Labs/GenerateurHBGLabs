import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**'] },
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-imports': ['error', { patterns: [
        { group: ['react', 'react-dom', 'remotion', '@remotion/**'], message: 'Visual Core est renderer-agnostic.' },
        { group: ['@motion-engine/core', '**/core/**'], message: 'P1 ne doit pas devenir une dépendance de Visual Core.' },
        { group: ['**/examples/**', '**/packs/**', '**/integration/**'], message: 'Visual Core ne dépend d’aucune fixture.' },
      ] }],
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'Aucun hasard implicite.' },
        { object: 'Date', property: 'now', message: 'Aucune horloge implicite.' },
        { object: 'performance', property: 'now', message: 'Les métriques restent hors du Core.' },
      ],
    },
  },
  { files: ['src/**/*.test.ts'], rules: {
    '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off', '@typescript-eslint/no-unsafe-argument': 'off',
  } },
);
