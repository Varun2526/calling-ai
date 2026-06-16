import base from './base.js';
import globals from 'globals';

/** ESLint config for the NestJS backend (apps/api, apps/workers, apps/voice-gateway). */
export default [
  ...base,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // NestJS relies heavily on decorators + DI metadata.
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
