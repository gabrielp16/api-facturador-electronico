import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import * as forge from 'node-forge';
import { SignedXml } from 'xml-crypto';

@Injectable()
export class SigningService {
  constructor(private readonly configService: ConfigService) {}

  signXml(xml: string, invoiceNumber: string): { signedXml: string } {
    try {
      const certificatePath = this.configService.get<string>('certificate.path');
      const passphrase = this.configService.get<string>('certificate.passphrase');
      const certificateBuffer = readFileSync(certificatePath);
      const p12Asn1 = forge.asn1.fromDer(certificateBuffer.toString('binary'));
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, passphrase);
      const keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
        forge.pki.oids.pkcs8ShroudedKeyBag
      ][0];
      const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag][0];

      const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);
      const certificatePem = forge.pki.certificateToPem(certBag.cert);
      const certificateDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certBag.cert)).getBytes();
      const certificateBase64 = Buffer.from(certificateDer, 'binary').toString('base64');
      const certificateDigest = createHash('sha256')
        .update(Buffer.from(certificateDer, 'binary'))
        .digest('base64');
      const signatureId = `signature-${randomUUID()}`;
      const signedPropertiesId = `signed-properties-${randomUUID()}`;
      const keyInfoId = `keyinfo-${randomUUID()}`;
      const signingTime = new Date().toISOString();

      const signedXml = new SignedXml();
      (signedXml as any).signatureAlgorithm =
        'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
      (signedXml as any).canonicalizationAlgorithm =
        'http://www.w3.org/2001/10/xml-exc-c14n#';
      (signedXml as any).privateKey = privateKeyPem;
      (signedXml as any).publicCert = certificatePem;
      (signedXml as any).keyInfoAttributes = { Id: keyInfoId };
      (signedXml as any).getKeyInfo = () =>
        `<ds:KeyInfo Id="${keyInfoId}"><ds:X509Data><ds:X509Certificate>${certificateBase64}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>`;
      (signedXml as any).addReference({
        xpath: "//*[@Id='invoice-root']",
        transforms: [
          'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
          'http://www.w3.org/2001/10/xml-exc-c14n#',
        ],
        digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
        uri: '#invoice-root',
      });
      (signedXml as any).addReference({
        xpath: `//*[@Id='${signedPropertiesId}']`,
        transforms: ['http://www.w3.org/2001/10/xml-exc-c14n#'],
        digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
        uri: `#${signedPropertiesId}`,
        type: 'http://uri.etsi.org/01903#SignedProperties',
      });
      (signedXml as any).addObject(
        `<xades:QualifyingProperties Target="#${signatureId}">
          <xades:SignedProperties Id="${signedPropertiesId}">
            <xades:SignedSignatureProperties>
              <xades:SigningTime>${signingTime}</xades:SigningTime>
              <xades:SigningCertificate>
                <xades:Cert>
                  <xades:CertDigest>
                    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256" />
                    <ds:DigestValue>${certificateDigest}</ds:DigestValue>
                  </xades:CertDigest>
                  <xades:IssuerSerial>
                    <ds:X509IssuerName>${certBag.cert.issuer.attributes
                      .map((attribute) => `${attribute.shortName || attribute.name}=${attribute.value}`)
                      .join(',')}</ds:X509IssuerName>
                    <ds:X509SerialNumber>${new forge.jsbn.BigInteger(
                      certBag.cert.serialNumber,
                      16,
                    ).toString(10)}</ds:X509SerialNumber>
                  </xades:IssuerSerial>
                </xades:Cert>
              </xades:SigningCertificate>
              <xades:SignaturePolicyIdentifier>
                <xades:SignaturePolicyImplied />
              </xades:SignaturePolicyIdentifier>
              <xades:SignerRole>
                <xades:ClaimedRoles>
                  <xades:ClaimedRole>supplier</xades:ClaimedRole>
                </xades:ClaimedRoles>
              </xades:SignerRole>
            </xades:SignedSignatureProperties>
            <xades:SignedDataObjectProperties>
              <xades:DataObjectFormat ObjectReference="#invoice-root">
                <xades:Description>Factura electronica ${invoiceNumber}</xades:Description>
                <xades:MimeType>text/xml</xades:MimeType>
                <xades:Encoding>UTF-8</xades:Encoding>
              </xades:DataObjectFormat>
            </xades:SignedDataObjectProperties>
          </xades:SignedProperties>
        </xades:QualifyingProperties>`,
      );

      (signedXml as any).computeSignature(xml, {
        prefix: 'ds',
        attrs: { Id: signatureId },
        location: {
          reference: "//*[@Id='signature-extension-content']",
          action: 'append',
        },
      });

      return { signedXml: (signedXml as any).getSignedXml() };
    } catch (error) {
      throw new InternalServerErrorException(`XML signing failed: ${error.message}`);
    }
  }
}