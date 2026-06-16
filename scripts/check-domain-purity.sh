#!/usr/bin/env bash
#
# check-domain-purity.sh — enforce docs/CLEAN_ARCHITECTURE.md §5.3 / REPOSITORY_STRUCTURE.md §5.3.
#
# The domain layer must be pure: no file under any bounded-context domain/ folder may import a
# framework, an infra SDK, or read process.env. A single hit is a hard CI failure.
#
# Usage:   bash scripts/check-domain-purity.sh
# Make executable (optional):   chmod +x scripts/check-domain-purity.sh
#
# Exit codes: 0 = clean, 1 = forbidden import(s) found, 2 = nothing to scan / setup issue.

set -euo pipefail

# Resolve repo root from this script's location so it runs from anywhere.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

DOMAIN_GLOB_ROOT="${ROOT_DIR}/apps/api/src/contexts"

# Forbidden tokens. These match import sources and process.env access. ERE-escaped where needed.
FORBIDDEN=(
  "@nestjs"
  "@prisma/client"
  "prisma"
  "bullmq"
  "ioredis"
  "@aws-sdk"
  "axios"
  "process\.env"
)

echo "▶ Domain-purity check: scanning */domain under apps/api/src/contexts ..."

# Collect every .ts file living under a context's domain/ folder. Robust to "no contexts yet".
# Portable (works on bash 3.2 / macOS as well as bash 4+/Linux CI) — no mapfile.
DOMAIN_FILES="$(
  find "${DOMAIN_GLOB_ROOT}" -type d -name domain 2>/dev/null \
    -exec find {} -type f \( -name '*.ts' -o -name '*.tsx' \) \; 2>/dev/null \
    | sort -u || true
)"

if [[ -z "${DOMAIN_FILES}" ]]; then
  echo "  (no domain/ source files found yet — nothing to check; passing)"
  exit 0
fi

FILE_COUNT="$(printf '%s\n' "${DOMAIN_FILES}" | grep -c . || true)"
echo "  scanning ${FILE_COUNT} domain file(s)."

# Build a single alternation pattern: (@nestjs|@prisma/client|...).
PATTERN="$(IFS='|'; echo "${FORBIDDEN[*]}")"

# grep returns 1 when there are no matches; with set -e that would abort, so guard it.
set +e
MATCHES="$(printf '%s\n' "${DOMAIN_FILES}" | tr '\n' '\0' | xargs -0 grep -REnH "(${PATTERN})")"
GREP_STATUS=$?
set -e

if [[ ${GREP_STATUS} -eq 0 && -n "${MATCHES}" ]]; then
  echo ""
  echo "✖ Domain purity VIOLATION — the following domain files import framework/infra or read env:"
  echo "-----------------------------------------------------------------------------------------"
  echo "${MATCHES}"
  echo "-----------------------------------------------------------------------------------------"
  echo "Fix: the domain layer defines PORTS (interfaces); adapters live in infrastructure/."
  echo "See docs/CLEAN_ARCHITECTURE.md §2 (Domain layer) and §4 (Violations A & E)."
  exit 1
fi

echo "✔ Domain layer is pure — no forbidden imports found."
exit 0
