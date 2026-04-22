import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post('from-sale-order')
  async createFromSaleOrder(@Body() dto: CreateInvoiceDto) {
    return this.invoicesService.createFromSaleOrder(dto);
  }

  @Get(':invoiceNumber')
  async getByInvoiceNumber(@Param('invoiceNumber') invoiceNumber: string) {
    return this.invoicesService.findByInvoiceNumber(invoiceNumber);
  }

  @Get('track/:trackId/status')
  async getDianStatus(@Param('trackId') trackId: string) {
    return this.invoicesService.getDianStatus(trackId);
  }
}