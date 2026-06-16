/**
 * Architecture fitness test (docs/CLEAN_ARCHITECTURE.md §5.7).
 *
 * Mechanically asserts the load-bearing boundaries by scanning the filesystem with fs+path
 * only — no build, no module graph, no extra deps beyond vitest. This complements (does not
 * replace) dependency-cruiser and scripts/check-domain-purity.sh; it is the in-test-suite
 * tripwire so a boundary break fails `pnpm test` too.
 *
 * Asserts:
 *   (a) No file under any context domain/ imports a framework/infra SDK or reads process.env.
 *   (b) No file under packages/ imports from apps/.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];
const IGNORED_DIRS = new Set(['node_modules', 'dist', '.next', '.turbo', 'coverage', '.git']);

/** Recursively collect source files under `dir`, skipping build/output dirs. */
function collectSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (SOURCE_EXTENSIONS.some((ext) => full.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

/** Find every directory literally named `domain` under apps/api/src/contexts. */
function findDomainDirs(): string[] {
  const contextsRoot = join(REPO_ROOT, 'apps', 'api', 'src', 'contexts');
  if (!existsSync(contextsRoot)) return [];
  const dirs: string[] = [];
  for (const ctx of readdirSync(contextsRoot)) {
    const domainDir = join(contextsRoot, ctx, 'domain');
    if (existsSync(domainDir) && statSync(domainDir).isDirectory()) {
      dirs.push(domainDir);
    }
  }
  return dirs;
}

// Mirror of the forbidden list in .dependency-cruiser.cjs and check-domain-purity.sh.
const FORBIDDEN_DOMAIN_IMPORTS = [
  '@nestjs',
  '@prisma/client',
  'prisma',
  'bullmq',
  'ioredis',
  '@aws-sdk',
  'axios',
];

const importLikeRegex = /\b(?:import|require)\b[^;\n]*['"]([^'"]+)['"]/g;

describe('architecture fitness — domain purity (a)', () => {
  const domainDirs = findDomainDirs();
  const domainFiles = domainDirs.flatMap(collectSourceFiles);

  it('finds domain files to scan (or none yet — both are valid)', () => {
    // No assertion failure if the codebase has no contexts yet; this documents intent.
    expect(Array.isArray(domainFiles)).toBe(true);
  });

  it('domain files do not import framework/infra SDKs', () => {
    const violations: string[] = [];
    for (const file of domainFiles) {
      const src = readFileSync(file, 'utf8');
      let match: RegExpExecArray | null;
      importLikeRegex.lastIndex = 0;
      while ((match = importLikeRegex.exec(src)) !== null) {
        const specifier = match[1];
        const hit = FORBIDDEN_DOMAIN_IMPORTS.find(
          (f) => specifier === f || specifier.startsWith(`${f}/`),
        );
        if (hit) {
          violations.push(`${file.replace(REPO_ROOT + sep, '')} imports "${specifier}"`);
        }
      }
    }
    expect(violations, `Domain layer must be pure:\n${violations.join('\n')}`).toEqual([]);
  });

  it('domain files do not read process.env', () => {
    const violations: string[] = [];
    for (const file of domainFiles) {
      const src = readFileSync(file, 'utf8');
      if (/process\.env/.test(src)) {
        violations.push(file.replace(REPO_ROOT + sep, ''));
      }
    }
    expect(
      violations,
      `Domain layer must not read process.env (inject validated config):\n${violations.join('\n')}`,
    ).toEqual([]);
  });
});

describe('architecture fitness — packages never import apps (b)', () => {
  const packagesRoot = join(REPO_ROOT, 'packages');
  const packageFiles = collectSourceFiles(packagesRoot);

  it('no file under packages/ imports from apps/', () => {
    const violations: string[] = [];
    for (const file of packageFiles) {
      const src = readFileSync(file, 'utf8');
      let match: RegExpExecArray | null;
      importLikeRegex.lastIndex = 0;
      while ((match = importLikeRegex.exec(src)) !== null) {
        const specifier = match[1];
        // Catch relative climbs into apps/ and any path segment that is "apps".
        const climbsIntoApps =
          specifier.includes('/apps/') ||
          specifier.startsWith('apps/') ||
          /(^|\/)apps\//.test(specifier);
        if (climbsIntoApps) {
          violations.push(`${file.replace(REPO_ROOT + sep, '')} imports "${specifier}"`);
        }
      }
    }
    expect(
      violations,
      `packages/ must never depend on apps/ (REPOSITORY_STRUCTURE.md §5.4):\n${violations.join('\n')}`,
    ).toEqual([]);
  });
});
