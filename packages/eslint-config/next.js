import base from './base.js';
import globals from 'globals';

/** ESLint config for the Next.js frontend (apps/web). */
export default [
  ...base,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
];
