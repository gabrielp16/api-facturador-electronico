import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../common/logger/app-logger.service';
import { InvoicesService } from './invoices.service';

@Injectable()
export class InvoicesReconciliationService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
    private readonly invoicesService: InvoicesService,
  ) {}

  onModuleInit(): void {
    const enabled =
      this.configService.get<string>('dian.asyncReconciliation.enabled') === 'true' &&
      this.configService.get<string>('dian.sendMode') === 'async';

    if (!enabled) {
      return;
    }

    const intervalMs = this.configService.get<number>('dian.asyncReconciliation.intervalMs') || 60000;
    this.timer = setInterval(() => {
      this.invoicesService.reconcilePendingInvoices().catch((error) => {
        this.logger.error(
          `Background DIAN reconciliation failed: ${error?.message || error}`,
          error?.stack,
          'InvoicesReconciliationService',
        );
      });
    }, intervalMs);

    this.logger.log(
      `Async DIAN reconciliation worker started. Interval=${intervalMs}ms`,
      'InvoicesReconciliationService',
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
