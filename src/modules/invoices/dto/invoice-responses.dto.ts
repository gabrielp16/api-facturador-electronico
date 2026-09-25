import { ApiProperty } from '@nestjs/swagger';
import { InvoiceLifecycleStatus } from '../types/invoice.types';
import { InvoiceRecord } from '../schemas/invoice.schema';

export class DianSubmissionResponseDto {
  @ApiProperty({ example: 'SETP98001.zip' })
  zipName: string;

  @ApiProperty({ example: true })
  accepted: boolean;

  @ApiProperty({ example: false })
  pending: boolean;

  @ApiProperty({ example: false })
  rejected: boolean;

  @ApiProperty({ example: '79d8db7efc1f1d1fe0dcb7aaf5336e18f0eb6d8ff9c8cb2a8ec9db4dc6a1234' })
  trackId: string;

  @ApiProperty({ example: '00' })
  statusCode: string;

  @ApiProperty({ example: 'Procesado Correctamente.' })
  message: string;

  @ApiProperty({ type: [String], example: [] })
  errors: string[];

  @ApiProperty({
    example: 'PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4...',
  })
  applicationResponse?: string;
}

export class CreateInvoiceResponseDto {
  @ApiProperty({ example: 'SETP98001' })
  invoiceId: string;

  @ApiProperty({
    example: 'f9f6aa8d263b97e87e8f95dc31f63fe3f7f7049d2f0fd25f8f6a6aa25a8d541e',
  })
  cufe: string;

  @ApiProperty({ example: '<Invoice ...>...</Invoice>' })
  xml: string;

  @ApiProperty({ example: '<Invoice firmado ...>...</Invoice>' })
  signedXml: string;

  @ApiProperty({ example: 'SETP98001.zip' })
  zipName: string;

  @ApiProperty({ type: () => DianSubmissionResponseDto })
  dian: DianSubmissionResponseDto;

  @ApiProperty({ example: 'JVBERi0xLjQKJcTl8uXrp...' })
  pdfBase64: string;

  @ApiProperty({ example: 'JVBERi0xLjQKJcTl8uXrp...' })
  ticketBase64: string;

  @ApiProperty({ enum: InvoiceLifecycleStatus, example: InvoiceLifecycleStatus.VALIDATED })
  status: InvoiceLifecycleStatus;

  @ApiProperty({
    example: false,
    required: false,
    description: 'Indica si la respuesta fue reutilizada por idempotencia.',
  })
  idempotentReplay?: boolean;
}

export class DianStatusResponseDto extends DianSubmissionResponseDto {}

export class InvoiceListMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 125 })
  totalItems: number;

  @ApiProperty({ example: 7 })
  totalPages: number;
}

export class PaginatedInvoicesResponseDto {
  @ApiProperty({ type: () => [InvoiceRecord] })
  items: InvoiceRecord[];

  @ApiProperty({ type: () => InvoiceListMetaDto })
  meta: InvoiceListMetaDto;
}
