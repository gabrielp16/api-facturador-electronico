import { Module } from '@nestjs/common';
import { QrModule } from '../qr/qr.module';
import { PdfService } from './pdf.service';

@Module({
  imports: [QrModule],
  providers: [PdfService],
  exports: [PdfService],
})
export class PdfModule {}