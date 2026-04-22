import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument from 'pdfkit';
import { formatAmount } from '../../common/utils/number.util';
import { PreparedInvoice } from '../invoices/types/invoice.types';
import { QrService } from '../qr/qr.service';

interface GenerateArtifactsInput {
  preparedInvoice: PreparedInvoice;
  cufe: string;
  dianStatus: Record<string, any>;
}

@Injectable()
export class PdfService {
  constructor(
    private readonly configService: ConfigService,
    private readonly qrService: QrService,
  ) {}

  async generateInvoiceArtifacts(input: GenerateArtifactsInput): Promise<{
    pdfBase64: string;
    ticketBase64: string;
  }> {
    const qrPayload = [
      `Factura: ${input.preparedInvoice.invoiceNumber}`,
      `CUFE: ${input.cufe}`,
      `Cliente: ${input.preparedInvoice.customer.legalName}`,
      `Estado DIAN: ${input.dianStatus.message || input.dianStatus.statusDescription || 'Procesada'}`,
    ].join('\n');
    const qrBuffer = await this.qrService.toBuffer(qrPayload);
    const pdfBase64 = await this.buildA4InvoicePdf(input.preparedInvoice, input.cufe, input.dianStatus, qrBuffer);
    const ticketBase64 = await this.buildPosTicketPdf(input.preparedInvoice, input.cufe, input.dianStatus, qrBuffer);

    return { pdfBase64, ticketBase64 };
  }

  private async buildA4InvoicePdf(
    invoice: PreparedInvoice,
    cufe: string,
    dianStatus: Record<string, any>,
    qrBuffer: Buffer,
  ): Promise<string> {
    const document = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    document.on('data', (chunk) => chunks.push(chunk));

    document.fontSize(18).text('MORCHIS SAS', { align: 'left' });
    document.fontSize(10).text(`Factura electrónica ${invoice.invoiceNumber}`);
    document.text(`Fecha: ${invoice.issueDate} ${invoice.issueTime}`);
    document.text(`Cliente: ${invoice.customer.legalName}`);
    document.text(`Documento: ${invoice.customer.identificationType} ${invoice.customer.identificationNumber}`);
    document.moveDown();

    invoice.items.forEach((item) => {
      document
        .fontSize(10)
        .text(`${item.sku} - ${item.description}`)
        .text(
          `${item.quantity.toFixed(3)} x ${formatAmount(item.unitPrice)} = ${formatAmount(item.lineExtensionAmount)}`,
        );
      document.moveDown(0.5);
    });

    document.moveDown();
    document.text(`Subtotal: ${formatAmount(invoice.totals.lineExtensionTotal)}`);
    document.text(`IVA: ${formatAmount(invoice.totals.taxTotal)}`);
    document.text(`Total: ${formatAmount(invoice.totals.payableAmount)}`);
    document.text(`CUFE: ${cufe}`);
    document.text(`DIAN: ${dianStatus.message || dianStatus.statusDescription || 'Procesada'}`);
    document.image(qrBuffer, { fit: [140, 140], align: 'right' });
    document.end();

    return await new Promise<string>((resolve) => {
      document.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
    });
  }

  private async buildPosTicketPdf(
    invoice: PreparedInvoice,
    cufe: string,
    dianStatus: Record<string, any>,
    qrBuffer: Buffer,
  ): Promise<string> {
    const widthMm = this.configService.get<number>('pdf.printerWidthMm') || 80;
    const widthPt = (widthMm / 25.4) * 72;
    const heightPt = 700;
    const document = new PDFDocument({ size: [widthPt, heightPt], margin: 12 });
    const chunks: Buffer[] = [];

    document.on('data', (chunk) => chunks.push(chunk));

    document.fontSize(11).text('MORCHIS SAS', { align: 'center' });
    document.fontSize(8).text(`Factura ${invoice.invoiceNumber}`, { align: 'center' });
    document.text(`${invoice.issueDate} ${invoice.issueTime}`, { align: 'center' });
    document.moveDown(0.5);
    document.text(invoice.customer.legalName);
    document.text(`${invoice.customer.identificationType}: ${invoice.customer.identificationNumber}`);
    document.moveDown(0.5);

    invoice.items.forEach((item) => {
      document.text(item.description);
      document.text(
        `${item.quantity.toFixed(3)} x ${formatAmount(item.unitPrice)}  ${formatAmount(item.totalAmount)}`,
      );
    });

    document.moveDown(0.5);
    document.text(`Subtotal ${formatAmount(invoice.totals.lineExtensionTotal)}`);
    document.text(`IVA ${formatAmount(invoice.totals.taxTotal)}`);
    document.text(`Total ${formatAmount(invoice.totals.payableAmount)}`);
    document.text(`Estado ${dianStatus.message || dianStatus.statusDescription || 'Procesada'}`);
    document.text(`CUFE ${cufe}`);
    document.moveDown(0.5);
    document.image(qrBuffer, { fit: [120, 120], align: 'center' });
    document.end();

    return await new Promise<string>((resolve) => {
      document.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
    });
  }
}