export enum InvoiceLifecycleStatus {
  CREATED = 'CREATED',
  XML_GENERATED = 'XML_GENERATED',
  SIGNED = 'SIGNED',
  SUBMITTED = 'SUBMITTED',
  VALIDATED = 'VALIDATED',
  REJECTED = 'REJECTED',
}

export interface InvoiceTaxSummary {
  code: string;
  name: string;
  taxableAmount: number;
  amount: number;
  percent: number;
}

export interface InvoiceComputedItem {
  index: number;
  sku: string;
  description: string;
  quantity: number;
  unitCode: string;
  unitPrice: number;
  baseAmount: number;
  discountAmount: number;
  lineExtensionAmount: number;
  taxes: InvoiceTaxSummary[];
  totalAmount: number;
}

export interface InvoiceTotals {
  lineExtensionTotal: number;
  taxableTotal: number;
  taxTotal: number;
  allowanceTotal: number;
  payableAmount: number;
  taxByCode: InvoiceTaxSummary[];
}

export interface PreparedInvoice {
  invoiceNumber: string;
  resolutionPrefix: string;
  resolutionNumber: number;
  issueDate: string;
  issueTime: string;
  paymentDueDate: string;
  currencyCode: string;
  notes?: string[];
  saleOrderId: string;
  customer: Record<string, any>;
  items: InvoiceComputedItem[];
  totals: InvoiceTotals;
  sendEmail: boolean;
  metadata?: Record<string, any>;
}

export interface InvoiceProcessingResult {
  invoiceId: string;
  cufe: string;
  xml: string;
  signedXml: string;
  zipName: string;
  dian: Record<string, any>;
  pdfBase64: string;
  ticketBase64: string;
  status: InvoiceLifecycleStatus;
}