import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  // The generated Prisma client is a runtime dependency of consumers; do not
  // bundle it. Consumers install @prisma/client and run `prisma generate`.
  external: ['@prisma/client', '.prisma/client'],
});
