import { IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TaxDto {
  @ApiProperty({ example: '01' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'IVA' })
  @IsString()
  name: string;

  @ApiProperty({ example: 19 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  percent: number;

  @ApiPropertyOptional({ example: 36000 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxableAmount?: number;

  @ApiPropertyOptional({ example: 6840 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ example: '01' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9-]*$/)
  schemeId?: string;
}