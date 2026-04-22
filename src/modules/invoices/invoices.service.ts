import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppLogger } from '../../common/logger/app-logger.service';
import { toDianDate, toDianTime } from '../../common/utils/date.util';
import { roundCurrency, safeNumber } from '../../common/utils/number.util';
import { DianService } from '../dian/dian.service';
import { MailService } from '../mail/mail.service';
import { PdfService } from '../pdf/pdf.service';
import { SigningService } from '../signing/signing.service';
import { UblService } from '../ubl/ubl.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceDocument, InvoiceRecord } from './schemas/invoice.schema';
import {
  InvoiceComputedItem,
  InvoiceLifecycleStatus,
  InvoiceProcessingResult,
  InvoiceTaxSummary,
  InvoiceTotals,
  PreparedInvoice,
} from './types/invoice.types';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectModel(InvoiceRecord.name)
    private readonly invoiceModel: Model<InvoiceDocument>,
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
    private readonly ublService: UblService,
    private readonly signingService: SigningService,
    private readonly dianService: DianService,
    private readonly pdfService: PdfService,
    private readonly mailService: MailService,
  ) {}

  async createFromSaleOrder(dto: CreateInvoiceDto): Promise<InvoiceProcessingResult> {
    const preparedInvoice = this.prepareInvoice(dto);
    const cufe = this.ublService.generateCufe(preparedInvoice);
    const xml = this.ublService.buildInvoiceXml(preparedInvoice, cufe);
    const signingResult = this.signingService.signXml(xml, preparedInvoice.invoiceNumber);
    const dianResponse = await this.dianService.submitInvoice({
      invoiceNumber: preparedInvoice.invoiceNumber,
      xmlFileName: `${preparedInvoice.invoiceNumber}.xml`,
      signedXml: signingResult.signedXml,
    });

    const pdfResult = await this.pdfService.generateInvoiceArtifacts({
      preparedInvoice,
      cufe,
      dianStatus: dianResponse,
    });

    let mailResult: Record<string, any> | undefined;
    if (preparedInvoice.sendEmail && preparedInvoice.customer.email) {
      mailResult = await this.mailService.sendInvoiceEmail({
        to: preparedInvoice.customer.email,
        subject: `Factura electrónica ${preparedInvoice.invoiceNumber}`,
        customerName: preparedInvoice.customer.legalName,
        invoiceNumber: preparedInvoice.invoiceNumber,
        cufe,
        pdfBase64: pdfResult.pdfBase64,
        xmlBase64: Buffer.from(signingResult.signedXml, 'utf8').toString('base64'),
      });
    }

    const lifecycleStatus = dianResponse.accepted
      ? InvoiceLifecycleStatus.VALIDATED
      : dianResponse.pending
        ? InvoiceLifecycleStatus.SUBMITTED
        : InvoiceLifecycleStatus.REJECTED;

    await this.invoiceModel.create({
      invoiceNumber: preparedInvoice.invoiceNumber,
      saleOrderId: preparedInvoice.saleOrderId,
      cufe,
      status: lifecycleStatus,
      requestPayload: dto,
      computedInvoice: preparedInvoice,
      xml,
      signedXml: signingResult.signedXml,
      zipName: dianResponse.zipName,
      dianResponse,
      pdfBase64: pdfResult.pdfBase64,
      ticketBase64: pdfResult.ticketBase64,
      mailResult,
    });

    return {
      invoiceId: preparedInvoice.invoiceNumber,
      cufe,
      xml,
      signedXml: signingResult.signedXml,
      zipName: dianResponse.zipName,
      dian: dianResponse,
      pdfBase64: pdfResult.pdfBase64,
      ticketBase64: pdfResult.ticketBase64,
      status: lifecycleStatus,
    };
  }

  async findByInvoiceNumber(invoiceNumber: string): Promise<InvoiceRecord> {
    const invoice = await this.invoiceModel.findOne({ invoiceNumber }).lean();

    if (!invoice) {
      throw new NotFoundException(`Invoice ${invoiceNumber} was not found`);
    }

    return invoice as InvoiceRecord;
  }

  async getDianStatus(trackId: string): Promise<Record<string, any>> {
    return this.dianService.getStatus(trackId);
  }

  private prepareInvoice(dto: CreateInvoiceDto): PreparedInvoice {
    this.validateResolution(dto.resolutionPrefix, dto.resolutionNumber);

    const issueDateTime = dto.issueDateTime ? new Date(dto.issueDateTime) : new Date();
    const paymentDateTime = dto.paymentDueDate ? new Date(dto.paymentDueDate) : issueDateTime;
    const invoiceNumber = `${dto.resolutionPrefix}${dto.resolutionNumber}`;
    const items = dto.items.map((item, index) => this.computeItem(item, index + 1));
    const totals = this.computeTotals(items);

    if (totals.payableAmount <= 0) {
      throw new BadRequestException('Invoice payable amount must be greater than zero');
    }

    this.logger.log(`Prepared invoice ${invoiceNumber} with payable ${totals.payableAmount}`, 'InvoicesService');

    return {
      invoiceNumber,
      resolutionPrefix: dto.resolutionPrefix,
      resolutionNumber: dto.resolutionNumber,
      issueDate: toDianDate(issueDateTime),
      issueTime: toDianTime(issueDateTime),
      paymentDueDate: toDianDate(paymentDateTime),
      currencyCode: dto.currencyCode || 'COP',
      notes: dto.notes,
      saleOrderId: dto.saleOrderId,
      customer: {
        ...dto.customer,
        municipalityCode: dto.customer.municipalityCode || dto.customer.cityCode,
        taxLevelCode: dto.customer.taxLevelCode || 'R-99-PN',
        taxSchemeId: dto.customer.taxSchemeId || '01',
        responsibilityCode: dto.customer.responsibilityCode || 'R-99-PN',
      },
      items,
      totals,
      sendEmail: dto.sendEmail !== false,
      metadata: {
        paymentMeansCode: dto.paymentMeansCode || '10',
        source: 'ERP_SALES_MODULE',
        ...dto.metadata,
      },
    };
  }

  private validateResolution(prefix: string, number: number): void {
    const resolution = this.configService.get('dian.resolution');

    if (prefix !== resolution.prefix) {
      throw new BadRequestException(
        `Resolution prefix ${prefix} does not match configured DIAN prefix ${resolution.prefix}`,
      );
    }

    if (number < resolution.from || number > resolution.to) {
      throw new BadRequestException(
        `Invoice consecutive ${number} is outside configured DIAN range ${resolution.from}-${resolution.to}`,
      );
    }
  }

  private computeItem(item: CreateInvoiceDto['items'][number], index: number): InvoiceComputedItem {
    const quantity = safeNumber(item.quantity);
    const unitPrice = safeNumber(item.unitPrice);
    const baseAmount = roundCurrency(quantity * unitPrice);
    const discountAmount = roundCurrency(safeNumber(item.discountAmount));
    const lineExtensionAmount = roundCurrency(baseAmount - discountAmount);

    if (lineExtensionAmount < 0) {
      throw new BadRequestException(`Discount exceeds line base amount on item ${item.sku}`);
    }

    const taxes: InvoiceTaxSummary[] = item.taxes.map((tax) => {
      const taxableAmount = roundCurrency(tax.taxableAmount ?? lineExtensionAmount);
      const amount = roundCurrency(tax.amount ?? (taxableAmount * safeNumber(tax.percent)) / 100);

      return {
        code: tax.code,
        name: tax.name,
        taxableAmount,
        amount,
        percent: safeNumber(tax.percent),
      };
    });

    return {
      index,
      sku: item.sku,
      description: item.description,
      quantity,
      unitCode: item.unitCode,
      unitPrice,
      baseAmount,
      discountAmount,
      lineExtensionAmount,
      taxes,
      totalAmount: roundCurrency(
        lineExtensionAmount + taxes.reduce((sum, tax) => sum + safeNumber(tax.amount), 0),
      ),
    };
  }

  private computeTotals(items: InvoiceComputedItem[]): InvoiceTotals {
    const taxMap = new Map<string, InvoiceTaxSummary>();

    const lineExtensionTotal = roundCurrency(
      items.reduce((sum, item) => sum + safeNumber(item.lineExtensionAmount), 0),
    );
    const allowanceTotal = roundCurrency(
      items.reduce((sum, item) => sum + safeNumber(item.discountAmount), 0),
    );

    items.forEach((item) => {
      item.taxes.forEach((tax) => {
        const existing = taxMap.get(tax.code);
        if (existing) {
          existing.taxableAmount = roundCurrency(existing.taxableAmount + tax.taxableAmount);
          existing.amount = roundCurrency(existing.amount + tax.amount);
        } else {
          taxMap.set(tax.code, { ...tax });
        }
      });
    });

    const taxByCode = Array.from(taxMap.values());
    const taxTotal = roundCurrency(taxByCode.reduce((sum, tax) => sum + tax.amount, 0));
    const payableAmount = roundCurrency(lineExtensionTotal + taxTotal);

    return {
      lineExtensionTotal,
      taxableTotal: lineExtensionTotal,
      taxTotal,
      allowanceTotal,
      payableAmount,
      taxByCode,
    };
  }
}