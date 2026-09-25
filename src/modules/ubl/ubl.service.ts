import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { create } from 'xmlbuilder2';
import { createHash } from 'crypto';
import { formatAmount } from '../../common/utils/number.util';
import { PreparedInvoice } from '../invoices/types/invoice.types';

@Injectable()
export class UblService {
  constructor(private readonly configService: ConfigService) {}

  generateCufe(invoice: PreparedInvoice): string {
    const issuerNit = this.configService.get<string>('dian.company.nit');
    const profileExecutionId = this.configService.get<string>('dian.profileExecutionId');
    const technicalKey = this.configService.get<string>('dian.technicalKey');

    const iva = invoice.totals.taxByCode.find((tax) => tax.code === '01');
    const impoconsumo = invoice.totals.taxByCode.find((tax) => tax.code === '04');
    const ica = invoice.totals.taxByCode.find((tax) => tax.code === '03');

    const cufeSeed = [
      invoice.invoiceNumber,
      invoice.issueDate,
      invoice.issueTime,
      formatAmount(invoice.totals.lineExtensionTotal),
      '01',
      formatAmount(iva?.amount || 0),
      '04',
      formatAmount(impoconsumo?.amount || 0),
      '03',
      formatAmount(ica?.amount || 0),
      formatAmount(invoice.totals.payableAmount),
      issuerNit,
      invoice.customer.identificationNumber,
      technicalKey,
      profileExecutionId,
    ].join('');

    return createHash('sha384').update(cufeSeed, 'utf8').digest('hex');
  }

  generateSoftwareSecurityCode(invoiceNumber: string): string {
    const softwareId = this.configService.get<string>('dian.softwareId');
    const softwarePin = this.configService.get<string>('dian.softwarePin');

    return createHash('sha384')
      .update(`${softwareId}${softwarePin}${invoiceNumber}`, 'utf8')
      .digest('hex');
  }

  generateQrPayload(invoice: PreparedInvoice, cufe: string): string {
    const issuerNit = this.configService.get<string>('dian.company.nit');
    const environment = this.configService.get<string>('dian.environment');
    const baseQrUrl =
      environment === 'production'
        ? this.configService.get<string>('dian.qrProdUrl')
        : this.configService.get<string>('dian.qrTestUrl');
    const iva = invoice.totals.taxByCode.find((tax) => tax.code === '01');

    return [
      `NumFac: ${invoice.invoiceNumber}`,
      `FecFac: ${invoice.issueDate}`,
      `HorFac: ${invoice.issueTime}`,
      `NitFac: ${issuerNit}`,
      `DocAdq: ${invoice.customer.identificationNumber}`,
      `ValFac: ${formatAmount(invoice.totals.lineExtensionTotal)}`,
      `ValIva: ${formatAmount(iva?.amount || 0)}`,
      'ValOtroIm: 0.00',
      `ValTotFac: ${formatAmount(invoice.totals.payableAmount)}`,
      `CUFE: ${cufe}`,
      `URL: ${baseQrUrl}${cufe}`,
    ].join('\n');
  }

  buildInvoiceXml(invoice: PreparedInvoice, cufe: string): string {
    const profileExecutionId = this.configService.get<string>('dian.profileExecutionId');
    const company = this.configService.get<Record<string, string>>('dian.company');
    const resolution = this.configService.get<Record<string, string | number>>('dian.resolution');
    const softwareId = this.configService.get<string>('dian.softwareId');
    const qrPayload = this.generateQrPayload(invoice, cufe);
    const softwareSecurityCode = this.generateSoftwareSecurityCode(invoice.invoiceNumber);

    const taxTotals = invoice.totals.taxByCode.map((tax) => ({
      'cbc:TaxAmount': { '@currencyID': invoice.currencyCode, '#': formatAmount(tax.amount) },
      'cbc:RoundingAmount': { '@currencyID': invoice.currencyCode, '#': formatAmount(0) },
      'cac:TaxSubtotal': {
        'cbc:TaxableAmount': {
          '@currencyID': invoice.currencyCode,
          '#': formatAmount(tax.taxableAmount),
        },
        'cbc:TaxAmount': { '@currencyID': invoice.currencyCode, '#': formatAmount(tax.amount) },
        'cac:TaxCategory': {
          'cbc:Percent': formatAmount(tax.percent),
          'cac:TaxScheme': {
            'cbc:ID': tax.code,
            'cbc:Name': tax.name,
          },
        },
      },
    }));

    const invoiceLines = invoice.items.map((item) => ({
      'cbc:ID': item.index,
      'cbc:InvoicedQuantity': { '@unitCode': item.unitCode, '#': item.quantity.toFixed(3) },
      'cbc:LineExtensionAmount': {
        '@currencyID': invoice.currencyCode,
        '#': formatAmount(item.lineExtensionAmount),
      },
      ...(item.discountAmount > 0
        ? {
            'cac:AllowanceCharge': {
              'cbc:ChargeIndicator': 'false',
              'cbc:AllowanceChargeReason': 'Descuento comercial',
              'cbc:Amount': {
                '@currencyID': invoice.currencyCode,
                '#': formatAmount(item.discountAmount),
              },
              'cbc:BaseAmount': {
                '@currencyID': invoice.currencyCode,
                '#': formatAmount(item.baseAmount),
              },
            },
          }
        : {}),
      'cac:TaxTotal': item.taxes.map((tax) => ({
        'cbc:TaxAmount': { '@currencyID': invoice.currencyCode, '#': formatAmount(tax.amount) },
        'cac:TaxSubtotal': {
          'cbc:TaxableAmount': {
            '@currencyID': invoice.currencyCode,
            '#': formatAmount(tax.taxableAmount),
          },
          'cbc:TaxAmount': { '@currencyID': invoice.currencyCode, '#': formatAmount(tax.amount) },
          'cac:TaxCategory': {
            'cbc:Percent': formatAmount(tax.percent),
            'cac:TaxScheme': {
              'cbc:ID': tax.code,
              'cbc:Name': tax.name,
            },
          },
        },
      })),
      'cac:Item': {
        'cbc:Description': item.description,
        'cac:SellersItemIdentification': {
          'cbc:ID': item.sku,
        },
      },
      'cac:Price': {
        'cbc:PriceAmount': { '@currencyID': invoice.currencyCode, '#': formatAmount(item.unitPrice) },
        'cbc:BaseQuantity': { '@unitCode': item.unitCode, '#': item.quantity.toFixed(3) },
      },
    }));

    const invoiceObject = {
      Invoice: {
        '@xmlns': 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
        '@xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
        '@xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
        '@xmlns:clm54217': 'urn:un:unece:uncefact:codelist:specification:54217:2001',
        '@xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
        '@xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
        '@xmlns:qdt': 'urn:oasis:names:specification:ubl:schema:xsd:QualifiedDatatypes-2',
        '@xmlns:sts': 'dian:gov:co:facturaelectronica:Structures-2-1',
        '@xmlns:xades': 'http://uri.etsi.org/01903/v1.3.2#',
        '@xmlns:xades141': 'http://uri.etsi.org/01903/v1.4.1#',
        '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        '@Id': 'invoice-root',
        'ext:UBLExtensions': {
          'ext:UBLExtension': [
            {
              'ext:ExtensionContent': {
                'sts:DianExtensions': {
                  'sts:InvoiceControl': {
                    'sts:InvoiceAuthorization': resolution.number,
                    'sts:AuthorizationPeriod': {
                      'cbc:StartDate': resolution.validFrom,
                      'cbc:EndDate': resolution.validTo,
                    },
                    'sts:AuthorizedInvoices': {
                      'sts:Prefix': resolution.prefix,
                      'sts:From': String(resolution.from),
                      'sts:To': String(resolution.to),
                    },
                  },
                  'sts:InvoiceSource': {
                    'cbc:IdentificationCode': {
                      '@listAgencyID': '6',
                      '@listAgencyName': 'United Nations Economic Commission for Europe',
                      '@listSchemeURI': 'urn:oasis:names:specification:ubl:codelist:gc:CountryIdentificationCode-2.1',
                      '#': 'CO',
                    },
                  },
                  'sts:SoftwareProvider': {
                    'sts:ProviderID': {
                      '@schemeAgencyID': '195',
                      '@schemeAgencyName': 'CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)',
                      '@schemeID': company.dv,
                      '#': company.nit,
                    },
                    'sts:SoftwareID': {
                      '@schemeAgencyID': '195',
                      '@schemeAgencyName': 'CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)',
                      '#': softwareId,
                    },
                  },
                  'sts:SoftwareSecurityCode': {
                    '@schemeAgencyID': '195',
                    '@schemeAgencyName': 'CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)',
                    '#': softwareSecurityCode,
                  },
                  'sts:AuthorizationProvider': {
                    'sts:AuthorizationProviderID': {
                      '@schemeAgencyID': '195',
                      '@schemeAgencyName': 'CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)',
                      '@schemeID': '4',
                      '#': '800197268',
                    },
                  },
                  'sts:QRCode': qrPayload,
                },
              },
            },
            {
              'ext:ExtensionContent': {
                '@Id': 'signature-extension-content',
              },
            },
          ],
        },
        'cbc:UBLVersionID': 'UBL 2.1',
        'cbc:CustomizationID': '10',
        'cbc:ProfileID': 'DIAN 2.1: Factura Electrónica de Venta',
        'cbc:ProfileExecutionID': profileExecutionId,
        'cbc:ID': invoice.invoiceNumber,
        'cbc:UUID': {
          '@schemeID': profileExecutionId,
          '@schemeName': 'CUFE-SHA384',
          '#': cufe,
        },
        'cbc:IssueDate': invoice.issueDate,
        'cbc:IssueTime': invoice.issueTime,
        'cbc:DueDate': invoice.paymentDueDate,
        'cbc:InvoiceTypeCode': '01',
        ...(invoice.notes?.length ? { 'cbc:Note': invoice.notes } : {}),
        'cbc:DocumentCurrencyCode': invoice.currencyCode,
        'cbc:LineCountNumeric': invoice.items.length,
        'cac:AccountingSupplierParty': {
          'cbc:AdditionalAccountID': '1',
          'cac:Party': {
            'cac:PartyName': {
              'cbc:Name': company.name,
            },
            'cac:PhysicalLocation': {
              'cac:Address': {
                'cbc:ID': company.cityCode,
                'cbc:CityName': company.cityName,
                'cbc:PostalZone': company.municipalityCode,
                'cbc:CountrySubentity': company.departmentName,
                'cbc:CountrySubentityCode': company.departmentCode,
                'cac:AddressLine': {
                  'cbc:Line': company.address,
                },
                'cac:Country': {
                  'cbc:IdentificationCode': company.countryCode,
                  'cbc:Name': {
                    '@languageID': 'es',
                    '#': company.countryName,
                  },
                },
              },
            },
            'cac:PartyTaxScheme': {
              'cbc:RegistrationName': company.name,
              'cbc:CompanyID': {
                '@schemeAgencyID': '195',
                '@schemeAgencyName': 'CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)',
                '@schemeID': company.dv,
                '@schemeName': '31',
                '#': company.nit,
              },
              'cbc:TaxLevelCode': company.taxLevelCode,
              'cac:RegistrationAddress': {
                'cbc:ID': company.cityCode,
                'cbc:CityName': company.cityName,
                'cbc:CountrySubentity': company.departmentName,
                'cbc:CountrySubentityCode': company.departmentCode,
                'cac:AddressLine': {
                  'cbc:Line': company.address,
                },
                'cac:Country': {
                  'cbc:IdentificationCode': company.countryCode,
                  'cbc:Name': {
                    '@languageID': 'es',
                    '#': company.countryName,
                  },
                },
              },
              'cac:TaxScheme': {
                'cbc:ID': company.regime,
                'cbc:Name': company.responsibility,
              },
            },
            'cac:PartyLegalEntity': {
              'cbc:RegistrationName': company.name,
              'cbc:CompanyID': {
                '@schemeAgencyID': '195',
                '@schemeAgencyName': 'CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)',
                '@schemeID': company.dv,
                '@schemeName': '31',
                '#': company.nit,
              },
              'cac:CorporateRegistrationScheme': {
                'cbc:ID': invoice.invoiceNumber,
                'cbc:Name': resolution.prefix,
              },
            },
            'cac:Contact': {
              'cbc:Telephone': company.phone,
              'cbc:ElectronicMail': company.email,
            },
          },
        },
        'cac:AccountingCustomerParty': {
          'cbc:AdditionalAccountID': '1',
          'cac:Party': {
            'cac:PartyIdentification': {
              'cbc:ID': {
                '@schemeName': invoice.customer.identificationType,
                '#': invoice.customer.identificationNumber,
              },
            },
            'cac:PartyName': {
              'cbc:Name': invoice.customer.legalName,
            },
            'cac:PhysicalLocation': {
              'cac:Address': {
                'cbc:ID': invoice.customer.cityCode,
                'cbc:CityName': invoice.customer.cityName,
                'cbc:PostalZone': invoice.customer.municipalityCode,
                'cbc:CountrySubentity': invoice.customer.departmentName,
                'cbc:CountrySubentityCode': invoice.customer.departmentCode,
                'cac:AddressLine': {
                  'cbc:Line': invoice.customer.address,
                },
                'cac:Country': {
                  'cbc:IdentificationCode': invoice.customer.countryCode,
                  'cbc:Name': {
                    '@languageID': 'es',
                    '#': invoice.customer.countryName,
                  },
                },
              },
            },
            'cac:PartyTaxScheme': {
              'cbc:RegistrationName': invoice.customer.legalName,
              'cbc:CompanyID': {
                '@schemeAgencyID': '195',
                '@schemeAgencyName': 'CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)',
                '@schemeID': invoice.customer.dv || '0',
                '@schemeName': invoice.customer.identificationType,
                '#': invoice.customer.identificationNumber,
              },
              'cbc:TaxLevelCode': invoice.customer.taxLevelCode,
              'cac:TaxScheme': {
                'cbc:ID': invoice.customer.taxSchemeId,
                'cbc:Name': invoice.customer.responsibilityCode,
              },
            },
            'cac:PartyLegalEntity': {
              'cbc:RegistrationName': invoice.customer.legalName,
              'cbc:CompanyID': {
                '@schemeAgencyID': '195',
                '@schemeAgencyName': 'CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)',
                '@schemeID': invoice.customer.dv || '0',
                '@schemeName': invoice.customer.identificationType,
                '#': invoice.customer.identificationNumber,
              },
            },
            'cac:Contact': {
              'cbc:Telephone': invoice.customer.phone,
              'cbc:ElectronicMail': invoice.customer.email,
            },
          },
        },
        'cac:PaymentMeans': {
          'cbc:ID': '1',
          'cbc:PaymentMeansCode': invoice.metadata?.paymentMeansCode || '10',
          'cbc:PaymentDueDate': invoice.paymentDueDate,
          'cbc:PaymentID': invoice.saleOrderId,
        },
        'cac:PaymentTerms': {
          'cbc:ID': String(invoice.metadata?.paymentTermsId || '1'),
          'cbc:PaymentMeansID': invoice.metadata?.paymentMeansCode || '10',
          'cbc:Note':
            String(invoice.metadata?.paymentTermsNote || '').trim() ||
            (invoice.metadata?.paymentMeansCode === '10' ? 'Contado' : 'Credito'),
        },
        'cac:TaxTotal': taxTotals,
        'cac:LegalMonetaryTotal': {
          'cbc:LineExtensionAmount': {
            '@currencyID': invoice.currencyCode,
            '#': formatAmount(invoice.totals.lineExtensionTotal),
          },
          'cbc:TaxExclusiveAmount': {
            '@currencyID': invoice.currencyCode,
            '#': formatAmount(invoice.totals.taxableTotal),
          },
          'cbc:TaxInclusiveAmount': {
            '@currencyID': invoice.currencyCode,
            '#': formatAmount(invoice.totals.payableAmount),
          },
          'cbc:AllowanceTotalAmount': {
            '@currencyID': invoice.currencyCode,
            '#': formatAmount(invoice.totals.allowanceTotal),
          },
          'cbc:PayableAmount': {
            '@currencyID': invoice.currencyCode,
            '#': formatAmount(invoice.totals.payableAmount),
          },
        },
        'cac:InvoiceLine': invoiceLines,
      },
    };

    const xml = create(invoiceObject).end({ prettyPrint: true });
    this.validateGeneratedInvoiceXml(xml);

    return xml;
  }

  validateGeneratedInvoiceXml(xml: string): void {
    if (!xml || typeof xml !== 'string') {
      throw new BadRequestException('Generated XML is empty or invalid');
    }

    const requiredSnippets = [
      '<Invoice',
      '<ext:UBLExtensions',
      '<cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>',
      '<cbc:ProfileExecutionID>',
      '<cbc:UUID',
      '<cbc:DocumentCurrencyCode>',
      '<cac:AccountingSupplierParty>',
      '<cac:AccountingCustomerParty>',
      '<cac:PaymentMeans>',
      '<cac:PaymentTerms>',
      '<cac:TaxTotal>',
      '<cac:LegalMonetaryTotal>',
      '<cac:InvoiceLine>',
    ];

    const missing = requiredSnippets.filter((snippet) => !xml.includes(snippet));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Generated XML is missing required DIAN/UBL nodes: ${missing.join(', ')}`,
      );
    }

    const extensionsIdx = xml.indexOf('<ext:UBLExtensions');
    const ublVersionIdx = xml.indexOf('<cbc:UBLVersionID>');

    if (extensionsIdx === -1 || ublVersionIdx === -1 || extensionsIdx > ublVersionIdx) {
      throw new BadRequestException(
        'Generated XML has invalid node order: ext:UBLExtensions must appear before UBLVersionID',
      );
    }
  }
}