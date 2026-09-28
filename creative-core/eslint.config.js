import tseslint from 'typescript-eslint';

const determinismRules = {
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'random', message: 'Le Creative Core ne dépend d’aucun hasard implicite.' },
    { object: 'Date', property: 'now', message: 'Le Creative Core ne dépend d’aucune horloge implicite.' },
    { object: 'performance', property: 'now', message: 'Les mesures restent hors du Creative Core.' },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: "NewExpression[callee.name='Date'][arguments.length=0]",
      message: 'Le Creative Core ne dépend d’aucune horloge implicite.',
    },
  ],
};

export default tseslint.config(
  { ignores: ['node_modules/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-dom', 'remotion', '@remotion/**'], message: 'Le Creative Core est indépendant du renderer.' },
            { group: ['**/core/**', '@motion-engine/core'], message: 'Le contrat créatif ne dépend pas du moteur d’exécution P1.' },
            { group: ['**/examples/**', '**/packs/**', '**/integration/**'], message: 'Le Creative Core ne dépend d’aucune donnée externe.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}', 'src/test-support.ts'],
    rules: determinismRules,
  },
  {
    files: ['src/**/*.test.{ts,tsx}', 'src/test-support.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
);
