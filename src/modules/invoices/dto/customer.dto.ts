import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CustomerDto {
  @IsString()
  identificationType: string;

  @IsString()
  @Matches(/^[0-9A-Za-z-]+$/)
  identificationNumber: string;

  @IsOptional()
  @IsString()
  dv?: string;

  @IsString()
  @Length(2, 200)
  legalName: string;

  @IsEmail()
  email: string;

  @IsString()
  phone: string;

  @IsString()
  address: string;

  @IsString()
  cityCode: string;

  @IsString()
  cityName: string;

  @IsString()
  departmentCode: string;

  @IsString()
  departmentName: string;

  @IsString()
  countryCode: string;

  @IsString()
  countryName: string;

  @IsOptional()
  @IsString()
  municipalityCode?: string;

  @IsOptional()
  @IsString()
  taxLevelCode?: string;

  @IsOptional()
  @IsString()
  taxSchemeId?: string;

  @IsOptional()
  @IsString()
  responsibilityCode?: string;
}