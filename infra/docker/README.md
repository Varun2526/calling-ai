# Docker images

One **multi-stage** Dockerfile per app, colocated with the app (`apps/<app>/Dockerfile`), so
build context and `.dockerignore` stay close to the code. See `apps/api/Dockerfile` for the
reference pattern: a `pnpm`-aware builder stage that installs the whole workspace, builds the
target app + its workspace deps via Turbo, then a slim runtime stage that copies only the
built output and production dependencies.

Build (from repo root):

```bash
docker build -f apps/api/Dockerfile -t propulse/api:local .
```

Each runtime image runs as a non-root user, exposes its service port, and defines a
`HEALTHCHECK` hitting `/health`.
