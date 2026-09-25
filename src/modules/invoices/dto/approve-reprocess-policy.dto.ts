import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class ApproveReprocessPolicyDto {
  @ApiPropertyOptional({
    example: 'APRV-FISCAL-2026-0091',
    description: 'Codigo de acta/ticket de aprobacion funcional.',
  })
  @IsOptional()
  @IsString()
  @Length(4, 120)
  approvalTicket?: string;

  @ApiPropertyOptional({
    example: 'lider.fiscal@empresa.com',
    description: 'Responsable funcional que aprueba la politica final.',
  })
  @IsOptional()
  @IsString()
  @Length(3, 180)
  approvedBy?: string;

  @ApiPropertyOptional({
    example: ['99', '90'],
    description: 'Sobrescribe codigos DIAN bloqueados recomendados automaticamente.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  blockedStatusCodes?: string[];

  @ApiPropertyOptional({
    example: ['FAD', 'CAD'],
    description: 'Sobrescribe prefijos de regla bloqueados recomendados automaticamente.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  blockedRulePrefixes?: string[];

  @ApiPropertyOptional({
    example: 5,
    description: 'Umbral minimo de ocurrencias para bloquear statusCode en recomendacion automatica.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  statusMinOccurrences?: number;

  @ApiPropertyOptional({
    example: 8,
    description: 'Umbral minimo de ocurrencias para bloquear prefijos de regla.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  rulePrefixMinOccurrences?: number;

  @ApiPropertyOptional({
    example: 3,
    description: 'Longitud de prefijo de regla para agrupacion.',
  })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(8)
  rulePrefixLength?: number;

  @ApiPropertyOptional({
    example: 200,
    description: 'Tamano de muestra para recomendacion automatica.',
  })
  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(500)
  sampleLimit?: number;

  @ApiPropertyOptional({
    example: 'Aprobacion en comite operativo DIAN 2026-09',
  })
  @IsOptional()
  @IsString()
  @Length(3, 1000)
  notes?: string;
}
