const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildRejectionMonthlyReportCsv,
  buildReprocessPolicyApprovalCsv,
  computeHmacSha256Base64,
  computeSha256Hex,
} = require('../dist/modules/invoices/monthly-report-csv.util');

test('buildRejectionMonthlyReportCsv returns csv with key sections', () => {
  const csv = buildRejectionMonthlyReportCsv({
    period: {
      year: 2026,
      month: 9,
      from: '2026-09-01T00:00:00.000Z',
      toExclusive: '2026-10-01T00:00:00.000Z',
    },
    governance: {
      totalInvoicesInMonth: 100,
      rejectedInvoicesInMonth: 7,
      rejectionRatePercent: 7,
      approvalsInMonth: 2,
      deploymentsInMonth: 3,
      deploymentsByEnvironment: [{ environment: 'production', count: 2 }],
    },
    recommendation: {
      totalRejectedInvoices: 50,
      sampledTopStatusCodes: [{ code: '99', count: 20 }],
      sampledTopRuleCodes: [{ code: 'FAD06', count: 10 }],
      recommendation: {
        blockedStatusCodes: ['99'],
        blockedRulePrefixes: ['FAD'],
      },
      thresholds: {
        statusMinOccurrences: 5,
        rulePrefixMinOccurrences: 8,
        rulePrefixLength: 3,
      },
      envSnippet: ['DIAN_REPROCESS_BLOCKED_STATUS_CODES=99'],
      generatedAt: '2026-09-24T10:00:00.000Z',
    },
    approvals: [
      {
        version: 'RPA-20260924T185501Z',
        approvedAt: new Date('2026-09-24T18:55:01.000Z'),
        approvedBy: 'lider.fiscal@empresa.com',
        approvalTicket: 'APRV-1',
        deploymentsInMonth: 1,
      },
    ],
    recentDeployments: [
      {
        version: 'RPA-20260924T185501Z',
        environment: 'production',
        deployedAt: new Date('2026-09-24T20:00:00.000Z'),
        deployedBy: 'devops@empresa.com',
        changeTicket: 'CHG-1',
      },
    ],
    latestApprovedSnapshot: {
      version: 'RPA-20260924T185501Z',
      approvedAt: new Date('2026-09-24T18:55:01.000Z'),
      approvedBy: 'lider.fiscal@empresa.com',
    },
    generatedAt: '2026-09-24T21:00:00.000Z',
  });

  assert.ok(csv.includes('"section","metric","value","extra1","extra2"'));
  assert.ok(csv.includes('"governance","totalInvoicesInMonth","100"'));
  assert.ok(csv.includes('"recommendationResult","blockedStatusCodes","99"'));
  assert.ok(csv.includes('"recentDeployments","RPA-20260924T185501Z","production"'));
});

test('buildReprocessPolicyApprovalCsv returns csv for snapshot and deployments', () => {
  const csv = buildReprocessPolicyApprovalCsv({
    version: 'RPA-20260924T185501Z',
    approvalTicket: 'APRV-1',
    approvedBy: 'lider.fiscal@empresa.com',
    approvedAt: new Date('2026-09-24T18:55:01.000Z'),
    blockedStatusCodes: ['99'],
    blockedRulePrefixes: ['FAD'],
    statusMinOccurrences: 5,
    rulePrefixMinOccurrences: 8,
    rulePrefixLength: 3,
    sampleLimit: 200,
    envSnippet: ['DIAN_REPROCESS_BLOCKED_STATUS_CODES=99'],
    sampledTopStatusCodes: [{ code: '99', count: 10 }],
    sampledTopRuleCodes: [{ code: 'FAD06', count: 6 }],
    totalRejectedInvoices: 25,
    deployments: [
      {
        environment: 'production',
        deployedAt: new Date('2026-09-25T10:00:00.000Z'),
        deployedBy: 'devops@empresa.com',
        changeTicket: 'CHG-1',
        requestSource: 'PIPELINE',
      },
    ],
  });

  assert.ok(csv.includes('"snapshot","version","RPA-20260924T185501Z"'));
  assert.ok(csv.includes('"policy","blockedStatusCodes","99"'));
  assert.ok(csv.includes('"deployments","production"'));
});

test('computeSha256Hex returns stable lowercase digest', () => {
  const digestA = computeSha256Hex('hello-world');
  const digestB = computeSha256Hex('hello-world');

  assert.equal(digestA, digestB);
  assert.match(digestA, /^[a-f0-9]{64}$/);
});

test('computeHmacSha256Base64 returns stable base64 signature', () => {
  const signatureA = computeHmacSha256Base64('hello-world', 'my-secret-value');
  const signatureB = computeHmacSha256Base64('hello-world', 'my-secret-value');

  assert.equal(signatureA, signatureB);
  assert.match(signatureA, /^[A-Za-z0-9+/]+=*$/);
});
