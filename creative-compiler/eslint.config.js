import tseslint from 'typescript-eslint';

const determinismRules = {
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'random', message: 'Le Creative Compiler ne dépend d’aucun hasard implicite.' },
    { object: 'Date', property: 'now', message: 'Le Creative Compiler ne dépend d’aucune horloge implicite.' },
    { object: 'performance', property: 'now', message: 'Les mesures restent hors du Creative Compiler.' },
  ],
};

export default tseslint.config(
  { ignores: ['node_modules/**'] },
  {
    files: ['**/*.ts'],
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
            { group: ['react', 'react-dom', 'remotion', '@remotion/**'], message: 'Le Creative Compiler produit uniquement un MotionSpec.' },
            { group: ['**/renderer-remotion/**'], message: 'Le Creative Compiler reste indépendant du renderer.' },
          ],
        },
      ],
    },
  },
  { files: ['src/**/*.ts'], ignores: ['src/**/*.test.ts'], rules: determinismRules },
  {
    files: ['src/**/*.test.ts', 'src/test-support.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off'
    }
  }
);
