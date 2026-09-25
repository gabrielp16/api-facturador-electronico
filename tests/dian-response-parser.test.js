const assert = require('node:assert/strict');
const test = require('node:test');

const { DianResponseParser } = require('../dist/modules/dian/dian-response.parser');

test('DianResponseParser normalizes sync submission payload', () => {
  const parser = new DianResponseParser();

  const result = parser.parseSubmissionResponse({
    response: {
      SendBillSyncResult: {
        StatusCode: '00',
        StatusDescription: 'Procesado Correctamente.',
        XmlDocumentKey: 'track-001',
        XmlBase64Bytes: 'base64-app-response',
      },
    },
    zipName: 'SETP98001.zip',
    asyncMode: false,
    correlationId: 'corr-1',
  });

  assert.equal(result.accepted, true);
  assert.equal(result.pending, false);
  assert.equal(result.rejected, false);
  assert.equal(result.statusCode, '00');
  assert.equal(result.trackId, 'track-001');
  assert.equal(result.applicationResponse, 'base64-app-response');
  assert.equal(result.zipName, 'SETP98001.zip');
  assert.equal(result.correlationId, 'corr-1');
});

test('DianResponseParser normalizes async submission payload', () => {
  const parser = new DianResponseParser();

  const result = parser.parseSubmissionResponse({
    response: {
      sendBillAsyncResult: {
        zipKey: 'async-track-001',
        message: 'En proceso DIAN',
      },
    },
    zipName: 'SETP98002.zip',
    asyncMode: true,
  });

  assert.equal(result.accepted, false);
  assert.equal(result.pending, true);
  assert.equal(result.rejected, false);
  assert.equal(result.trackId, 'async-track-001');
  assert.equal(result.message, 'En proceso DIAN');
});

test('DianResponseParser normalizes status payload with alternative field names', () => {
  const parser = new DianResponseParser();

  const result = parser.parseStatusResponse({
    response: {
      getStatusResult: {
        statusCode: '99',
        statusDescription: 'Documento rechazado',
        statusMessage: 'Error de validacion',
        zipKey: 'async-track-002',
        errorMessage: ['Regla 90', 'Regla 91'],
      },
    },
    correlationId: 'corr-2',
  });

  assert.equal(result.isValid, false);
  assert.equal(result.statusCode, '99');
  assert.equal(result.trackId, 'async-track-002');
  assert.deepEqual(result.errors, ['Regla 90', 'Regla 91']);
  assert.equal(result.correlationId, 'corr-2');
});

test('DianResponseParser converts object errors into strings', () => {
  const parser = new DianResponseParser();

  const result = parser.parseSubmissionResponse({
    response: {
      SendBillSyncResult: {
        StatusCode: '90',
        StatusDescription: 'Procesado con errores',
        ErrorMessage: { code: 'E001', detail: 'Campo invalido' },
      },
    },
    zipName: 'SETP98003.zip',
    asyncMode: false,
  });

  assert.equal(result.errors.length, 1);
  assert.ok(result.errors[0].includes('E001'));
});
