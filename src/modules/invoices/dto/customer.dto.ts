import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CustomerDto {
  @ApiProperty({ example: '31' })
  @IsString()
  identificationType: string;

  @ApiProperty({ example: '900123456' })
  @IsString()
  @Matches(/^[0-9A-Za-z-]+$/)
  identificationNumber: string;

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsString()
  dv?: string;

  @ApiProperty({ example: 'Morchis SAS' })
  @IsString()
  @Length(2, 200)
  legalName: string;

  @ApiProperty({ example: 'facturacion@cliente.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+573001112233' })
  @IsString()
  phone: string;

  @ApiProperty({ example: 'Cra 14 # 6 - 02' })
  @IsString()
  address: string;

  @ApiProperty({ example: '63001' })
  @IsString()
  cityCode: string;

  @ApiProperty({ example: 'Armenia' })
  @IsString()
  cityName: string;

  @ApiProperty({ example: '63' })
  @IsString()
  departmentCode: string;

  @ApiProperty({ example: 'Quindio' })
  @IsString()
  departmentName: string;

  @ApiProperty({ example: 'CO' })
  @IsString()
  countryCode: string;

  @ApiProperty({ example: 'Colombia' })
  @IsString()
  countryName: string;

  @ApiPropertyOptional({ example: '63001' })
  @IsOptional()
  @IsString()
  municipalityCode?: string;

  @ApiPropertyOptional({ example: 'R-99-PN' })
  @IsOptional()
  @IsString()
  taxLevelCode?: string;

  @ApiPropertyOptional({ example: '01' })
  @IsOptional()
  @IsString()
  taxSchemeId?: string;

  @ApiPropertyOptional({ example: 'R-99-PN' })
  @IsOptional()
  @IsString()
  responsibilityCode?: string;
}