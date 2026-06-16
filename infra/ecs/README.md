# ECS Fargate task & service definitions

One task definition + service per app. Notes:

- **Health checks:** ALB target group + container `HEALTHCHECK` on `/health`.
- **Graceful shutdown:** `api`/`voice-gateway` drain WebSocket/voice sessions on SIGTERM;
  `workers` finish in-flight jobs before exit (set ECS `stopTimeout` accordingly).
- **Autoscaling:** `api` on CPU/p95; `voice-gateway` on concurrent active calls (sticky
  routing, session state in Redis); `workers` on queue depth (CloudWatch custom metric);
  `web` on CPU/request count.
- **Secrets:** injected from Secrets Manager/SSM via task definition `secrets`, never baked
  into images.
- **Migrations:** `prisma migrate deploy` runs as a one-off ECS task before the api/workers
  services roll (expand-contract for zero downtime).
