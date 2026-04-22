import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';

@Injectable()
export class QrService {
  async toDataUrl(content: string): Promise<string> {
    return QRCode.toDataURL(content, { errorCorrectionLevel: 'M', margin: 1, width: 256 });
  }

  async toBuffer(content: string): Promise<Buffer> {
    return QRCode.toBuffer(content, { errorCorrectionLevel: 'M', margin: 1, width: 256 });
  }
}