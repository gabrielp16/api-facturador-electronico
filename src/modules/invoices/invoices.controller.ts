import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import {
  CreateInvoiceResponseDto,
  DianStatusResponseDto,
  PaginatedInvoicesResponseDto,
} from './dto/invoice-responses.dto';
import { InvoicesService } from './invoices.service';
import { InvoiceRecord } from './schemas/invoice.schema';
import { InvoiceLifecycleStatus } from './types/invoice.types';

@ApiTags('invoices')
@Controller('invoices')
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
  @ApiCreatedResponse({ type: CreateInvoiceResponseDto })
  @ApiBadRequestResponse({
    description:
      'Datos invalidos, resolucion fuera de rango, o total pagable no valido.',
  })
  @Post('from-sale-order')
  async createFromSaleOrder(@Body() dto: CreateInvoiceDto) {
    return this.invoicesService.createFromSaleOrder(dto);
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
}