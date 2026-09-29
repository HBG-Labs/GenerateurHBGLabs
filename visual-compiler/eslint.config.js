import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**'] },
  {
    files: ['**/*.ts'], extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-imports': ['error', { patterns: [
        { group: ['react', 'react-dom', 'remotion', '@remotion/**'], message: 'Visual Compiler ne produit que MotionSpec.' },
        { group: ['**/renderer-remotion/**'], message: 'Le compiler ne dépend pas du renderer.' },
        { group: ['**/examples/**', '**/integration/**'], message: 'Le compiler ne dépend pas des fixtures.' },
      ] }],
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'Aucun hasard implicite.' },
        { object: 'Date', property: 'now', message: 'Aucune horloge implicite.' },
      ],
    },
  },
  { files: ['src/**/*.test.ts'], rules: {
    '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off', '@typescript-eslint/no-unsafe-argument': 'off',
  } },
);
