import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InvoicesApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const configuredApiKey = this.configService.get<string>('integration.invoicesApiKey');
    const incomingApiKey = request?.headers?.['x-invoices-api-key'];

    if (!configuredApiKey) {
      throw new ForbiddenException('Invoice API key is not configured');
    }

    if (incomingApiKey !== configuredApiKey) {
      throw new ForbiddenException('Invalid invoice API key');
    }

    return true;
  }
}