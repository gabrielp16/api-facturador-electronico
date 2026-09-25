import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppLogger } from '../../common/logger/app-logger.service';
import { toDianDate, toDianTime } from '../../common/utils/date.util';
import { roundCurrency, safeNumber } from '../../common/utils/number.util';
import { AttachedDocumentService } from '../attached-document/attached-document.service';
import { DianService } from '../dian/dian.service';
import { MailService } from '../mail/mail.service';
import { PdfService } from '../pdf/pdf.service';
import { SigningService } from '../signing/signing.service';
import { UblService } from '../ubl/ubl.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ApproveReprocessPolicyDto } from './dto/approve-reprocess-policy.dto';
import { RegisterPolicyDeploymentDto } from './dto/register-policy-deployment.dto';
import {
  buildRejectionMonthlyReportCsv,
  buildReprocessPolicyApprovalCsv,
  computeHmacSha256Base64,
  computeSha256Hex,
} from './monthly-report-csv.util';
import { ReprocessInvoiceDto } from './dto/reprocess-invoice.dto';
import {
  buildReprocessPolicyRecommendation,
  evaluateReprocessPolicy,
  extractDianRuleCodes,
  parseCsvToList,
  parseCsvToSet,
  RejectionCodeCount,
  ReprocessPolicyConfig,
} from './reprocess-policy.util';
import { InvoiceDocument, InvoiceRecord } from './schemas/invoice.schema';
import {
  ReprocessPolicyApprovalDocument,
  ReprocessPolicyApprovalRecord,
} from './schemas/reprocess-policy-approval.schema';
import {
  InvoiceComputedItem,
  InvoiceErrorEntry,
  InvoiceLifecycleStatus,
  InvoiceProcessingResult,
  InvoiceReprocessEntry,
  InvoiceTaxSummary,
  InvoiceTotals,
  InvoiceTransitionEntry,
  PreparedInvoice,
} from './types/invoice.types';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectModel(InvoiceRecord.name)
    private readonly invoiceModel: Model<InvoiceDocument>,
    @InjectModel(ReprocessPolicyApprovalRecord.name)
    private readonly reprocessPolicyApprovalModel: Model<ReprocessPolicyApprovalDocument>,
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
    private readonly ublService: UblService,
    private readonly signingService: SigningService,
    private readonly dianService: DianService,
    private readonly pdfService: PdfService,
    private readonly mailService: MailService,
    private readonly attachedDocumentService: AttachedDocumentService,
  ) {}

  async createFromSaleOrder(
    dto: CreateInvoiceDto,
    context?: { requestSource?: string; requestUser?: string },
  ): Promise<InvoiceProcessingResult> {
    this.assertNoManualCufeInput(dto);

    const invoiceNumber = `${dto.resolutionPrefix}${dto.resolutionNumber}`;
    const existingInvoice = await this.invoiceModel.findOne({ invoiceNumber }).lean();

    if (existingInvoice) {
      this.logger.warn(
        `Idempotent replay detected for ${invoiceNumber}. Returning stored invoice result.`,
        'InvoicesService',
      );
      return {
        invoiceId: existingInvoice.invoiceNumber,
        cufe: existingInvoice.cufe,
        xml: existingInvoice.xml,
        signedXml: existingInvoice.signedXml,
        zipName: existingInvoice.zipName,
        dian: existingInvoice.dianResponse,
        pdfBase64: existingInvoice.pdfBase64,
        ticketBase64: existingInvoice.ticketBase64,
        status: existingInvoice.status,
        idempotentReplay: true,
      };
    }

    const preparedInvoice = this.prepareInvoice(dto);
    const processStartedAt = new Date();
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

    const sentAt = new Date();
    const validatedAt = dianResponse.accepted ? new Date() : undefined;
    const attachedDocumentXml = this.attachedDocumentService.buildAttachedDocumentXml({
      invoiceNumber: preparedInvoice.invoiceNumber,
      cufe,
      signedXml: signingResult.signedXml,
      applicationResponse: dianResponse.applicationResponse,
      statusCode: dianResponse.statusCode,
      statusDescription: dianResponse.message,
      validatedAt,
    });
    const attachedDocumentBase64 = Buffer.from(attachedDocumentXml, 'utf8').toString('base64');

    let mailResult: Record<string, any> | undefined;
    let emailedAt: Date | undefined;
    if (preparedInvoice.sendEmail && preparedInvoice.customer.email) {
      mailResult = await this.mailService.sendInvoiceEmail({
        to: preparedInvoice.customer.email,
        subject: `Factura electrónica ${preparedInvoice.invoiceNumber}`,
        customerName: preparedInvoice.customer.legalName,
        invoiceNumber: preparedInvoice.invoiceNumber,
        cufe,
        pdfBase64: pdfResult.pdfBase64,
        xmlBase64: Buffer.from(signingResult.signedXml, 'utf8').toString('base64'),
        attachedDocumentBase64,
      });
      emailedAt = new Date();
    }

    const lifecycleStatus = dianResponse.accepted
      ? mailResult
        ? InvoiceLifecycleStatus.EMAILED
        : InvoiceLifecycleStatus.PDF_GENERATED
      : dianResponse.pending
        ? InvoiceLifecycleStatus.SENT
        : InvoiceLifecycleStatus.REJECTED;

    const transitionHistory: InvoiceTransitionEntry[] = [
      { status: InvoiceLifecycleStatus.CREATED, at: processStartedAt, note: 'Invoice request accepted' },
      { status: InvoiceLifecycleStatus.XML_GENERATED, at: new Date(), note: 'UBL XML generated' },
      { status: InvoiceLifecycleStatus.SIGNED, at: new Date(), note: 'Invoice XML signed' },
      { status: InvoiceLifecycleStatus.SENDING, at: new Date(), note: 'Submitting invoice to DIAN' },
      {
        status: dianResponse.pending
          ? InvoiceLifecycleStatus.SENT
          : dianResponse.accepted
            ? InvoiceLifecycleStatus.VALIDATED
            : InvoiceLifecycleStatus.REJECTED,
        at: sentAt,
        note: dianResponse.message || 'DIAN submission response processed',
      },
      { status: InvoiceLifecycleStatus.PDF_GENERATED, at: new Date(), note: 'PDF artifacts generated' },
    ];

    if (mailResult) {
      transitionHistory.push({
        status: InvoiceLifecycleStatus.EMAILED,
        at: emailedAt || new Date(),
        note: 'Invoice email sent with attachments',
      });
    }

    const errors: InvoiceErrorEntry[] = (dianResponse.errors || []).map((entry: any) => ({
      code: dianResponse.statusCode,
      description: typeof entry === 'string' ? entry : JSON.stringify(entry),
      source: 'DIAN',
      raw: entry,
    }));

    if (lifecycleStatus === InvoiceLifecycleStatus.REJECTED && !errors.length) {
      errors.push({
        code: dianResponse.statusCode,
        description: dianResponse.message || 'DIAN rejected invoice',
        source: 'DIAN',
      });
    }

    const dianStatusCode = String(dianResponse.statusCode || '').trim() || undefined;
    const dianRuleCodes = extractDianRuleCodes(errors.map((entry) => entry.raw || entry.description));

    const requestSource =
      context?.requestSource?.trim() ||
      (typeof dto.metadata?.source === 'string' ? dto.metadata.source : '') ||
      'ERP_SALES_MODULE';
    const requestUser = context?.requestUser?.trim() || 'unknown';

    try {
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
        dianStatusCode,
        dianRuleCodes,
        applicationResponse: dianResponse.applicationResponse || undefined,
        responseXml: dianResponse.raw ? JSON.stringify(dianResponse.raw) : undefined,
        attachedDocumentXml,
        pdfBase64: pdfResult.pdfBase64,
        ticketBase64: pdfResult.ticketBase64,
        mailResult,
        sentAt,
        validatedAt,
        emailedAt,
        errors,
        transitionHistory,
        requestSource,
        requestUser,
      });
    } catch (error) {
      if (error?.code === 11000) {
        throw new ConflictException(
          `Invoice ${preparedInvoice.invoiceNumber} already exists. Replay prevented by idempotency guard.`,
        );
      }
      throw error;
    }

    return {
      invoiceId: preparedInvoice.invoiceNumber,
      cufe,
      xml,
      signedXml: signingResult.signedXml,
      attachedDocumentXml,
      zipName: dianResponse.zipName,
      dian: dianResponse,
      pdfBase64: pdfResult.pdfBase64,
      ticketBase64: pdfResult.ticketBase64,
      status: lifecycleStatus,
      idempotentReplay: false,
    };
  }

  private assertNoManualCufeInput(dto: CreateInvoiceDto): void {
    const metadata = dto.metadata || {};
    const hasManualCufe =
      metadata.cufe !== undefined ||
      metadata.cufeManual !== undefined ||
      metadata.manualCufe !== undefined ||
      metadata.uuid !== undefined;

    if (!hasManualCufe) {
      return;
    }

    const nodeEnv = this.configService.get<string>('app.nodeEnv');

    if (nodeEnv === 'production') {
      throw new BadRequestException(
        'Manual CUFE/UUID input is not allowed in production invoice emission.',
      );
    }

    this.logger.warn(
      'Manual CUFE-like metadata was provided in non-production mode. It will be ignored and recalculated.',
      'InvoicesService',
    );
  }

  async findByInvoiceNumber(invoiceNumber: string): Promise<InvoiceRecord> {
    const invoice = await this.invoiceModel.findOne({ invoiceNumber }).lean();

    if (!invoice) {
      throw new NotFoundException(`Invoice ${invoiceNumber} was not found`);
    }

    return invoice as InvoiceRecord;
  }

  async findAll(
    page = 1,
    limit = 20,
    filters?: {
      status?: InvoiceLifecycleStatus;
      invoiceNumber?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ): Promise<{
    items: InvoiceRecord[];
    meta: { page: number; limit: number; totalItems: number; totalPages: number };
  }> {
    if (page < 1) {
      throw new BadRequestException('Query param page must be greater than or equal to 1');
    }

    if (limit < 1 || limit > 100) {
      throw new BadRequestException('Query param limit must be between 1 and 100');
    }

    const query: Record<string, any> = {};

    if (filters?.status) {
      if (!Object.values(InvoiceLifecycleStatus).includes(filters.status)) {
        throw new BadRequestException('Query param status is not a valid invoice status');
      }
      query.status = filters.status;
    }

    if (filters?.invoiceNumber) {
      query.invoiceNumber = {
        $regex: this.escapeRegex(filters.invoiceNumber.trim()),
        $options: 'i',
      };
    }

    if (filters?.dateFrom || filters?.dateTo) {
      const createdAtRange: Record<string, Date> = {};

      if (filters?.dateFrom) {
        const parsedFrom = new Date(filters.dateFrom);
        if (Number.isNaN(parsedFrom.getTime())) {
          throw new BadRequestException('Query param dateFrom has invalid date format');
        }
        createdAtRange.$gte = parsedFrom;
      }

      if (filters?.dateTo) {
        const parsedTo = new Date(filters.dateTo);
        if (Number.isNaN(parsedTo.getTime())) {
          throw new BadRequestException('Query param dateTo has invalid date format');
        }

        const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
        if (dateOnlyPattern.test(filters.dateTo)) {
          parsedTo.setHours(23, 59, 59, 999);
        }

        createdAtRange.$lte = parsedTo;
      }

      if (createdAtRange.$gte && createdAtRange.$lte && createdAtRange.$gte > createdAtRange.$lte) {
        throw new BadRequestException('Query params dateFrom/dateTo define an invalid range');
      }

      query.createdAt = createdAtRange;
    }

    const skip = (page - 1) * limit;

    const [items, totalItems] = await Promise.all([
      this.invoiceModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.invoiceModel.countDocuments(query),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    return {
      items: items as InvoiceRecord[],
      meta: {
        page,
        limit,
        totalItems,
        totalPages,
      },
    };
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async getDianStatus(trackId: string): Promise<Record<string, any>> {
    return this.dianService.getStatus(trackId);
  }

  async getRejectionCatalogSummary(limit = 20): Promise<{
    totalRejectedInvoices: number;
    topStatusCodes: Array<{ code: string; count: number }>;
    topRuleCodes: Array<{ code: string; count: number }>;
    generatedAt: string;
  }> {
    const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 20;

    const [statusCodes, ruleCodes, totalRejectedInvoices] = await Promise.all([
      this.invoiceModel
        .aggregate([
          { $match: { status: InvoiceLifecycleStatus.REJECTED, dianStatusCode: { $exists: true, $ne: '' } } },
          { $group: { _id: '$dianStatusCode', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: normalizedLimit },
        ])
        .exec(),
      this.invoiceModel
        .aggregate([
          { $match: { status: InvoiceLifecycleStatus.REJECTED, dianRuleCodes: { $exists: true, $ne: [] } } },
          { $unwind: '$dianRuleCodes' },
          { $group: { _id: '$dianRuleCodes', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: normalizedLimit },
        ])
        .exec(),
      this.invoiceModel.countDocuments({ status: InvoiceLifecycleStatus.REJECTED }),
    ]);

    return {
      totalRejectedInvoices,
      topStatusCodes: statusCodes.map((entry) => ({ code: String(entry._id), count: Number(entry.count || 0) })),
      topRuleCodes: ruleCodes.map((entry) => ({ code: String(entry._id), count: Number(entry.count || 0) })),
      generatedAt: new Date().toISOString(),
    };
  }

  async getRejectionPolicyRecommendation(input?: {
    statusMinOccurrences?: number;
    rulePrefixMinOccurrences?: number;
    rulePrefixLength?: number;
    limit?: number;
  }): Promise<{
    totalRejectedInvoices: number;
    sampledTopStatusCodes: RejectionCodeCount[];
    sampledTopRuleCodes: RejectionCodeCount[];
    recommendation: {
      blockedStatusCodes: string[];
      blockedRulePrefixes: string[];
    };
    thresholds: {
      statusMinOccurrences: number;
      rulePrefixMinOccurrences: number;
      rulePrefixLength: number;
    };
    envSnippet: string[];
    generatedAt: string;
  }> {
    const normalizedLimit = Number.isFinite(input?.limit)
      ? Math.max(20, Math.min(Number(input?.limit), 500))
      : 200;
    const statusMinOccurrences = Number.isFinite(input?.statusMinOccurrences)
      ? Math.max(1, Number(input?.statusMinOccurrences))
      : 5;
    const rulePrefixMinOccurrences = Number.isFinite(input?.rulePrefixMinOccurrences)
      ? Math.max(1, Number(input?.rulePrefixMinOccurrences))
      : 8;
    const rulePrefixLength = Number.isFinite(input?.rulePrefixLength)
      ? Math.max(2, Math.min(Number(input?.rulePrefixLength), 8))
      : 3;

    const catalog = await this.getRejectionCatalogSummary(normalizedLimit);
    const recommendation = buildReprocessPolicyRecommendation({
      statusCodes: catalog.topStatusCodes,
      ruleCodes: catalog.topRuleCodes,
      statusMinOccurrences,
      rulePrefixMinOccurrences,
      rulePrefixLength,
    });

    return {
      totalRejectedInvoices: catalog.totalRejectedInvoices,
      sampledTopStatusCodes: catalog.topStatusCodes,
      sampledTopRuleCodes: catalog.topRuleCodes,
      recommendation,
      thresholds: {
        statusMinOccurrences,
        rulePrefixMinOccurrences,
        rulePrefixLength,
      },
      envSnippet: [
        `DIAN_REPROCESS_BLOCKED_STATUS_CODES=${recommendation.blockedStatusCodes.join(',')}`,
        `DIAN_REPROCESS_BLOCKED_RULE_PREFIXES=${recommendation.blockedRulePrefixes.join(',')}`,
      ],
      generatedAt: new Date().toISOString(),
    };
  }

  async getRejectionMonthlyReport(input?: {
    year?: number;
    month?: number;
    recommendationLimit?: number;
    statusMinOccurrences?: number;
    rulePrefixMinOccurrences?: number;
    rulePrefixLength?: number;
  }): Promise<{
    period: {
      year: number;
      month: number;
      from: string;
      toExclusive: string;
    };
    governance: {
      totalInvoicesInMonth: number;
      rejectedInvoicesInMonth: number;
      rejectionRatePercent: number;
      approvalsInMonth: number;
      deploymentsInMonth: number;
      deploymentsByEnvironment: Array<{ environment: string; count: number }>;
    };
    recommendation: {
      totalRejectedInvoices: number;
      sampledTopStatusCodes: RejectionCodeCount[];
      sampledTopRuleCodes: RejectionCodeCount[];
      recommendation: {
        blockedStatusCodes: string[];
        blockedRulePrefixes: string[];
      };
      thresholds: {
        statusMinOccurrences: number;
        rulePrefixMinOccurrences: number;
        rulePrefixLength: number;
      };
      envSnippet: string[];
      generatedAt: string;
    };
    approvals: Array<{
      version: string;
      approvedAt: Date;
      approvedBy?: string;
      approvalTicket?: string;
      deploymentsInMonth: number;
    }>;
    recentDeployments: Array<{
      version: string;
      environment: string;
      deployedAt: Date;
      deployedBy?: string;
      changeTicket?: string;
      requestSource?: string;
      requestUser?: string;
    }>;
    latestApprovedSnapshot: ReprocessPolicyApprovalRecord | null;
    generatedAt: string;
  }> {
    const now = new Date();
    const year = Number.isFinite(input?.year) ? Math.trunc(Number(input?.year)) : now.getUTCFullYear();
    const month = Number.isFinite(input?.month) ? Math.trunc(Number(input?.month)) : now.getUTCMonth() + 1;

    if (year < 2000 || year > 2100) {
      throw new BadRequestException('year must be between 2000 and 2100');
    }

    if (month < 1 || month > 12) {
      throw new BadRequestException('month must be between 1 and 12');
    }

    const fromDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const toExclusiveDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

    const recommendationPromise = this.getRejectionPolicyRecommendation({
      limit: input?.recommendationLimit,
      statusMinOccurrences: input?.statusMinOccurrences,
      rulePrefixMinOccurrences: input?.rulePrefixMinOccurrences,
      rulePrefixLength: input?.rulePrefixLength,
    });

    const [
      totalInvoicesInMonth,
      rejectedInvoicesInMonth,
      approvalsInMonthDocs,
      latestApprovedSnapshot,
      deploymentsByEnvironment,
      recentDeployments,
      recommendation,
    ] = await Promise.all([
      this.invoiceModel.countDocuments({ createdAt: { $gte: fromDate, $lt: toExclusiveDate } }),
      this.invoiceModel.countDocuments({
        createdAt: { $gte: fromDate, $lt: toExclusiveDate },
        status: InvoiceLifecycleStatus.REJECTED,
      }),
      this.reprocessPolicyApprovalModel
        .find({ approvedAt: { $gte: fromDate, $lt: toExclusiveDate } })
        .sort({ approvedAt: -1 })
        .lean(),
      this.reprocessPolicyApprovalModel.findOne({ approvedAt: { $lte: toExclusiveDate } }).sort({ approvedAt: -1 }).lean(),
      this.reprocessPolicyApprovalModel
        .aggregate([
          { $unwind: '$deployments' },
          { $match: { 'deployments.deployedAt': { $gte: fromDate, $lt: toExclusiveDate } } },
          { $group: { _id: '$deployments.environment', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .exec(),
      this.reprocessPolicyApprovalModel
        .aggregate([
          { $unwind: '$deployments' },
          { $match: { 'deployments.deployedAt': { $gte: fromDate, $lt: toExclusiveDate } } },
          {
            $project: {
              _id: 0,
              version: '$version',
              environment: '$deployments.environment',
              deployedAt: '$deployments.deployedAt',
              deployedBy: '$deployments.deployedBy',
              changeTicket: '$deployments.changeTicket',
              requestSource: '$deployments.requestSource',
              requestUser: '$deployments.requestUser',
            },
          },
          { $sort: { deployedAt: -1 } },
          { $limit: 25 },
        ])
        .exec(),
      recommendationPromise,
    ]);

    const approvals = (approvalsInMonthDocs as any[]).map((approval) => {
      const deploymentsInMonth = ((approval.deployments || []) as any[]).filter((deployment) => {
        const deployedAt = deployment?.deployedAt ? new Date(deployment.deployedAt) : null;
        return deployedAt && deployedAt >= fromDate && deployedAt < toExclusiveDate;
      }).length;

      return {
        version: approval.version,
        approvedAt: approval.approvedAt,
        approvedBy: approval.approvedBy,
        approvalTicket: approval.approvalTicket,
        deploymentsInMonth,
      };
    });

    const deploymentsInMonth = deploymentsByEnvironment.reduce(
      (acc, item) => acc + Number(item.count || 0),
      0,
    );
    const rejectionRatePercent =
      totalInvoicesInMonth > 0
        ? Math.round((rejectedInvoicesInMonth / totalInvoicesInMonth) * 10000) / 100
        : 0;

    return {
      period: {
        year,
        month,
        from: fromDate.toISOString(),
        toExclusive: toExclusiveDate.toISOString(),
      },
      governance: {
        totalInvoicesInMonth,
        rejectedInvoicesInMonth,
        rejectionRatePercent,
        approvalsInMonth: approvals.length,
        deploymentsInMonth,
        deploymentsByEnvironment: deploymentsByEnvironment.map((entry) => ({
          environment: String(entry._id || 'unknown'),
          count: Number(entry.count || 0),
        })),
      },
      recommendation,
      approvals,
      recentDeployments: recentDeployments as Array<{
        version: string;
        environment: string;
        deployedAt: Date;
        deployedBy?: string;
        changeTicket?: string;
        requestSource?: string;
        requestUser?: string;
      }>,
      latestApprovedSnapshot: (latestApprovedSnapshot as ReprocessPolicyApprovalRecord) || null,
      generatedAt: new Date().toISOString(),
    };
  }

  async getRejectionMonthlyReportCsv(input?: {
    year?: number;
    month?: number;
    recommendationLimit?: number;
    statusMinOccurrences?: number;
    rulePrefixMinOccurrences?: number;
    rulePrefixLength?: number;
  }): Promise<{
    csv: string;
    sha256: string;
    signature?: string;
    signatureAlgorithm?: string;
    signatureKeyId?: string;
  }> {
    const report = await this.getRejectionMonthlyReport(input);
    const csv = buildRejectionMonthlyReportCsv(report);
    const signing = this.getCsvSigningConfig();

    const result: {
      csv: string;
      sha256: string;
      signature?: string;
      signatureAlgorithm?: string;
      signatureKeyId?: string;
    } = {
      csv,
      sha256: computeSha256Hex(csv),
    };

    if (signing.enabled) {
      result.signature = computeHmacSha256Base64(csv, signing.hmacSecret);
      result.signatureAlgorithm = 'hmac-sha256-base64';
      result.signatureKeyId = signing.keyId;
    }

    return result;
  }

  async approveReprocessPolicy(
    dto: ApproveReprocessPolicyDto,
    context?: { requestSource?: string; requestUser?: string },
  ): Promise<ReprocessPolicyApprovalRecord> {
    const recommendation = await this.getRejectionPolicyRecommendation({
      limit: dto.sampleLimit,
      statusMinOccurrences: dto.statusMinOccurrences,
      rulePrefixMinOccurrences: dto.rulePrefixMinOccurrences,
      rulePrefixLength: dto.rulePrefixLength,
    });

    const blockedStatusCodes = (dto.blockedStatusCodes || recommendation.recommendation.blockedStatusCodes)
      .map((entry) => entry.trim().toUpperCase())
      .filter(Boolean);
    const blockedRulePrefixes = (dto.blockedRulePrefixes || recommendation.recommendation.blockedRulePrefixes)
      .map((entry) => entry.trim().toUpperCase())
      .filter(Boolean);

    const approvedAt = new Date();
    const version = `RPA-${approvedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`;

    const record = await this.reprocessPolicyApprovalModel.create({
      version,
      approvalTicket: dto.approvalTicket,
      approvedBy: dto.approvedBy,
      blockedStatusCodes: Array.from(new Set(blockedStatusCodes)),
      blockedRulePrefixes: Array.from(new Set(blockedRulePrefixes)),
      statusMinOccurrences: recommendation.thresholds.statusMinOccurrences,
      rulePrefixMinOccurrences: recommendation.thresholds.rulePrefixMinOccurrences,
      rulePrefixLength: recommendation.thresholds.rulePrefixLength,
      sampleLimit: Number(dto.sampleLimit || 200),
      envSnippet: [
        `DIAN_REPROCESS_BLOCKED_STATUS_CODES=${Array.from(new Set(blockedStatusCodes)).join(',')}`,
        `DIAN_REPROCESS_BLOCKED_RULE_PREFIXES=${Array.from(new Set(blockedRulePrefixes)).join(',')}`,
      ],
      sampledTopStatusCodes: recommendation.sampledTopStatusCodes,
      sampledTopRuleCodes: recommendation.sampledTopRuleCodes,
      totalRejectedInvoices: recommendation.totalRejectedInvoices,
      notes: dto.notes,
      requestSource: context?.requestSource?.trim() || 'POLICY_APPROVAL_WORKFLOW',
      requestUser: context?.requestUser?.trim() || dto.approvedBy || 'unknown',
      approvedAt,
    });

    this.logger.log(
      `Reprocess policy approval snapshot saved: version=${version}, approvedBy=${record.approvedBy || 'n/a'}`,
      'InvoicesService',
    );

    return record.toObject();
  }

  async getLatestReprocessPolicyApproval(): Promise<ReprocessPolicyApprovalRecord | null> {
    const latest = await this.reprocessPolicyApprovalModel.findOne().sort({ approvedAt: -1, createdAt: -1 }).lean();
    return (latest as ReprocessPolicyApprovalRecord) || null;
  }

  async getReprocessPolicyApprovalByVersion(
    version: string,
  ): Promise<ReprocessPolicyApprovalRecord> {
    const normalizedVersion = version.trim();
    const snapshot = await this.reprocessPolicyApprovalModel.findOne({ version: normalizedVersion }).lean();

    if (!snapshot) {
      throw new NotFoundException(`Reprocess policy approval version ${normalizedVersion} was not found`);
    }

    return snapshot as ReprocessPolicyApprovalRecord;
  }

  async getReprocessPolicyApprovalCsvByVersion(version: string): Promise<{
    csv: string;
    sha256: string;
    signature?: string;
    signatureAlgorithm?: string;
    signatureKeyId?: string;
  }> {
    const snapshot = await this.getReprocessPolicyApprovalByVersion(version);
    const csv = buildReprocessPolicyApprovalCsv(
      snapshot as unknown as Parameters<typeof buildReprocessPolicyApprovalCsv>[0],
    );
    const signing = this.getCsvSigningConfig();

    const result: {
      csv: string;
      sha256: string;
      signature?: string;
      signatureAlgorithm?: string;
      signatureKeyId?: string;
    } = {
      csv,
      sha256: computeSha256Hex(csv),
    };

    if (signing.enabled) {
      result.signature = computeHmacSha256Base64(csv, signing.hmacSecret);
      result.signatureAlgorithm = 'hmac-sha256-base64';
      result.signatureKeyId = signing.keyId;
    }

    return result;
  }

  async registerReprocessPolicyDeployment(
    version: string,
    dto?: RegisterPolicyDeploymentDto,
    context?: { requestSource?: string; requestUser?: string },
  ): Promise<ReprocessPolicyApprovalRecord> {
    const normalizedVersion = version.trim();
    const snapshot = await this.reprocessPolicyApprovalModel.findOne({ version: normalizedVersion }).lean();

    if (!snapshot) {
      throw new NotFoundException(`Reprocess policy approval version ${normalizedVersion} was not found`);
    }

    const envSnippet = (dto?.envSnippet?.length ? dto.envSnippet : snapshot.envSnippet || [])
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (!envSnippet.length) {
      throw new BadRequestException(
        `Version ${normalizedVersion} does not have envSnippet and no deployment envSnippet was provided`,
      );
    }

    const deploymentRecord = {
      environment: dto?.environment?.trim() || 'production',
      deployedAt: new Date(),
      deployedBy: dto?.deployedBy?.trim() || context?.requestUser?.trim() || 'unknown',
      changeTicket: dto?.changeTicket?.trim(),
      requestSource: context?.requestSource?.trim() || 'POLICY_DEPLOYMENT_WORKFLOW',
      requestUser: context?.requestUser?.trim() || 'unknown',
      envSnippet: Array.from(new Set(envSnippet)),
      notes: dto?.notes?.trim(),
    };

    const updated = await this.reprocessPolicyApprovalModel
      .findOneAndUpdate(
        { version: normalizedVersion },
        { $push: { deployments: deploymentRecord } },
        { new: true },
      )
      .lean();

    if (!updated) {
      throw new NotFoundException(`Reprocess policy approval version ${normalizedVersion} was not found`);
    }

    this.logger.log(
      `Reprocess policy deployment recorded: version=${normalizedVersion}, env=${deploymentRecord.environment}, ticket=${deploymentRecord.changeTicket || 'n/a'}`,
      'InvoicesService',
    );

    return updated as ReprocessPolicyApprovalRecord;
  }

  async reprocessRejectedInvoice(
    invoiceNumber: string,
    input?: ReprocessInvoiceDto,
    context?: { requestSource?: string; requestUser?: string },
  ): Promise<InvoiceProcessingResult> {
    const existingInvoice = await this.invoiceModel.findOne({ invoiceNumber }).lean();

    if (!existingInvoice) {
      throw new NotFoundException(`Invoice ${invoiceNumber} was not found`);
    }

    if (existingInvoice.status !== InvoiceLifecycleStatus.REJECTED) {
      throw new BadRequestException(
        `Invoice ${invoiceNumber} must be in REJECTED status to be reprocessed`,
      );
    }

    const reprocessPolicy = this.getReprocessPolicyConfig();
    const policyDecision = evaluateReprocessPolicy({
      statusCode: existingInvoice?.dianResponse?.statusCode,
      errors: existingInvoice?.errors || existingInvoice?.dianResponse?.errors || [],
      config: reprocessPolicy,
    });

    const hasOperationalApproval = Boolean(input?.approvalTicket?.trim() && input?.approvedBy?.trim());
    if (policyDecision.blocked && reprocessPolicy.requireApprovalForBlocked && !hasOperationalApproval) {
      throw new BadRequestException(
        `Invoice ${invoiceNumber} is blocked by reprocess policy (${policyDecision.reason}). ` +
          'Provide approvalTicket and approvedBy to continue with operational override.',
      );
    }

    if (policyDecision.blocked && hasOperationalApproval) {
      this.logger.warn(
        `Operational override approved for invoice ${invoiceNumber}: ${policyDecision.reason}. ` +
          `approvedBy=${input?.approvedBy}`,
        'InvoicesService',
      );
    }

    const basePayload =
      (input?.payload as CreateInvoiceDto | undefined) ||
      (existingInvoice.requestPayload as CreateInvoiceDto | undefined);

    if (!basePayload) {
      throw new BadRequestException(
        `Invoice ${invoiceNumber} does not have a persisted request payload to reprocess`,
      );
    }

    const expectedInvoiceNumber = `${basePayload.resolutionPrefix}${basePayload.resolutionNumber}`;
    if (expectedInvoiceNumber !== invoiceNumber) {
      throw new BadRequestException(
        `Reprocess payload does not match target invoice number ${invoiceNumber}`,
      );
    }

    const payload: CreateInvoiceDto = {
      ...basePayload,
      sendEmail: input?.sendEmail ?? basePayload.sendEmail,
      metadata: {
        ...(basePayload.metadata || {}),
        reprocess: true,
        reprocessReason: input?.reason,
        reprocessApprovalTicket: input?.approvalTicket,
        reprocessApprovedBy: input?.approvedBy,
        reprocessPolicyDecision: policyDecision.reason || 'ALLOWED',
      },
    };

    this.assertNoManualCufeInput(payload);

    const processStartedAt = new Date();
    const preparedInvoice = this.prepareInvoice(payload);
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

    const sentAt = new Date();
    const validatedAt = dianResponse.accepted ? new Date() : undefined;
    const attachedDocumentXml = this.attachedDocumentService.buildAttachedDocumentXml({
      invoiceNumber: preparedInvoice.invoiceNumber,
      cufe,
      signedXml: signingResult.signedXml,
      applicationResponse: dianResponse.applicationResponse,
      statusCode: dianResponse.statusCode,
      statusDescription: dianResponse.message,
      validatedAt,
    });
    const attachedDocumentBase64 = Buffer.from(attachedDocumentXml, 'utf8').toString('base64');

    let mailResult: Record<string, any> | undefined;
    let emailedAt: Date | undefined;
    if (preparedInvoice.sendEmail && preparedInvoice.customer.email) {
      mailResult = await this.mailService.sendInvoiceEmail({
        to: preparedInvoice.customer.email,
        subject: `Factura electrónica ${preparedInvoice.invoiceNumber}`,
        customerName: preparedInvoice.customer.legalName,
        invoiceNumber: preparedInvoice.invoiceNumber,
        cufe,
        pdfBase64: pdfResult.pdfBase64,
        xmlBase64: Buffer.from(signingResult.signedXml, 'utf8').toString('base64'),
        attachedDocumentBase64,
      });
      emailedAt = new Date();
    }

    const lifecycleStatus = dianResponse.accepted
      ? mailResult
        ? InvoiceLifecycleStatus.EMAILED
        : InvoiceLifecycleStatus.PDF_GENERATED
      : dianResponse.pending
        ? InvoiceLifecycleStatus.SENT
        : InvoiceLifecycleStatus.REJECTED;

    const transitionHistory: InvoiceTransitionEntry[] = [
      ...((existingInvoice.transitionHistory as InvoiceTransitionEntry[]) || []),
      {
        status: InvoiceLifecycleStatus.PENDING,
        at: processStartedAt,
        note: 'Invoice entered reprocess flow',
      },
      { status: InvoiceLifecycleStatus.XML_GENERATED, at: new Date(), note: 'UBL XML regenerated' },
      { status: InvoiceLifecycleStatus.SIGNED, at: new Date(), note: 'Invoice XML re-signed' },
      { status: InvoiceLifecycleStatus.SENDING, at: new Date(), note: 'Re-submitting invoice to DIAN' },
      {
        status: dianResponse.pending
          ? InvoiceLifecycleStatus.SENT
          : dianResponse.accepted
            ? InvoiceLifecycleStatus.VALIDATED
            : InvoiceLifecycleStatus.REJECTED,
        at: sentAt,
        note: dianResponse.message || 'DIAN reprocess response processed',
      },
      { status: InvoiceLifecycleStatus.PDF_GENERATED, at: new Date(), note: 'PDF artifacts regenerated' },
      ...(mailResult
        ? [
            {
              status: InvoiceLifecycleStatus.EMAILED,
              at: emailedAt || new Date(),
              note: 'Invoice reprocess email sent with attachments',
            } as InvoiceTransitionEntry,
          ]
        : []),
    ];

    const errors: InvoiceErrorEntry[] = (dianResponse.errors || []).map((entry: any) => ({
      code: dianResponse.statusCode,
      description: typeof entry === 'string' ? entry : JSON.stringify(entry),
      source: 'DIAN',
      raw: entry,
    }));

    if (lifecycleStatus === InvoiceLifecycleStatus.REJECTED && !errors.length) {
      errors.push({
        code: dianResponse.statusCode,
        description: dianResponse.message || 'DIAN rejected invoice during reprocess',
        source: 'DIAN',
      });
    }

    const dianStatusCode = String(dianResponse.statusCode || '').trim() || undefined;
    const dianRuleCodes = extractDianRuleCodes(errors.map((entry) => entry.raw || entry.description));

    const requestSource =
      context?.requestSource?.trim() ||
      (typeof payload.metadata?.source === 'string' ? payload.metadata.source : '') ||
      existingInvoice.requestSource ||
      'ERP_SALES_MODULE';
    const requestUser = context?.requestUser?.trim() || existingInvoice.requestUser || 'unknown';

    const reprocessHistory: InvoiceReprocessEntry[] = [
      ...((existingInvoice.reprocessHistory as InvoiceReprocessEntry[]) || []),
      {
        at: processStartedAt,
        reason: input?.reason,
        requestSource,
        requestUser,
        previousStatus: existingInvoice.status,
        approvalTicket: input?.approvalTicket,
        approvedBy: input?.approvedBy,
        policyDecision: policyDecision.reason || 'ALLOWED',
      },
    ];

    await this.invoiceModel.updateOne(
      { _id: existingInvoice._id },
      {
        $set: {
          cufe,
          status: lifecycleStatus,
          requestPayload: payload,
          computedInvoice: preparedInvoice,
          xml,
          signedXml: signingResult.signedXml,
          zipName: dianResponse.zipName,
          dianResponse,
          dianStatusCode,
          dianRuleCodes,
          applicationResponse: dianResponse.applicationResponse || undefined,
          responseXml: dianResponse.raw ? JSON.stringify(dianResponse.raw) : undefined,
          attachedDocumentXml,
          pdfBase64: pdfResult.pdfBase64,
          ticketBase64: pdfResult.ticketBase64,
          mailResult,
          sentAt,
          validatedAt,
          emailedAt,
          errors,
          transitionHistory,
          requestSource,
          requestUser,
          reprocessCount: Number(existingInvoice.reprocessCount || 0) + 1,
          reprocessHistory,
        },
      },
    );

    return {
      invoiceId: preparedInvoice.invoiceNumber,
      cufe,
      xml,
      signedXml: signingResult.signedXml,
      attachedDocumentXml,
      zipName: dianResponse.zipName,
      dian: dianResponse,
      pdfBase64: pdfResult.pdfBase64,
      ticketBase64: pdfResult.ticketBase64,
      status: lifecycleStatus,
      idempotentReplay: false,
    };
  }

  async reconcilePendingInvoices(limit?: number): Promise<{
    processed: number;
    updated: number;
    validated: number;
    rejected: number;
    stillPending: number;
    skipped: number;
  }> {
    const configuredBatch = this.configService.get<number>('dian.asyncReconciliation.batchSize') || 20;
    const batchSize = limit && limit > 0 ? limit : configuredBatch;

    const pendingInvoices = await this.invoiceModel
      .find({
        status: {
          $in: [
            InvoiceLifecycleStatus.SENT,
            InvoiceLifecycleStatus.SUBMITTED,
            InvoiceLifecycleStatus.PENDING,
          ],
        },
        'dianResponse.trackId': { $exists: true, $ne: null },
      })
      .sort({ createdAt: 1 })
      .limit(batchSize)
      .lean();

    let updated = 0;
    let validated = 0;
    let rejected = 0;
    let stillPending = 0;
    let skipped = 0;

    for (const invoice of pendingInvoices) {
      const trackId = invoice?.dianResponse?.trackId;
      if (!trackId) {
        skipped += 1;
        continue;
      }

      try {
        const statusResponse = await this.dianService.getStatus(trackId);
        const statusCode = String(statusResponse?.statusCode || '').trim();
        const isPending = this.isPendingDianStatus(statusCode, statusResponse);

        if (isPending) {
          stillPending += 1;

          await this.invoiceModel.updateOne(
            { _id: invoice._id },
            {
              $set: {
                dianResponse: {
                  ...invoice.dianResponse,
                  statusCode: statusResponse.statusCode,
                  statusDescription: statusResponse.statusDescription,
                  statusMessage: statusResponse.statusMessage,
                  lastCheckAt: new Date().toISOString(),
                },
              },
            },
          );
          continue;
        }

        const now = new Date();
        const nextStatus =
          statusCode === '00'
            ? invoice.emailedAt
              ? InvoiceLifecycleStatus.EMAILED
              : InvoiceLifecycleStatus.VALIDATED
            : InvoiceLifecycleStatus.REJECTED;

        const transitionHistory: InvoiceTransitionEntry[] = [
          ...((invoice.transitionHistory as InvoiceTransitionEntry[]) || []),
          {
            status: nextStatus,
            at: now,
            note:
              statusResponse.statusDescription ||
              statusResponse.statusMessage ||
              (nextStatus === InvoiceLifecycleStatus.VALIDATED
                ? 'DIAN validation completed'
                : 'DIAN rejected invoice during async reconciliation'),
          },
        ];

        const errors: InvoiceErrorEntry[] =
          statusCode === '00'
            ? []
            : (statusResponse.errors || []).map((entry: any) => ({
                code: statusCode,
                description: typeof entry === 'string' ? entry : JSON.stringify(entry),
                source: 'DIAN',
                raw: entry,
              }));
        const dianRuleCodes = extractDianRuleCodes(errors.map((entry) => entry.raw || entry.description));

        let attachedDocumentXml = invoice.attachedDocumentXml;
        if (statusCode === '00') {
          attachedDocumentXml = this.attachedDocumentService.buildAttachedDocumentXml({
            invoiceNumber: invoice.invoiceNumber,
            cufe: invoice.cufe,
            signedXml: invoice.signedXml,
            applicationResponse:
              statusResponse?.applicationResponse ||
              invoice?.dianResponse?.applicationResponse ||
              invoice?.applicationResponse,
            statusCode,
            statusDescription: statusResponse.statusDescription || statusResponse.statusMessage,
            validatedAt: now,
          });
        }

        await this.invoiceModel.updateOne(
          { _id: invoice._id },
          {
            $set: {
              status: nextStatus,
              dianStatusCode: statusCode || invoice.dianStatusCode,
              dianRuleCodes,
              validatedAt: statusCode === '00' ? now : invoice.validatedAt,
              errors,
              transitionHistory,
              attachedDocumentXml,
              applicationResponse:
                statusResponse?.applicationResponse ||
                invoice?.dianResponse?.applicationResponse ||
                invoice?.applicationResponse,
              responseXml: statusResponse.raw ? JSON.stringify(statusResponse.raw) : invoice.responseXml,
              dianResponse: {
                ...invoice.dianResponse,
                ...statusResponse,
                lastCheckAt: now.toISOString(),
              },
            },
          },
        );

        updated += 1;
        if (nextStatus === InvoiceLifecycleStatus.REJECTED) {
          rejected += 1;
        } else {
          validated += 1;
        }
      } catch (error) {
        this.logger.error(
          `Async reconciliation failed for invoice ${invoice.invoiceNumber}: ${error?.message || error}`,
          error?.stack,
          'InvoicesService',
        );
      }
    }

    return {
      processed: pendingInvoices.length,
      updated,
      validated,
      rejected,
      stillPending,
      skipped,
    };
  }

  private isPendingDianStatus(statusCode: string, response: Record<string, any>): boolean {
    const pendingCodes = new Set(['', '66', '90', '98', '99']);
    if (pendingCodes.has(statusCode)) {
      return true;
    }

    const statusText = `${response?.statusDescription || ''} ${response?.statusMessage || ''}`.toLowerCase();
    return (
      statusText.includes('proceso') ||
      statusText.includes('pendiente') ||
      statusText.includes('processing')
    );
  }

  private getCsvSigningConfig(): {
    enabled: boolean;
    hmacSecret: string;
    keyId: string;
  } {
    const enabled =
      String(this.configService.get<string>('auditArtifacts.csvSignature.enabled')).toLowerCase() === 'true';
    const hmacSecret = this.configService.get<string>('auditArtifacts.csvSignature.hmacSecret') || '';
    const keyId = this.configService.get<string>('auditArtifacts.csvSignature.keyId') || 'csv-hmac-v1';

    if (enabled && !hmacSecret.trim()) {
      throw new BadRequestException('CSV signature is enabled but CSV_SIGNATURE_HMAC_SECRET is missing');
    }

    return {
      enabled,
      hmacSecret,
      keyId,
    };
  }

  private getReprocessPolicyConfig(): ReprocessPolicyConfig {
    return {
      allowedStatusCodes: parseCsvToSet(
        this.configService.get<string>('dian.reprocessPolicy.allowedStatusCodes'),
      ),
      blockedStatusCodes: parseCsvToSet(
        this.configService.get<string>('dian.reprocessPolicy.blockedStatusCodes'),
      ),
      blockedRuleCodePrefixes: parseCsvToList(
        this.configService.get<string>('dian.reprocessPolicy.blockedRuleCodePrefixes'),
      ),
      requireApprovalForBlocked:
        String(this.configService.get<string>('dian.reprocessPolicy.requireApprovalForBlocked')).toLowerCase() !==
        'false',
    };
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