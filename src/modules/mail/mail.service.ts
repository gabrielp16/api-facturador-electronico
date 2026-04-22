import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

interface SendInvoiceEmailInput {
  to: string;
  subject: string;
  customerName: string;
  invoiceNumber: string;
  cufe: string;
  pdfBase64: string;
  xmlBase64: string;
}

@Injectable()
export class MailService {
  constructor(private readonly configService: ConfigService) {}

  async sendInvoiceEmail(input: SendInvoiceEmailInput): Promise<Record<string, any>> {
    try {
      const transporter = nodemailer.createTransport({
        host: this.configService.get<string>('mail.host'),
        port: this.configService.get<number>('mail.port'),
        secure: this.configService.get<boolean>('mail.secure'),
        auth: {
          user: this.configService.get<string>('mail.user'),
          pass: this.configService.get<string>('mail.pass'),
        },
      });

      const info = await transporter.sendMail({
        from: this.configService.get<string>('mail.from'),
        to: input.to,
        subject: input.subject,
        html: `
          <p>Estimado ${input.customerName},</p>
          <p>Adjuntamos la factura electrónica <strong>${input.invoiceNumber}</strong>.</p>
          <p>CUFE: ${input.cufe}</p>
          <p>Este mensaje fue generado automáticamente por el ERP Morchis.</p>
        `,
        attachments: [
          {
            filename: `${input.invoiceNumber}.pdf`,
            content: input.pdfBase64,
            encoding: 'base64',
          },
          {
            filename: `${input.invoiceNumber}.xml`,
            content: input.xmlBase64,
            encoding: 'base64',
          },
        ],
      });

      return {
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
        response: info.response,
      };
    } catch (error) {
      throw new InternalServerErrorException(`Invoice email delivery failed: ${error.message}`);
    }
  }
}