import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { InvoiceLifecycleStatus } from '../types/invoice.types';

export type InvoiceDocument = HydratedDocument<InvoiceRecord>;

@Schema({ collection: 'invoices', timestamps: true })
export class InvoiceRecord {
  @Prop({ required: true, unique: true })
  invoiceNumber: string;

  @Prop({ required: true })
  saleOrderId: string;

  @Prop({ required: true })
  cufe: string;

  @Prop({ required: true, enum: Object.values(InvoiceLifecycleStatus) })
  status: InvoiceLifecycleStatus;

  @Prop({ required: true, type: Object })
  requestPayload: Record<string, any>;

  @Prop({ required: true, type: Object })
  computedInvoice: Record<string, any>;

  @Prop({ required: true })
  xml: string;

  @Prop({ required: true })
  signedXml: string;

  @Prop({ required: true })
  zipName: string;

  @Prop({ required: true, type: Object })
  dianResponse: Record<string, any>;

  @Prop({ required: true })
  pdfBase64: string;

  @Prop({ required: true })
  ticketBase64: string;

  @Prop({ type: Object })
  mailResult?: Record<string, any>;
}

export const InvoiceSchema = SchemaFactory.createForClass(InvoiceRecord);

InvoiceSchema.index({ saleOrderId: 1 });
InvoiceSchema.index({ cufe: 1 });