import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'coverage/',
      'reports/',
      'playwright-report/',
      'test-results/',
      '.lighthouseci/',
      '.stryker-tmp/',
      '.private/',
      '.claude/',
      '_output/',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    // The engine has no runtime dependencies: it imports only its own modules.
    files: ['src/engine/**/*.ts'],
    ignores: ['src/engine/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!\\.{1,2}/)',
              message: 'src/engine has no dependencies; import only relative engine modules.',
            },
          ],
        },
      ],
    },
  },
  {
    // The app uses the engine only through its public API.
    files: ['src/**/*.ts'],
    ignores: ['src/engine/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)engine/(?!index\\.ts$)',
              message: "Import the engine through its public API, 'src/engine/index.ts'.",
            },
          ],
        },
      ],
    },
  },
  prettier,
);
