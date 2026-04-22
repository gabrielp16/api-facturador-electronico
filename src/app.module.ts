import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import configuration from './common/config/configuration';
import { envValidationSchema } from './common/config/env.validation';
import { LoggerModule } from './common/logger/logger.module';
import { DianModule } from './modules/dian/dian.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { MailModule } from './modules/mail/mail.module';
import { PdfModule } from './modules/pdf/pdf.module';
import { QrModule } from './modules/qr/qr.module';
import { SigningModule } from './modules/signing/signing.module';
import { UblModule } from './modules/ubl/ubl.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      expandVariables: true,
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('mongodb.uri'),
      }),
    }),
    LoggerModule,
    QrModule,
    PdfModule,
    MailModule,
    UblModule,
    SigningModule,
    DianModule,
    InvoicesModule,
  ],
})
export class AppModule {}