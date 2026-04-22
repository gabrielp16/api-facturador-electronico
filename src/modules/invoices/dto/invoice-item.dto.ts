import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { TaxDto } from './tax.dto';

export class InvoiceItemDto {
  @IsString()
  @Length(1, 50)
  sku: string;

  @IsString()
  @Length(2, 250)
  description: string;

  @IsString()
  unitCode: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TaxDto)
  taxes: TaxDto[];

  @IsOptional()
  metadata?: Record<string, any>;
}