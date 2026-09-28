import tseslint from 'typescript-eslint';

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
            { group: ['react', 'react-dom', 'remotion', '@remotion/**'], message: 'Le Gateway ne dépend d’aucun renderer.' },
            { group: ['openai', '@anthropic-ai/**', '@google/**'], message: 'P2.4 ne connecte aucun provider réel.' },
            { group: ['node:http', 'node:https', 'node:net', 'node:tls', 'node:dns'], message: 'Le Gateway Core reste offline.' },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Aucun ID Gateway ne dépend du hasard.' },
        { object: 'Date', property: 'now', message: 'Aucun snapshot Gateway ne dépend de l’horloge.' },
      ],
    },
  },
  {
    files: ['src/**/*.test.ts', 'src/testing/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
);
