import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as soap from 'soap';
import { AppLogger } from '../../common/logger/app-logger.service';
import { zipXmlToBase64 } from '../../common/utils/zip.util';
import {
  DianResponseParser,
  DianStatusResponse,
  DianSubmissionResponse,
} from './dian-response.parser';

interface SubmitInvoiceInput {
  invoiceNumber: string;
  xmlFileName: string;
  signedXml: string;
}

@Injectable()
export class DianService {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
    private readonly responseParser: DianResponseParser,
  ) {}

  async submitInvoice(input: SubmitInvoiceInput): Promise<DianSubmissionResponse> {
    const sendMode = this.configService.get<string>('dian.sendMode');
    const zipName = `${input.invoiceNumber}.zip`;
    const contentFile = zipXmlToBase64(input.xmlFileName, input.signedXml);
    const correlationId = this.newCorrelationId();
    const client = await this.createClient();

    try {
      if (sendMode === 'async') {
        this.logInfo('submit_invoice_async_start', {
          correlationId,
          invoiceNumber: input.invoiceNumber,
          zipName,
        });

        const [response] = await this.executeWithRetry<any[]>(
          'SendBillAsync',
          correlationId,
          async () =>
          this.withTimeout(
            client.SendBillAsyncAsync({
              fileName: zipName,
              contentFile,
            }),
            this.getSoapTimeoutMs(),
            'SendBillAsync',
          ),
        );

        this.logInfo('submit_invoice_async_done', {
          correlationId,
          invoiceNumber: input.invoiceNumber,
          zipName,
        });

        return this.responseParser.parseSubmissionResponse({
          response,
          zipName,
          asyncMode: true,
          correlationId,
        });
      }

      this.logInfo('submit_invoice_sync_start', {
        correlationId,
        invoiceNumber: input.invoiceNumber,
        zipName,
      });

      const [response] = await this.executeWithRetry<any[]>(
        'SendBillSync',
        correlationId,
        async () =>
        this.withTimeout(
          client.SendBillSyncAsync({
            fileName: zipName,
            contentFile,
          }),
          this.getSoapTimeoutMs(),
          'SendBillSync',
        ),
      );

      this.logInfo('submit_invoice_sync_done', {
        correlationId,
        invoiceNumber: input.invoiceNumber,
        zipName,
      });

      return this.responseParser.parseSubmissionResponse({
        response,
        zipName,
        asyncMode: false,
        correlationId,
      });
    } catch (error) {
      this.logError('submit_invoice_failed', error, {
        correlationId,
        invoiceNumber: input.invoiceNumber,
        zipName,
      });
      throw new InternalServerErrorException(`DIAN submission failed: ${error.message}`);
    }
  }

  async getStatus(trackId: string): Promise<DianStatusResponse> {
    const correlationId = this.newCorrelationId();
    const client = await this.createClient();

    try {
      this.logInfo('get_status_start', { correlationId, trackId });

      const [response] = await this.executeWithRetry<any[]>(
        'GetStatus',
        correlationId,
        async () =>
        this.withTimeout(
          client.GetStatusAsync({ trackId }),
          this.getSoapTimeoutMs(),
          'GetStatus',
        ),
      );

      this.logInfo('get_status_done', { correlationId, trackId });
      return this.responseParser.parseStatusResponse({ response, correlationId });
    } catch (error) {
      this.logError('get_status_failed', error, { correlationId, trackId });
      throw new InternalServerErrorException(`DIAN GetStatus failed: ${error.message}`);
    }
  }

  private async createClient(): Promise<any> {
    const environment = this.configService.get<string>('dian.environment');
    const wsdl =
      environment === 'production'
        ? this.configService.get<string>('dian.wsdlProd')
        : this.configService.get<string>('dian.wsdlTest');

    const timeoutMs = this.getSoapTimeoutMs();
    const client = await soap.createClientAsync(wsdl, {
      endpoint: wsdl.replace('?wsdl', ''),
      forceSoap12Headers: true,
      wsdl_options: {
        timeout: timeoutMs,
      },
    });

    this.configureWsSecurity(client);

    return client;
  }

  private configureWsSecurity(client: any): void {
    const wsSecurityEnabled = this.configService.get<string>('dian.wsSecurity.enabled') === 'true';

    if (!wsSecurityEnabled) {
      return;
    }

    const username = this.configService.get<string>('dian.wsSecurity.username');
    const password = this.configService.get<string>('dian.wsSecurity.password');
    const mustUnderstand =
      this.configService.get<string>('dian.wsSecurity.mustUnderstand') !== 'false';
    const hasTimeStamp =
      this.configService.get<string>('dian.wsSecurity.hasTimeStamp') !== 'false';
    const hasNonce = this.configService.get<string>('dian.wsSecurity.hasNonce') !== 'false';

    if (!username || !password) {
      throw new InternalServerErrorException(
        'WS-Security is enabled but DIAN WS-Security credentials are missing',
      );
    }

    client.setSecurity(
      new soap.WSSecurity(username, password, {
        passwordType: 'PasswordText',
        mustUnderstand,
        hasTimeStamp,
        hasNonce,
      }),
    );
  }

  private getSoapTimeoutMs(): number {
    const configured = this.configService.get<number>('dian.soap.timeoutMs');
    return Number.isFinite(configured) && configured > 0 ? configured : 20000;
  }

  private getMaxRetries(): number {
    const configured = this.configService.get<number>('dian.soap.maxRetries');
    if (!Number.isFinite(configured) || configured < 0) {
      return 2;
    }
    return configured;
  }

  private getRetryBaseMs(): number {
    const configured = this.configService.get<number>('dian.soap.retryBaseMs');
    return Number.isFinite(configured) && configured > 0 ? configured : 400;
  }

  private getRetryMaxMs(): number {
    const configured = this.configService.get<number>('dian.soap.retryMaxMs');
    return Number.isFinite(configured) && configured > 0 ? configured : 4000;
  }

  private async executeWithRetry<T>(
    operation: string,
    correlationId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const maxRetries = this.getMaxRetries();
    const retryBaseMs = this.getRetryBaseMs();
    const retryMaxMs = this.getRetryMaxMs();

    let attempt = 0;
    let lastError: any;

    while (attempt <= maxRetries) {
      try {
        return await task();
      } catch (error) {
        lastError = error;
        const retryable = this.isRetryableError(error);
        const canRetry = retryable && attempt < maxRetries;

        this.logWarn('soap_operation_error', {
          correlationId,
          operation,
          attempt: attempt + 1,
          maxAttempts: maxRetries + 1,
          retryable,
          errorMessage: error?.message,
          errorCode: error?.code,
        });

        if (!canRetry) {
          break;
        }

        const waitMs = Math.min(retryMaxMs, retryBaseMs * 2 ** attempt + Math.floor(Math.random() * 250));
        await this.delay(waitMs);
        attempt += 1;
      }
    }

    throw lastError;
  }

  private isRetryableError(error: any): boolean {
    const retryableCodes = new Set([
      'ETIMEDOUT',
      'ESOCKETTIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'EAI_AGAIN',
      'ENOTFOUND',
      'EHOSTUNREACH',
      'SOAP_TIMEOUT',
    ]);

    if (retryableCodes.has(error?.code)) {
      return true;
    }

    const message = String(error?.message || '').toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('socket hang up') ||
      message.includes('temporarily unavailable') ||
      message.includes('econnreset')
    );
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const timeoutError: any = new Error(`SOAP ${operation} timed out after ${timeoutMs}ms`);
        timeoutError.code = 'SOAP_TIMEOUT';
        reject(timeoutError);
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  private newCorrelationId(): string {
    return randomUUID();
  }

  private logInfo(event: string, details: Record<string, any>): void {
    this.logger.log(JSON.stringify({ event, ...details }), 'DianService');
  }

  private logWarn(event: string, details: Record<string, any>): void {
    this.logger.warn(JSON.stringify({ event, ...details }), 'DianService');
  }

  private logError(event: string, error: any, details: Record<string, any>): void {
    const payload = {
      event,
      ...details,
      errorMessage: error?.message,
      errorCode: error?.code,
      stack: error?.stack,
    };
    this.logger.error(JSON.stringify(payload), undefined, 'DianService');
  }

}