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
import { CustomerDto } from './customer.dto';
import { InvoiceItemDto } from './invoice-item.dto';

export class CreateInvoiceDto {
  @IsString()
  saleOrderId: string;

  @IsString()
  @Matches(/^[A-Z0-9]+$/)
  resolutionPrefix: string;

  @IsInt()
  resolutionNumber: number;

  @IsOptional()
  @IsDateString()
  issueDateTime?: string;

  @IsOptional()
  @IsDateString()
  paymentDueDate?: string;

  @IsOptional()
  @IsString()
  paymentMeansCode?: string;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  notes?: string[];

  @ValidateNested()
  @Type(() => CustomerDto)
  customer: CustomerDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;

  @IsOptional()
  metadata?: Record<string, any>;
}