import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AppLogger } from '../logger/app-logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(
            `${request.method} ${request.url} ${Date.now() - startedAt}ms`,
            'HTTP',
          );
        },
        error: (error) => {
          this.logger.error(
            `${request.method} ${request.url} failed after ${Date.now() - startedAt}ms: ${error.message}`,
            error.stack,
            'HTTP',
          );
        },
      }),
    );
  }
}