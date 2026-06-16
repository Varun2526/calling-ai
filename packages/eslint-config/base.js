import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Shared base ESLint flat config for all Propulse AI packages and apps.
 * Heavyweight architectural boundary enforcement (cross-context isolation, layer
 * dependency rules, domain-layer purity) lives in dependency-cruiser — see
 * `.dependency-cruiser.cjs` at the repo root and `pnpm boundaries`.
 */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      // No reaching into another package's internals via deep relative paths.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/dist/**'],
              message: 'Import from the package entrypoint, not its dist build.',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ['dist/**', '.next/**', 'coverage/**', 'node_modules/**', '**/*.config.*'],
  },
  prettier,
);
