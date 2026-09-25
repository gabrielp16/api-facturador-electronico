const assert = require('node:assert/strict');
const test = require('node:test');

const { InvoicesApiKeyGuard } = require('../dist/common/guards/invoices-api-key.guard');

function createContextWithHeader(headerValue) {
  return {
    switchToHttp() {
      return {
        getRequest() {
          return {
            headers: {
              'x-invoices-api-key': headerValue,
            },
          };
        },
      };
    },
  };
}

test('InvoicesApiKeyGuard allows requests with valid key', () => {
  const guard = new InvoicesApiKeyGuard({
    get() {
      return 'secret-key-123';
    },
  });

  const allowed = guard.canActivate(createContextWithHeader('secret-key-123'));
  assert.equal(allowed, true);
});

test('InvoicesApiKeyGuard rejects requests with invalid key', () => {
  const guard = new InvoicesApiKeyGuard({
    get() {
      return 'secret-key-123';
    },
  });

  assert.throws(() => {
    guard.canActivate(createContextWithHeader('wrong-key'));
  });
});
