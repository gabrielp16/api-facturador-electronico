import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerDto } from './customer.dto';
import { InvoiceItemDto } from './invoice-item.dto';

export class CreateInvoiceDto {
  @ApiProperty({ example: 'SO-100245' })
  @IsString()
  saleOrderId: string;

  @ApiProperty({ example: 'SETP' })
  @IsString()
  @Matches(/^[A-Z0-9]+$/)
  resolutionPrefix: string;

  @ApiProperty({ example: 98001 })
  @IsInt()
  resolutionNumber: number;

  @ApiPropertyOptional({ example: '2026-09-23T14:10:00-05:00' })
  @IsOptional()
  @IsDateString()
  issueDateTime?: string;

  @ApiPropertyOptional({ example: '2026-09-30T00:00:00-05:00' })
  @IsOptional()
  @IsDateString()
  paymentDueDate?: string;

  @ApiPropertyOptional({ example: '10' })
  @IsOptional()
  @IsString()
  paymentMeansCode?: string;

  @ApiPropertyOptional({ example: 'COP', default: 'COP' })
  @IsOptional()
  @IsString()
  currencyCode?: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 10,
    example: ['Observacion interna', 'Entregar en porteria'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  notes?: string[];

  @ApiProperty({ type: () => CustomerDto })
  @ValidateNested()
  @Type(() => CustomerDto)
  customer: CustomerDto;

  @ApiProperty({ type: () => [InvoiceItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { source: 'ERP', channel: 'POS' },
  })
  @IsOptional()
  metadata?: Record<string, any>;
}