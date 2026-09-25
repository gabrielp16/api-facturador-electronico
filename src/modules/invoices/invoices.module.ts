import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InvoicesApiKeyGuard } from '../../common/guards/invoices-api-key.guard';
import { AttachedDocumentModule } from '../attached-document/attached-document.module';
import { DianModule } from '../dian/dian.module';
import { MailModule } from '../mail/mail.module';
import { PdfModule } from '../pdf/pdf.module';
import { SigningModule } from '../signing/signing.module';
import { UblModule } from '../ubl/ubl.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesReconciliationService } from './invoices-reconciliation.service';
import { InvoicesService } from './invoices.service';
import { InvoiceRecord, InvoiceSchema } from './schemas/invoice.schema';
import {
  ReprocessPolicyApprovalRecord,
  ReprocessPolicyApprovalSchema,
} from './schemas/reprocess-policy-approval.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InvoiceRecord.name, schema: InvoiceSchema },
      { name: ReprocessPolicyApprovalRecord.name, schema: ReprocessPolicyApprovalSchema },
    ]),
    AttachedDocumentModule,
    UblModule,
    SigningModule,
    DianModule,
    PdfModule,
    MailModule,
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicesApiKeyGuard, InvoicesReconciliationService],
  exports: [InvoicesService],
})
export class InvoicesModule {}