import { Module } from '@nestjs/common';
import { DianResponseParser } from './dian-response.parser';
import { DianService } from './dian.service';

@Module({
  providers: [DianService, DianResponseParser],
  exports: [DianService, DianResponseParser],
})
export class DianModule {}