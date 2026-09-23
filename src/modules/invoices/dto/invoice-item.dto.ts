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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaxDto } from './tax.dto';

export class InvoiceItemDto {
  @ApiProperty({ example: 'SKU-001' })
  @IsString()
  @Length(1, 50)
  sku: string;

  @ApiProperty({ example: 'Helado de vainilla 500ml' })
  @IsString()
  @Length(2, 250)
  description: string;

  @ApiProperty({ example: 'EA' })
  @IsString()
  unitCode: string;

  @ApiProperty({ example: 2 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity: number;

  @ApiProperty({ example: 18000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice: number;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number;

  @ApiProperty({ type: () => [TaxDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TaxDto)
  taxes: TaxDto[];

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { warehouse: 'A1' },
  })
  @IsOptional()
  metadata?: Record<string, any>;
}