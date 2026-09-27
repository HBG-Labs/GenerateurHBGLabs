import tseslint from 'typescript-eslint';

// Le moteur doit rester déterministe : même spec, mêmes assets, même style,
// même version → même rendu. Aucune source de hasard ni d'horloge dans le
// cœur : le temps et les tirages passent par des paramètres explicites.
const determinismRules = {
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'random', message: 'Aucun hasard dans le moteur : écrire le choix dans la spec.' },
    { object: 'Date', property: 'now', message: 'Aucune horloge dans le moteur : passer le temps en paramètre.' },
    { object: 'performance', property: 'now', message: 'Aucune horloge dans le moteur : mesurer hors du moteur.' },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: "NewExpression[callee.name='Date'][arguments.length=0]",
      message: 'Aucune horloge dans le moteur : passer la date en paramètre.',
    },
  ],
};

// Le cœur ne dépend jamais des exemples ni des packs de données : ils sont
// fournis à l'exécution par l'appelant.
const boundaryRules = {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        { group: ['**/examples/**', '**/packs/**', '**/integration/**'], message: 'Le cœur ne dépend d’aucune donnée externe.' },
      ],
    },
  ],
};

export default tseslint.config(
  { ignores: ['node_modules/**', 'out/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      ...boundaryRules,
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}', 'src/test-support.ts'],
    rules: determinismRules,
  },
  {
    // Les tests fabriquent volontairement des documents invalides à partir de
    // JSON brut : l'accès non typé y est la norme, pas un défaut.
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
