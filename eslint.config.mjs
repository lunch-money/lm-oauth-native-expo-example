import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: { ...tseslint.configs.recommended.rules, 'no-undef': 'off' },
  },
  {
    files: ['src/oauth/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react/*',
                'react-native',
                'react-native/*',
                'expo-router',
                'expo-router/*',
              ],
              message:
                'Keep React and presentation concerns in src/scaffolding/.',
            },
            {
              group: ['../scaffolding/*', '../scaffolding/**'],
              message:
                'The OAuth teaching core must not depend on scaffolding.',
            },
          ],
        },
      ],
    },
  },
]
