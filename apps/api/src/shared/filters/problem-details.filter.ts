import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '@propulse/domain-kernel';
import { TenantContextStore } from '../tenant/tenant-context.js';

/**
 * Maps thrown errors to RFC 9457 Problem Details responses (API_CONTRACTS.md). Domain errors
 * map to 4xx with their stable `code`; unknown errors become a 500 without leaking internals.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const correlationId = TenantContextStore.get()?.correlationId;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal Server Error';
    let code = 'INTERNAL_ERROR';
    let detail: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      title = exception.name;
      detail = exception.message;
      code = `HTTP_${status}`;
    } else if (exception instanceof DomainError) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      title = exception.name;
      code = exception.code;
      detail = exception.message;
    }

    res
      .status(status)
      .type('application/problem+json')
      .json({
        type: `https://errors.propulse.ai/${code}`,
        title,
        status,
        code,
        detail,
        correlationId,
      });
  }
}
