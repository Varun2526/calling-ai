# Propulse AI — API image (multi-stage, pnpm workspace aware).
# Build from repo root:  docker build -f apps/api/Dockerfile -t propulse/api .

# ---- Builder ----
FROM node:20-slim AS builder
RUN corepack enable
WORKDIR /repo

# Copy workspace manifests first for better layer caching.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN pnpm install --frozen-lockfile
# Generate Prisma client + build the api and the packages it depends on.
RUN pnpm --filter @propulse/database generate \
 && pnpm --filter @propulse/api... build

RUN pnpm --filter @propulse/api --prod deploy /app

# ---- Runtime ----
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN useradd --create-home --uid 10001 appuser
COPY --from=builder --chown=appuser:appuser /app ./
USER appuser
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
