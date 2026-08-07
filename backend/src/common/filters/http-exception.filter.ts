import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import * as crypto from 'crypto';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const correlationId = request.headers['x-correlation-id'] || request.headers['x-request-id'] || `req_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Sunucu tarafında beklenmeyen bir hata oluştu.';
    let errorResponse: any = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      errorResponse = exception.getResponse();
      if (typeof errorResponse === 'string') {
        message = errorResponse;
      } else if (typeof errorResponse === 'object' && errorResponse !== null) {
        message = errorResponse.message || exception.message;
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `[Unhandled Error] CorrelationId: ${correlationId} | Path: ${request.url} | ${exception.message}`,
        exception.stack,
      );
    }

    const isProduction = process.env.NODE_ENV === 'production';

    // Build sanitized response
    const payload: any = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      correlationId,
      message: isProduction && status === HttpStatus.INTERNAL_SERVER_ERROR ? 'Sunucu tarafında beklenmeyen bir hata oluştu.' : message,
    };

    if (!isProduction && status === HttpStatus.INTERNAL_SERVER_ERROR && exception instanceof Error) {
      payload.debugStack = exception.stack;
    }

    response.status(status).json(payload);
  }
}
