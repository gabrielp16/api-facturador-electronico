import { IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

export class TaxDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  percent: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxableAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9-]*$/)
  schemeId?: string;
}