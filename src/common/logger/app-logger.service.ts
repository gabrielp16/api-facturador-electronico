import { ConsoleLogger, Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger extends ConsoleLogger {
  log(message: string, context?: string): void {
    super.log(message, context);
  }

  error(message: string, trace?: string, context?: string): void {
    super.error(message, trace, context);
  }

  warn(message: string, context?: string): void {
    super.warn(message, context);
  }

  debug(message: string, context?: string): void {
    super.debug(message, context);
  }

  verbose(message: string, context?: string): void {
    super.verbose(message, context);
  }
}