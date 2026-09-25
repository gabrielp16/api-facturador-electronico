import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, ValidateNested } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateInvoiceDto } from './create-invoice.dto';

export class ReprocessInvoiceDto {
  @ApiPropertyOptional({
    example: 'Correccion de identificacion del cliente y reenvio DIAN',
  })
  @IsOptional()
  @IsString()
  @Length(3, 500)
  reason?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Sobrescribe si se debe enviar correo en este reproceso.',
  })
  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;

  @ApiPropertyOptional({
    example: 'APRV-OPS-2026-0911',
    description: 'Ticket o acta operativa que autoriza reproceso cuando la politica lo exige.',
  })
  @IsOptional()
  @IsString()
  @Length(4, 120)
  approvalTicket?: string;

  @ApiPropertyOptional({
    example: 'coordinador.calidad@empresa.com',
    description: 'Usuario responsable de aprobar el reproceso excepcional.',
  })
  @IsOptional()
  @IsString()
  @Length(3, 180)
  approvedBy?: string;

  @ApiPropertyOptional({
    type: () => CreateInvoiceDto,
    description:
      'Payload corregido completo para reproceso. Si no se envia, se reutiliza requestPayload almacenado.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateInvoiceDto)
  payload?: CreateInvoiceDto;
}
