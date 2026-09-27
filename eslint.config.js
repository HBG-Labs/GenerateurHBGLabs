import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Le cœur a son propre lint (core/eslint.config.js) ; les packs et les
  // exemples ne contiennent que des données.
  { ignores: ['node_modules/**', 'core/**', 'packs/**', 'examples/**', 'out/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Les tests manipulent du JSON brut pour fabriquer des cas limites.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
);
