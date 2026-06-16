import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Derives the tenant + actor from the authenticated session and rejects unauthenticated
 * requests. The downstream TenantContextMiddleware/interceptor places this into the
 * AsyncLocalStorage store. SKELETON: real session/JWT verification is wired in the IAM
 * context (Phase 1 of the roadmap) — here we read a verified principal off the request.
 */
declare module 'express' {
  interface Request {
    principal?: {
      organizationId: string;
      userId: string;
      roles: string[];
      isPlatformActor: boolean;
    };
  }
}

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    // TODO(iam): replace with real session/JWT verification + role hydration.
    const principal = req.principal;
    if (!principal?.organizationId || !principal.userId) {
      throw new UnauthorizedException('Authentication required');
    }
    return true;
  }
}
