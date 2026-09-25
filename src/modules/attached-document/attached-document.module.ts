import { Module } from '@nestjs/common';
import { AttachedDocumentService } from './attached-document.service';

@Module({
  providers: [AttachedDocumentService],
  exports: [AttachedDocumentService],
})
export class AttachedDocumentModule {}
