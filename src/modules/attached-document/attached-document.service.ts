import { Injectable } from '@nestjs/common';
import { create } from 'xmlbuilder2';

interface BuildAttachedDocumentInput {
  invoiceNumber: string;
  cufe: string;
  signedXml: string;
  applicationResponse?: string;
  statusCode?: string;
  statusDescription?: string;
  validatedAt?: Date;
}

@Injectable()
export class AttachedDocumentService {
  buildAttachedDocumentXml(input: BuildAttachedDocumentInput): string {
    const validatedAt = input.validatedAt || new Date();
    const issueDate = validatedAt.toISOString().slice(0, 10);
    const issueTime = validatedAt.toISOString().slice(11, 19);

    const applicationResponseBase64 = input.applicationResponse
      ? Buffer.from(input.applicationResponse, 'utf8').toString('base64')
      : '';

    const xmlObject = {
      AttachedDocument: {
        '@xmlns': 'urn:oasis:names:specification:ubl:schema:xsd:AttachedDocument-2',
        '@xmlns:cac':
          'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
        '@xmlns:cbc':
          'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
        'cbc:UBLVersionID': 'UBL 2.1',
        'cbc:CustomizationID': 'Documentos anexos',
        'cbc:ProfileID': 'DIAN 2.1: AttachedDocument',
        'cbc:ID': `${input.invoiceNumber}-AD`,
        'cbc:IssueDate': issueDate,
        'cbc:IssueTime': issueTime,
        'cbc:DocumentType': 'AttachedDocument',
        'cbc:ParentDocumentID': input.invoiceNumber,
        'cbc:UUID': {
          '@schemeName': 'CUFE-SHA384',
          '#': input.cufe,
        },
        'cbc:Description': [
          `DIAN StatusCode: ${input.statusCode || 'N/A'}`,
          `DIAN StatusDescription: ${input.statusDescription || 'N/A'}`,
        ],
        'cac:Attachment': {
          'cac:ExternalReference': {
            'cbc:Description': 'Signed invoice XML inlined in attachment',
          },
          'cac:AdditionalDocumentReference': [
            {
              'cbc:ID': `${input.invoiceNumber}.xml`,
              'cbc:DocumentType': 'InvoiceSignedXML',
              'cac:Attachment': {
                'cbc:EmbeddedDocumentBinaryObject': {
                  '@mimeCode': 'text/xml',
                  '@filename': `${input.invoiceNumber}.xml`,
                  '#': Buffer.from(input.signedXml, 'utf8').toString('base64'),
                },
              },
            },
            {
              'cbc:ID': `${input.invoiceNumber}-ApplicationResponse.xml`,
              'cbc:DocumentType': 'ApplicationResponse',
              'cac:Attachment': {
                'cbc:EmbeddedDocumentBinaryObject': {
                  '@mimeCode': 'text/xml',
                  '@filename': `${input.invoiceNumber}-ApplicationResponse.xml`,
                  '#': applicationResponseBase64,
                },
              },
            },
          ],
        },
      },
    };

    return create(xmlObject).end({ prettyPrint: true });
  }
}
