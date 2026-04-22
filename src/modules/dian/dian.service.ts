import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as soap from 'soap';
import { zipXmlToBase64 } from '../../common/utils/zip.util';

interface SubmitInvoiceInput {
  invoiceNumber: string;
  xmlFileName: string;
  signedXml: string;
}

@Injectable()
export class DianService {
  constructor(private readonly configService: ConfigService) {}

  async submitInvoice(input: SubmitInvoiceInput): Promise<Record<string, any>> {
    const sendMode = this.configService.get<string>('dian.sendMode');
    const zipName = `${input.invoiceNumber}.zip`;
    const contentFile = zipXmlToBase64(input.xmlFileName, input.signedXml);
    const client = await this.createClient();

    try {
      if (sendMode === 'async') {
        const [response] = await client.SendBillAsyncAsync({
          fileName: zipName,
          contentFile,
        });

        return this.mapSubmissionResponse(response, zipName, true);
      }

      const [response] = await client.SendBillSyncAsync({
        fileName: zipName,
        contentFile,
      });

      return this.mapSubmissionResponse(response, zipName, false);
    } catch (error) {
      throw new InternalServerErrorException(`DIAN submission failed: ${error.message}`);
    }
  }

  async getStatus(trackId: string): Promise<Record<string, any>> {
    const client = await this.createClient();

    try {
      const [response] = await client.GetStatusAsync({ trackId });
      return this.mapStatusResponse(response);
    } catch (error) {
      throw new InternalServerErrorException(`DIAN GetStatus failed: ${error.message}`);
    }
  }

  private async createClient(): Promise<any> {
    const environment = this.configService.get<string>('dian.environment');
    const wsdl =
      environment === 'production'
        ? this.configService.get<string>('dian.wsdlProd')
        : this.configService.get<string>('dian.wsdlTest');

    const client = await soap.createClientAsync(wsdl, {
      endpoint: wsdl.replace('?wsdl', ''),
      forceSoap12Headers: true,
    });

    return client;
  }

  private mapSubmissionResponse(
    response: Record<string, any>,
    zipName: string,
    asyncMode: boolean,
  ): Record<string, any> {
    if (asyncMode) {
      const result = response?.SendBillAsyncResult || response?.sendBillAsyncResult || {};

      return {
        zipName,
        accepted: false,
        pending: true,
        rejected: false,
        trackId: result?.ZipKey || result?.zipKey,
        message: result?.Message || result?.message || 'Invoice submitted asynchronously to DIAN',
        raw: response,
      };
    }

    const result = response?.SendBillSyncResult || response?.sendBillSyncResult || {};
    const statusCode =
      result?.StatusCode ||
      result?.statusCode ||
      result?.['b:StatusCode'] ||
      result?.statusMessage?.statusCode ||
      '00';
    const statusMessage =
      result?.StatusDescription ||
      result?.statusDescription ||
      result?.StatusMessage ||
      result?.statusMessage ||
      'Processed';
    const errors =
      result?.ErrorMessage || result?.errorMessage || result?.ValidationErrors || result?.validationErrors;

    return {
      zipName,
      accepted: statusCode === '00',
      pending: false,
      rejected: statusCode !== '00',
      trackId: result?.XmlDocumentKey || result?.xmlDocumentKey || null,
      statusCode,
      message: statusMessage,
      errors: Array.isArray(errors) ? errors : errors ? [errors] : [],
      applicationResponse: result?.XmlBase64Bytes || result?.xmlBase64Bytes || null,
      raw: response,
    };
  }

  private mapStatusResponse(response: Record<string, any>): Record<string, any> {
    const result = response?.GetStatusResult || response?.getStatusResult || {};
    const errors = result?.ErrorMessage || result?.errorMessage || [];

    return {
      trackId: result?.ZipKey || result?.zipKey || null,
      statusCode: result?.StatusCode || result?.statusCode || null,
      statusDescription: result?.StatusDescription || result?.statusDescription || null,
      statusMessage: result?.StatusMessage || result?.statusMessage || null,
      documentKey: result?.XmlDocumentKey || result?.xmlDocumentKey || null,
      isValid: (result?.StatusCode || result?.statusCode) === '00',
      errors: Array.isArray(errors) ? errors : errors ? [errors] : [],
      raw: response,
    };
  }
}