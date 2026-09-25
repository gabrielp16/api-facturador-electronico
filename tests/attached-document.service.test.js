const assert = require('node:assert/strict');
const test = require('node:test');

const { AttachedDocumentService } = require('../dist/modules/attached-document/attached-document.service');

test('AttachedDocumentService builds XML with signed invoice and application response attachments', () => {
  const service = new AttachedDocumentService();

  const xml = service.buildAttachedDocumentXml({
    invoiceNumber: 'SETP98001',
    cufe: 'cufe-value-xyz',
    signedXml: '<Invoice Id="invoice-root"></Invoice>',
    applicationResponse: '<ApplicationResponse></ApplicationResponse>',
    statusCode: '00',
    statusDescription: 'Procesado Correctamente',
    validatedAt: new Date('2026-09-24T15:32:14.000Z'),
  });

  assert.ok(xml.includes('<AttachedDocument'));
  assert.ok(xml.includes('<cbc:ParentDocumentID>SETP98001</cbc:ParentDocumentID>'));
  assert.ok(xml.includes('InvoiceSignedXML'));
  assert.ok(xml.includes('ApplicationResponse'));
  assert.ok(xml.includes('EmbeddedDocumentBinaryObject'));
});
