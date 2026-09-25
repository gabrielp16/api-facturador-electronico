import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, Length } from 'class-validator';

export class RegisterPolicyDeploymentDto {
  @ApiPropertyOptional({
    example: 'production',
    description: 'Ambiente donde se aplico la politica aprobada.',
  })
  @IsOptional()
  @IsString()
  @IsIn(['development', 'testing', 'staging', 'production', 'habilitacion'])
  environment?: string;

  @ApiPropertyOptional({
    example: 'CHG-2026-009812',
    description: 'Ticket de cambio/despliegue asociado a la aplicacion de la politica.',
  })
  @IsOptional()
  @IsString()
  @Length(3, 120)
  changeTicket?: string;

  @ApiPropertyOptional({
    example: 'devops@empresa.com',
    description: 'Responsable tecnico del despliegue.',
  })
  @IsOptional()
  @IsString()
  @Length(3, 180)
  deployedBy?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Snippet de variables aplicado realmente. Si no se envia, se usa envSnippet del snapshot aprobado.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  envSnippet?: string[];

  @ApiPropertyOptional({
    example: 'Aplicado via pipeline y validado con smoke test de reproceso.',
  })
  @IsOptional()
  @IsString()
  @Length(3, 1000)
  notes?: string;
}
