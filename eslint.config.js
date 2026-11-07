// ESLint flat config.
//
// Two populations, two levels of rigor:
//   src/**/*.ts, *.config.ts  -> type-aware rules (they live in tsconfig.json)
//   tools/**/*.mjs            -> plain recommended rules (plain Node ESM scripts)
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'report/**', 'shots/**', 'research/**', 'public/**'],
  },

  // ------------------------------------------------------------ TypeScript
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser },
    },
    rules: {
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // numeric math on canvas/SVG geometry is the whole point of this codebase
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // the profile loop in animator.ts deliberately mutates accumulators
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    },
  },

  // ------------------------------------------------------- Node ESM scripts
  {
    files: ['**/*.mjs', 'tools/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      // these scripts run under Node but pass callbacks into page.evaluate(),
      // so both global sets are legitimate here
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-console': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // Python tooling is checked by `python -m py_compile` in CI, not here.
  {
    files: ['**/*.js', '**/*.ts'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
  }
);
