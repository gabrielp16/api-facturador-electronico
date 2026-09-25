import { Injectable } from '@nestjs/common';

export interface DianSubmissionResponse {
  correlationId?: string;
  zipName: string;
  accepted: boolean;
  pending: boolean;
  rejected: boolean;
  trackId: string | null;
  statusCode?: string;
  message: string;
  errors: string[];
  applicationResponse?: string | null;
  raw: Record<string, any>;
}

export interface DianStatusResponse {
  correlationId?: string;
  trackId: string | null;
  statusCode: string | null;
  statusDescription: string | null;
  statusMessage: string | null;
  documentKey: string | null;
  isValid: boolean;
  errors: string[];
  applicationResponse?: string | null;
  raw: Record<string, any>;
}

@Injectable()
export class DianResponseParser {
  parseSubmissionResponse(input: {
    response: Record<string, any>;
    zipName: string;
    asyncMode: boolean;
    correlationId?: string;
  }): DianSubmissionResponse {
    if (input.asyncMode) {
      const result =
        input.response?.SendBillAsyncResult ||
        input.response?.sendBillAsyncResult ||
        input.response?.['b:SendBillAsyncResult'] ||
        {};

      return {
        correlationId: input.correlationId,
        zipName: input.zipName,
        accepted: false,
        pending: true,
        rejected: false,
        trackId: this.firstString(result, ['ZipKey', 'zipKey', 'TrackId', 'trackId']) || null,
        message:
          this.firstString(result, ['Message', 'message', 'StatusDescription', 'statusDescription']) ||
          'Invoice submitted asynchronously to DIAN',
        errors: this.normalizeErrors(
          result?.ErrorMessage || result?.errorMessage || result?.ValidationErrors || result?.validationErrors,
        ),
        applicationResponse: this.firstString(result, ['XmlBase64Bytes', 'xmlBase64Bytes']) || null,
        raw: input.response,
      };
    }

    const result =
      input.response?.SendBillSyncResult ||
      input.response?.sendBillSyncResult ||
      input.response?.['b:SendBillSyncResult'] ||
      {};

    const statusCode =
      this.firstString(result, ['StatusCode', 'statusCode', 'b:StatusCode']) ||
      result?.statusMessage?.statusCode ||
      '00';

    const statusMessage =
      this.firstString(result, ['StatusDescription', 'statusDescription', 'StatusMessage', 'statusMessage']) ||
      'Processed';

    return {
      correlationId: input.correlationId,
      zipName: input.zipName,
      accepted: statusCode === '00',
      pending: false,
      rejected: statusCode !== '00',
      trackId: this.firstString(result, ['XmlDocumentKey', 'xmlDocumentKey', 'TrackId', 'trackId']) || null,
      statusCode,
      message: statusMessage,
      errors: this.normalizeErrors(
        result?.ErrorMessage || result?.errorMessage || result?.ValidationErrors || result?.validationErrors,
      ),
      applicationResponse: this.firstString(result, ['XmlBase64Bytes', 'xmlBase64Bytes']) || null,
      raw: input.response,
    };
  }

  parseStatusResponse(input: {
    response: Record<string, any>;
    correlationId?: string;
  }): DianStatusResponse {
    const result =
      input.response?.GetStatusResult ||
      input.response?.getStatusResult ||
      input.response?.['b:GetStatusResult'] ||
      {};

    const statusCode = this.firstString(result, ['StatusCode', 'statusCode', 'b:StatusCode']) || null;

    return {
      correlationId: input.correlationId,
      trackId: this.firstString(result, ['ZipKey', 'zipKey', 'TrackId', 'trackId']) || null,
      statusCode,
      statusDescription: this.firstString(result, ['StatusDescription', 'statusDescription']) || null,
      statusMessage: this.firstString(result, ['StatusMessage', 'statusMessage']) || null,
      documentKey: this.firstString(result, ['XmlDocumentKey', 'xmlDocumentKey']) || null,
      isValid: statusCode === '00',
      errors: this.normalizeErrors(result?.ErrorMessage || result?.errorMessage),
      applicationResponse: this.firstString(result, ['XmlBase64Bytes', 'xmlBase64Bytes']) || null,
      raw: input.response,
    };
  }

  private firstString(source: Record<string, any>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = source?.[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  private normalizeErrors(value: any): string[] {
    if (!value) {
      return [];
    }

    if (Array.isArray(value)) {
      return value
        .map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry)))
        .filter((entry) => entry && entry !== '{}');
    }

    if (typeof value === 'string') {
      return [value];
    }

    return [JSON.stringify(value)];
  }
}
