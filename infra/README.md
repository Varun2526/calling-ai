# Propulse AI — Infrastructure

IaC and deployment topology for AWS. See [`docs/DEPLOYMENT_GUIDE.md`](../docs/DEPLOYMENT_GUIDE.md).

## Recommended tooling

**AWS CDK (TypeScript)** — recommended to keep one language across the stack and let infra
share types with the apps. Terraform is a viable alternative if the team standardizes on it;
record the choice in an ADR before building this out.

## Resources (target topology)

| Resource                           | Purpose                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| VPC (multi-AZ, private subnets)    | Network isolation; one VPC per environment (dev/staging/prod), ideally separate AWS accounts |
| RDS PostgreSQL (+ `pgvector`, FTS) | Primary datastore; read replica for analytics                                                |
| ElastiCache (Redis)                | Cache, pub/sub, BullMQ broker                                                                |
| S3                                 | Recordings, transcripts, documents (tenant-prefixed keys `org/{id}/...`)                     |
| ALB + WAF                          | TLS termination, routing, rate limiting                                                      |
| ECS Fargate cluster                | Runs the 4 services below                                                                    |
| ECR                                | One repo per app image                                                                       |
| Secrets Manager / SSM              | Provider keys, DB creds (never in images)                                                    |
| CloudWatch                         | Logs, metrics, alarms, dashboards                                                            |

## Services (ECS Fargate) & autoscaling signals

| Service         | Image                | Scales on                                            |
| --------------- | -------------------- | ---------------------------------------------------- |
| `web`           | `apps/web`           | CPU / request count                                  |
| `api`           | `apps/api`           | CPU / p95 latency                                    |
| `voice-gateway` | `apps/voice-gateway` | concurrent active calls (sticky, Redis-checkpointed) |
| `workers`       | `apps/workers`       | queue depth per queue                                |

## Layout

- `infra/docker/` — Dockerfiles per app (see `apps/api/Dockerfile` for the multi-stage pattern).
- `infra/ecs/` — task/service definitions.
- `infra/scripts/` — deploy, migrate, smoke-test scripts.
