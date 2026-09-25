const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildReprocessPolicyRecommendation,
  evaluateReprocessPolicy,
  extractDianRuleCodes,
  parseCsvToList,
  parseCsvToSet,
} = require('../dist/modules/invoices/reprocess-policy.util');

test('extractDianRuleCodes parses DIAN-like rule identifiers from errors', () => {
  const ruleCodes = extractDianRuleCodes([
    'Regla FAD06: El NIT del adquiriente no coincide',
    { detail: 'Error CAD15 en valor de impuestos' },
  ]);

  assert.equal(ruleCodes.includes('FAD06'), true);
  assert.equal(ruleCodes.includes('CAD15'), true);
});

test('evaluateReprocessPolicy blocks when status code is blocked', () => {
  const decision = evaluateReprocessPolicy({
    statusCode: '99',
    errors: ['Regla FAD06'],
    config: {
      allowedStatusCodes: parseCsvToSet('99,90'),
      blockedStatusCodes: parseCsvToSet('99'),
      blockedRuleCodePrefixes: parseCsvToList('FAJ'),
      requireApprovalForBlocked: true,
    },
  });

  assert.equal(decision.blocked, true);
  assert.match(decision.reason, /blocked/i);
});

test('evaluateReprocessPolicy blocks when rule code prefix is blocked', () => {
  const decision = evaluateReprocessPolicy({
    statusCode: '42',
    errors: ['Regla FAD06: problema de identificacion'],
    config: {
      allowedStatusCodes: parseCsvToSet(''),
      blockedStatusCodes: parseCsvToSet(''),
      blockedRuleCodePrefixes: parseCsvToList('FAD,FAK'),
      requireApprovalForBlocked: true,
    },
  });

  assert.equal(decision.blocked, true);
  assert.match(decision.reason, /FAD06/);
});

test('evaluateReprocessPolicy allows when constraints are satisfied', () => {
  const decision = evaluateReprocessPolicy({
    statusCode: '42',
    errors: ['Regla XYZ10'],
    config: {
      allowedStatusCodes: parseCsvToSet('42,99'),
      blockedStatusCodes: parseCsvToSet('90'),
      blockedRuleCodePrefixes: parseCsvToList('FAD'),
      requireApprovalForBlocked: true,
    },
  });

  assert.equal(decision.blocked, false);
});

test('buildReprocessPolicyRecommendation suggests status and prefixes by threshold', () => {
  const recommendation = buildReprocessPolicyRecommendation({
    statusCodes: [
      { code: '99', count: 11 },
      { code: '42', count: 2 },
    ],
    ruleCodes: [
      { code: 'FAD06', count: 7 },
      { code: 'FAD07', count: 5 },
      { code: 'CAD15', count: 3 },
    ],
    statusMinOccurrences: 5,
    rulePrefixMinOccurrences: 10,
    rulePrefixLength: 3,
  });

  assert.deepEqual(recommendation.blockedStatusCodes, ['99']);
  assert.deepEqual(recommendation.blockedRulePrefixes, ['FAD']);
});