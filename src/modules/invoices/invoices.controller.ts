import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { InvoicesApiKeyGuard } from '../../common/guards/invoices-api-key.guard';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ApproveReprocessPolicyDto } from './dto/approve-reprocess-policy.dto';
import { RegisterPolicyDeploymentDto } from './dto/register-policy-deployment.dto';
import {
  CreateInvoiceResponseDto,
  DianStatusResponseDto,
  PaginatedInvoicesResponseDto,
} from './dto/invoice-responses.dto';
import { ReprocessInvoiceDto } from './dto/reprocess-invoice.dto';
import { InvoicesService } from './invoices.service';
import { InvoiceRecord } from './schemas/invoice.schema';
import { InvoiceLifecycleStatus } from './types/invoice.types';

@ApiTags('invoices')
@Controller('invoices')
@UseGuards(InvoicesApiKeyGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @ApiOperation({ summary: 'Listar todas las facturas creadas' })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Numero de pagina (inicia en 1).',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Tamano de pagina entre 1 y 100.',
    example: 20,
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: InvoiceLifecycleStatus,
    description: 'Filtra por estado de ciclo de vida de la factura.',
  })
  @ApiQuery({
    name: 'invoiceNumber',
    required: false,
    description: 'Filtra por numero de factura (busqueda parcial).',
    example: 'SETP98001',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description: 'Fecha inicial de creacion (ISO 8601 o YYYY-MM-DD).',
    example: '2026-01-01',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    description: 'Fecha final de creacion (ISO 8601 o YYYY-MM-DD).',
    example: '2026-12-31',
  })
  @ApiOkResponse({
    type: PaginatedInvoicesResponseDto,
    description: 'Facturas paginadas ordenadas por fecha de creacion descendente.',
  })
  @ApiBadRequestResponse({
    description: 'Parametros de paginacion o filtros invalidos.',
  })
  @Get()
  async getAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: InvoiceLifecycleStatus,
    @Query('invoiceNumber') invoiceNumber?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.invoicesService.findAll(page, limit, {
      status,
      invoiceNumber,
      dateFrom,
      dateTo,
    });
  }

  @ApiOperation({
    summary: 'Crear factura DIAN desde orden de venta',
    description:
      'Orquesta validacion, XML UBL, firma, envio DIAN, PDF/ticket y persistencia en MongoDB.',
  })
  @ApiBody({ type: CreateInvoiceDto })
  @ApiHeader({
    name: 'x-invoices-api-key',
    required: true,
    description: 'API key interna para emision de facturas DIAN.',
  })
  @ApiHeader({
    name: 'x-request-source',
    required: false,
    description: 'Origen de la solicitud (POS_WEB, ERP_BACKOFFICE, etc).',
  })
  @ApiHeader({
    name: 'x-request-user',
    required: false,
    description: 'Usuario tecnico o funcional que origino la emision.',
  })
  @ApiCreatedResponse({ type: CreateInvoiceResponseDto })
  @ApiBadRequestResponse({
    description:
      'Datos invalidos, resolucion fuera de rango, o total pagable no valido.',
  })
  @Post('from-sale-order')
  async createFromSaleOrder(
    @Body() dto: CreateInvoiceDto,
    @Headers('x-request-source') requestSource?: string,
    @Headers('x-request-user') requestUser?: string,
  ) {
    return this.invoicesService.createFromSaleOrder(dto, {
      requestSource,
      requestUser,
    });
  }

  @ApiOperation({ summary: 'Consultar estado DIAN por TrackId' })
  @ApiParam({
    name: 'trackId',
    example: '79d8db7efc1f1d1fe0dcb7aaf5336e18f0eb6d8ff9c8cb2a8ec9db4dc6a1234',
    description: 'Identificador de seguimiento DIAN retornado por envio sync/async.',
  })
  @ApiOkResponse({ type: DianStatusResponseDto })
  @ApiBadRequestResponse({ description: 'TrackId invalido o no procesable.' })
  @Get('track/:trackId/status')
  async getDianStatus(@Param('trackId') trackId: string) {
    return this.invoicesService.getDianStatus(trackId);
  }

  @ApiOperation({ summary: 'Reconciliar facturas pendientes en modo async' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Numero maximo de facturas pendientes a reconciliar en esta ejecucion.',
    example: 20,
  })
  @ApiOkResponse({ description: 'Resumen de reconciliacion async ejecutada.' })
  @Post('reconcile-pending')
  async reconcilePending(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.invoicesService.reconcilePendingInvoices(limit);
  }

  @ApiOperation({
    summary: 'Obtener catalogo de rechazos DIAN para ajuste de politicas de reproceso',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximo de codigos devueltos por ranking (1-200).',
    example: 20,
  })
  @ApiOkResponse({
    description: 'Resumen agregado de statusCode y ruleCodes DIAN observados en facturas rechazadas.',
  })
  @Get('rejections/catalog')
  async getRejectionCatalog(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.invoicesService.getRejectionCatalogSummary(limit);
  }

  @ApiOperation({
    summary: 'Obtener recomendacion automatica de politica de bloqueo para reproceso',
    description:
      'Calcula sugerencias de codigos DIAN y prefijos de regla a bloquear con base en frecuencia historica.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Muestra de codigos de rechazo a considerar (20-500).',
    example: 200,
  })
  @ApiQuery({
    name: 'statusMinOccurrences',
    required: false,
    description: 'Frecuencia minima para recomendar bloqueo por statusCode.',
    example: 5,
  })
  @ApiQuery({
    name: 'rulePrefixMinOccurrences',
    required: false,
    description: 'Frecuencia minima para recomendar bloqueo por prefijo de regla.',
    example: 8,
  })
  @ApiQuery({
    name: 'rulePrefixLength',
    required: false,
    description: 'Longitud del prefijo a agrupar (2-8).',
    example: 3,
  })
  @ApiOkResponse({
    description: 'Recomendacion automatica y snippet de variables de entorno para la politica de reproceso.',
  })
  @Get('rejections/policy-recommendation')
  async getRejectionPolicyRecommendation(
    @Query('limit', new DefaultValuePipe(200), ParseIntPipe) limit: number,
    @Query('statusMinOccurrences', new DefaultValuePipe(5), ParseIntPipe)
    statusMinOccurrences: number,
    @Query('rulePrefixMinOccurrences', new DefaultValuePipe(8), ParseIntPipe)
    rulePrefixMinOccurrences: number,
    @Query('rulePrefixLength', new DefaultValuePipe(3), ParseIntPipe)
    rulePrefixLength: number,
  ) {
    return this.invoicesService.getRejectionPolicyRecommendation({
      limit,
      statusMinOccurrences,
      rulePrefixMinOccurrences,
      rulePrefixLength,
    });
  }

  @ApiOperation({
    summary: 'Obtener reporte mensual consolidado de gobierno de reproceso DIAN',
    description:
      'Consolida metricas del mes, recomendacion automatica, snapshots aprobados y evidencias de despliegue.',
  })
  @ApiQuery({ name: 'year', required: false, example: 2026, description: 'Anio del reporte (2000-2100).' })
  @ApiQuery({ name: 'month', required: false, example: 9, description: 'Mes del reporte (1-12).' })
  @ApiQuery({
    name: 'recommendationLimit',
    required: false,
    example: 200,
    description: 'Muestra de codigos para generar recomendacion automatica.',
  })
  @ApiQuery({
    name: 'statusMinOccurrences',
    required: false,
    example: 5,
    description: 'Frecuencia minima para sugerir bloqueo por statusCode.',
  })
  @ApiQuery({
    name: 'rulePrefixMinOccurrences',
    required: false,
    example: 8,
    description: 'Frecuencia minima para sugerir bloqueo por prefijo de regla.',
  })
  @ApiQuery({
    name: 'rulePrefixLength',
    required: false,
    example: 3,
    description: 'Longitud de prefijo usada para agrupar reglas DIAN.',
  })
  @ApiOkResponse({
    description: 'Reporte mensual consolidado con recomendacion, aprobaciones y despliegues auditables.',
  })
  @Get('rejections/monthly-report')
  async getRejectionMonthlyReport(
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('recommendationLimit') recommendationLimit?: string,
    @Query('statusMinOccurrences') statusMinOccurrences?: string,
    @Query('rulePrefixMinOccurrences') rulePrefixMinOccurrences?: string,
    @Query('rulePrefixLength') rulePrefixLength?: string,
  ) {
    const parseOptionalInt = (value?: string): number | undefined => {
      if (value === undefined || value === null || value === '') {
        return undefined;
      }

      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : Number.NaN;
    };

    return this.invoicesService.getRejectionMonthlyReport({
      year: parseOptionalInt(year),
      month: parseOptionalInt(month),
      recommendationLimit: parseOptionalInt(recommendationLimit),
      statusMinOccurrences: parseOptionalInt(statusMinOccurrences),
      rulePrefixMinOccurrences: parseOptionalInt(rulePrefixMinOccurrences),
      rulePrefixLength: parseOptionalInt(rulePrefixLength),
    });
  }

  @ApiOperation({
    summary: 'Descargar reporte mensual consolidado de gobierno DIAN en CSV',
    description:
      'Exporta en CSV el reporte mensual (metricas, recomendacion, aprobaciones y despliegues).',
  })
  @ApiQuery({ name: 'year', required: false, example: 2026, description: 'Anio del reporte (2000-2100).' })
  @ApiQuery({ name: 'month', required: false, example: 9, description: 'Mes del reporte (1-12).' })
  @ApiQuery({
    name: 'recommendationLimit',
    required: false,
    example: 200,
    description: 'Muestra de codigos para generar recomendacion automatica.',
  })
  @ApiQuery({
    name: 'statusMinOccurrences',
    required: false,
    example: 5,
    description: 'Frecuencia minima para sugerir bloqueo por statusCode.',
  })
  @ApiQuery({
    name: 'rulePrefixMinOccurrences',
    required: false,
    example: 8,
    description: 'Frecuencia minima para sugerir bloqueo por prefijo de regla.',
  })
  @ApiQuery({
    name: 'rulePrefixLength',
    required: false,
    example: 3,
    description: 'Longitud de prefijo usada para agrupar reglas DIAN.',
  })
  @ApiOkResponse({ description: 'CSV del reporte mensual consolidado de gobierno DIAN.' })
  @Get('rejections/monthly-report/csv')
  async getRejectionMonthlyReportCsv(
    @Res({ passthrough: true }) response: any,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('recommendationLimit') recommendationLimit?: string,
    @Query('statusMinOccurrences') statusMinOccurrences?: string,
    @Query('rulePrefixMinOccurrences') rulePrefixMinOccurrences?: string,
    @Query('rulePrefixLength') rulePrefixLength?: string,
  ): Promise<string> {
    const parseOptionalInt = (value?: string): number | undefined => {
      if (value === undefined || value === null || value === '') {
        return undefined;
      }

      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : Number.NaN;
    };

    const csvResult = await this.invoicesService.getRejectionMonthlyReportCsv({
      year: parseOptionalInt(year),
      month: parseOptionalInt(month),
      recommendationLimit: parseOptionalInt(recommendationLimit),
      statusMinOccurrences: parseOptionalInt(statusMinOccurrences),
      rulePrefixMinOccurrences: parseOptionalInt(rulePrefixMinOccurrences),
      rulePrefixLength: parseOptionalInt(rulePrefixLength),
    });

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="dian-rejections-monthly-report.csv"');
    response.setHeader('X-Content-Hash-Algorithm', 'sha256');
    response.setHeader('X-Content-SHA256', csvResult.sha256);
    if (csvResult.signature && csvResult.signatureAlgorithm) {
      response.setHeader('X-Content-Signature-Algorithm', csvResult.signatureAlgorithm);
      response.setHeader('X-Content-Signature', csvResult.signature);
      if (csvResult.signatureKeyId) {
        response.setHeader('X-Content-Signature-Key-Id', csvResult.signatureKeyId);
      }
    }

    return csvResult.csv;
  }

  @ApiOperation({
    summary: 'Registrar aprobacion funcional de politica de reproceso DIAN',
    description:
      'Guarda snapshot auditable con recomendacion/historico y listas finales aprobadas de bloqueo.',
  })
  @ApiBody({ type: ApproveReprocessPolicyDto, required: false })
  @ApiHeader({
    name: 'x-request-source',
    required: false,
    description: 'Origen de la aprobacion (COMITE_FISCAL, OPERACIONES, etc).',
  })
  @ApiHeader({
    name: 'x-request-user',
    required: false,
    description: 'Usuario tecnico o funcional que registra la aprobacion.',
  })
  @ApiCreatedResponse({
    description: 'Snapshot de politica aprobado y versionado.',
  })
  @Post('rejections/policy-approvals')
  async approveReprocessPolicy(
    @Body() dto: ApproveReprocessPolicyDto,
    @Headers('x-request-source') requestSource?: string,
    @Headers('x-request-user') requestUser?: string,
  ) {
    return this.invoicesService.approveReprocessPolicy(dto, {
      requestSource,
      requestUser,
    });
  }

  @ApiOperation({ summary: 'Obtener ultima politica de reproceso aprobada' })
  @ApiOkResponse({ description: 'Snapshot mas reciente de politica aprobada o null si no existe.' })
  @Get('rejections/policy-approvals/latest')
  async getLatestReprocessPolicyApproval() {
    return this.invoicesService.getLatestReprocessPolicyApproval();
  }

  @ApiOperation({ summary: 'Descargar politica aprobada por version en CSV' })
  @ApiParam({ name: 'version', example: 'RPA-20260924T185501Z' })
  @ApiOkResponse({ description: 'CSV del snapshot de politica aprobada para la version solicitada.' })
  @ApiNotFoundResponse({ description: 'Version de politica aprobada no encontrada.' })
  @Get('rejections/policy-approvals/:version/csv')
  async getReprocessPolicyApprovalCsvByVersion(
    @Res({ passthrough: true }) response: any,
    @Param('version') version: string,
  ): Promise<string> {
    const csvResult = await this.invoicesService.getReprocessPolicyApprovalCsvByVersion(version);

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="dian-reprocess-policy-approval.csv"');
    response.setHeader('X-Content-Hash-Algorithm', 'sha256');
    response.setHeader('X-Content-SHA256', csvResult.sha256);
    if (csvResult.signature && csvResult.signatureAlgorithm) {
      response.setHeader('X-Content-Signature-Algorithm', csvResult.signatureAlgorithm);
      response.setHeader('X-Content-Signature', csvResult.signature);
      if (csvResult.signatureKeyId) {
        response.setHeader('X-Content-Signature-Key-Id', csvResult.signatureKeyId);
      }
    }

    return csvResult.csv;
  }

  @ApiOperation({ summary: 'Consultar politica aprobada por version' })
  @ApiParam({ name: 'version', example: 'RPA-20260924T185501Z' })
  @ApiOkResponse({ description: 'Snapshot de politica aprobado para la version solicitada.' })
  @ApiNotFoundResponse({ description: 'Version de politica aprobada no encontrada.' })
  @Get('rejections/policy-approvals/:version')
  async getReprocessPolicyApprovalByVersion(@Param('version') version: string) {
    return this.invoicesService.getReprocessPolicyApprovalByVersion(version);
  }

  @ApiOperation({
    summary: 'Registrar despliegue por ambiente de politica aprobada',
    description:
      'Registra evidencia de aplicacion en ambiente (ticket, usuario, fecha y snippet aplicado).',
  })
  @ApiParam({ name: 'version', example: 'RPA-20260924T185501Z' })
  @ApiBody({ type: RegisterPolicyDeploymentDto, required: false })
  @ApiHeader({
    name: 'x-request-source',
    required: false,
    description: 'Origen del despliegue (PIPELINE, DEVOPS_CONSOLE, etc).',
  })
  @ApiHeader({
    name: 'x-request-user',
    required: false,
    description: 'Usuario tecnico que registra el despliegue.',
  })
  @ApiCreatedResponse({ description: 'Snapshot actualizado con nuevo deployment registrado.' })
  @ApiNotFoundResponse({ description: 'Version de politica aprobada no encontrada.' })
  @Post('rejections/policy-approvals/:version/deployments')
  async registerReprocessPolicyDeployment(
    @Param('version') version: string,
    @Body() dto: RegisterPolicyDeploymentDto,
    @Headers('x-request-source') requestSource?: string,
    @Headers('x-request-user') requestUser?: string,
  ) {
    return this.invoicesService.registerReprocessPolicyDeployment(version, dto, {
      requestSource,
      requestUser,
    });
  }

  @ApiOperation({
    summary: 'Reprocesar factura rechazada',
    description:
      'Permite reenviar a DIAN una factura en estado REJECTED con payload corregido opcional.',
  })
  @ApiParam({
    name: 'invoiceNumber',
    example: 'SETP98001',
    description: 'Consecutivo de factura a reprocesar.',
  })
  @ApiBody({ type: ReprocessInvoiceDto, required: false })
  @ApiCreatedResponse({
    type: CreateInvoiceResponseDto,
    description: 'Factura reprocesada y reenviada a DIAN.',
  })
  @ApiBadRequestResponse({
    description: 'La factura no esta en estado REJECTED o payload de reproceso invalido.',
  })
  @Post(':invoiceNumber/reprocess')
  async reprocessRejectedInvoice(
    @Param('invoiceNumber') invoiceNumber: string,
    @Body() dto: ReprocessInvoiceDto,
    @Headers('x-request-source') requestSource?: string,
    @Headers('x-request-user') requestUser?: string,
  ) {
    return this.invoicesService.reprocessRejectedInvoice(invoiceNumber, dto, {
      requestSource,
      requestUser,
    });
  }

  @ApiOperation({ summary: 'Consultar factura almacenada por numero' })
  @ApiParam({
    name: 'invoiceNumber',
    example: 'SETP98001',
    description: 'Numero consecutivo de la factura DIAN.',
  })
  @ApiOkResponse({ type: InvoiceRecord })
  @ApiNotFoundResponse({ description: 'Factura no encontrada.' })
  @Get(':invoiceNumber')
  async getByInvoiceNumber(@Param('invoiceNumber') invoiceNumber: string) {
    return this.invoicesService.findByInvoiceNumber(invoiceNumber);
  }
}