import { Controller, Get } from '@nestjs/common';

/** Liveness/readiness probe for ALB + ECS health checks (DEPLOYMENT_GUIDE.md). */
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: string; service: string } {
    return { status: 'ok', service: 'api' };
  }
}
