import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HydratedDocument } from 'mongoose';
import { InvoiceLifecycleStatus } from '../types/invoice.types';

export type InvoiceDocument = HydratedDocument<InvoiceRecord>;

@Schema({ collection: 'invoices', timestamps: true })
export class InvoiceRecord {
  @ApiProperty({ example: 'SETP98001' })
  @Prop({ type: String, required: true, unique: true })
  invoiceNumber: string;

  @ApiProperty({ example: 'SO-100245' })
  @Prop({ type: String, required: true })
  saleOrderId: string;

  @ApiProperty({
    example: 'f9f6aa8d263b97e87e8f95dc31f63fe3f7f7049d2f0fd25f8f6a6aa25a8d541e',
  })
  @Prop({ type: String, required: true })
  cufe: string;

  @ApiProperty({ enum: InvoiceLifecycleStatus, example: InvoiceLifecycleStatus.VALIDATED })
  @Prop({
    type: String,
    required: true,
    enum: Object.values(InvoiceLifecycleStatus),
  })
  status: InvoiceLifecycleStatus;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @Prop({ required: true, type: Object })
  requestPayload: Record<string, any>;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @Prop({ required: true, type: Object })
  computedInvoice: Record<string, any>;

  @ApiProperty({ example: '<Invoice ...>...</Invoice>' })
  @Prop({ type: String, required: true })
  xml: string;

  @ApiProperty({ example: '<Invoice firmado ...>...</Invoice>' })
  @Prop({ type: String, required: true })
  signedXml: string;

  @ApiProperty({ example: 'SETP98001.zip' })
  @Prop({ type: String, required: true })
  zipName: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @Prop({ required: true, type: Object })
  dianResponse: Record<string, any>;

  @ApiProperty({ example: 'JVBERi0xLjQKJcTl8uXrp...' })
  @Prop({ type: String, required: true })
  pdfBase64: string;

  @ApiProperty({ example: 'JVBERi0xLjQKJcTl8uXrp...' })
  @Prop({ type: String, required: true })
  ticketBase64: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @Prop({ type: Object })
  mailResult?: Record<string, any>;
}

export const InvoiceSchema = SchemaFactory.createForClass(InvoiceRecord);

InvoiceSchema.index({ saleOrderId: 1 });
InvoiceSchema.index({ cufe: 1 });