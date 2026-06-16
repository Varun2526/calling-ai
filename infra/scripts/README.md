# Deploy / ops scripts

Placeholders for the operational scripts referenced by `docs/DEPLOYMENT_GUIDE.md`:

- `deploy.sh` — build+push images to ECR, register task defs, update ECS services.
- `migrate.sh` — run `prisma migrate deploy` as a one-off ECS task.
- `smoke-test.sh` — post-deploy health + critical-path checks per service.

Implement during roadmap Phase 0 (Foundations) once the CDK/Terraform stack exists.
