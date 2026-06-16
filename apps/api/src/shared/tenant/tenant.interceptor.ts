import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { Observable } from 'rxjs';
import { TenantContextStore, type TenantContext } from './tenant-context.js';

/**
 * Runs after TenantGuard. Builds the request-scoped TenantContext from the verified
 * principal and runs the rest of the request inside the AsyncLocalStorage store so every
 * layer (repositories, outbox) sees the active tenant. Generates a correlationId if the
 * client didn't supply one (traceable through events end-to-end).
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const principal = req.principal;
    if (!principal) {
      // Unauthenticated routes (e.g. webhooks, health) bypass tenant context.
      return next.handle();
    }
    const ctx: TenantContext = {
      organizationId: principal.organizationId,
      userId: principal.userId,
      roles: principal.roles,
      isPlatformActor: principal.isPlatformActor,
      correlationId: (req.headers['x-correlation-id'] as string) ?? randomUUID(),
    };
    return new Observable((subscriber) => {
      TenantContextStore.run(ctx, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
