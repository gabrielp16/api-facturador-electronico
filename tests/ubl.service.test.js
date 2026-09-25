const assert = require('node:assert/strict');
const test = require('node:test');

const { UblService } = require('../dist/modules/ubl/ubl.service');

function createConfigService() {
  const values = {
    'dian.profileExecutionId': '2',
    'dian.softwareId': 'software-id-123',
    'dian.softwarePin': 'software-pin-456',
    'dian.environment': 'testing',
    'dian.qrTestUrl': 'https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=',
    'dian.qrProdUrl': 'https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=',
    'dian.company.nit': '900999888',
    'dian.company': {
      nit: '900999888',
      dv: '1',
      name: 'MORCHIS SAS',
      regime: '48',
      taxLevelCode: 'O-13',
      responsibility: 'R-99-PN',
      phone: '3000000000',
      email: 'facturacion@morchis.com',
      address: 'Parque Industrial Morchis Bodega 12',
      cityCode: '11001',
      cityName: 'Bogota',
      departmentCode: '11',
      departmentName: 'Bogota D.C.',
      countryCode: 'CO',
      countryName: 'Colombia',
      municipalityCode: '11001',
    },
    'dian.resolution': {
      number: '18760000001',
      prefix: 'SETP',
      from: 1,
      to: 500000,
      validFrom: '2026-01-01',
      validTo: '2026-12-31',
    },
  };

  return {
    get(key) {
      return values[key];
    },
  };
}

function createPreparedInvoice() {
  return {
    invoiceNumber: 'SETP98001',
    resolutionPrefix: 'SETP',
    resolutionNumber: 98001,
    issueDate: '2026-09-24',
    issueTime: '10:10:10-05:00',
    paymentDueDate: '2026-09-24',
    currencyCode: 'COP',
    notes: ['Prueba automatizada'],
    saleOrderId: 'SO-100245',
    customer: {
      identificationType: '13',
      identificationNumber: '1020304050',
      legalName: 'Cliente Prueba',
      phone: '3001234567',
      email: 'cliente@correo.com',
      address: 'Cra 15 # 93-47',
      cityCode: '11001',
      cityName: 'Bogota',
      municipalityCode: '11001',
      departmentName: 'Bogota D.C.',
      departmentCode: '11',
      countryCode: 'CO',
      countryName: 'Colombia',
      taxLevelCode: 'R-99-PN',
      taxSchemeId: '01',
      responsibilityCode: 'R-99-PN',
    },
    items: [
      {
        index: 1,
        sku: 'PRD-001',
        description: 'Producto de prueba',
        quantity: 1,
        unitCode: 'EA',
        unitPrice: 10000,
        baseAmount: 10000,
        discountAmount: 0,
        lineExtensionAmount: 10000,
        taxes: [
          {
            code: '01',
            name: 'IVA',
            taxableAmount: 10000,
            amount: 1900,
            percent: 19,
          },
        ],
        totalAmount: 11900,
      },
    ],
    totals: {
      lineExtensionTotal: 10000,
      taxableTotal: 10000,
      taxTotal: 1900,
      allowanceTotal: 0,
      payableAmount: 11900,
      taxByCode: [
        {
          code: '01',
          name: 'IVA',
          taxableAmount: 10000,
          amount: 1900,
          percent: 19,
        },
      ],
    },
    sendEmail: false,
    metadata: {
      paymentMeansCode: '10',
      paymentTermsNote: 'Pago de contado',
    },
  };
}

test('UblService builds XML including PaymentTerms and mandatory invoice blocks', () => {
  const service = new UblService(createConfigService());
  const xml = service.buildInvoiceXml(createPreparedInvoice(), 'cufe-test-123');

  assert.ok(xml.includes('<cac:PaymentTerms>'));
  assert.ok(xml.includes('<cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>'));
  assert.ok(xml.includes('<cac:AccountingSupplierParty>'));
  assert.ok(xml.includes('<cac:AccountingCustomerParty>'));
  assert.ok(xml.includes('<cbc:UUID schemeID="2" schemeName="CUFE-SHA384">cufe-test-123</cbc:UUID>'));
});

test('UblService validateGeneratedInvoiceXml rejects invalid XML payload', () => {
  const service = new UblService(createConfigService());

  assert.throws(() => {
    service.validateGeneratedInvoiceXml('<Invoice></Invoice>');
  });
});
