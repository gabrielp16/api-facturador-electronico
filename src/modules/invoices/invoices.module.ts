import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DianModule } from '../dian/dian.module';
import { MailModule } from '../mail/mail.module';
import { PdfModule } from '../pdf/pdf.module';
import { SigningModule } from '../signing/signing.module';
import { UblModule } from '../ubl/ubl.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoiceRecord, InvoiceSchema } from './schemas/invoice.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: InvoiceRecord.name, schema: InvoiceSchema }]),
    UblModule,
    SigningModule,
    DianModule,
    PdfModule,
    MailModule,
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}