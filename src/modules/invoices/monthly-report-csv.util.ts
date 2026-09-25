import { createHash, createHmac } from 'crypto';

type CsvCell = string | number | boolean | null | undefined;

function csvCell(value: CsvCell): string {
  const normalized = value === null || value === undefined ? '' : String(value);
  const escaped = normalized.replace(/"/g, '""');
  return `"${escaped}"`;
}

function csvRow(values: CsvCell[]): string {
  return values.map((value) => csvCell(value)).join(',');
}

export function buildRejectionMonthlyReportCsv(report: {
  period: { year: number; month: number; from: string; toExclusive: string };
  governance: {
    totalInvoicesInMonth: number;
    rejectedInvoicesInMonth: number;
    rejectionRatePercent: number;
    approvalsInMonth: number;
    deploymentsInMonth: number;
    deploymentsByEnvironment: Array<{ environment: string; count: number }>;
  };
  recommendation: {
    totalRejectedInvoices: number;
    sampledTopStatusCodes: Array<{ code: string; count: number }>;
    sampledTopRuleCodes: Array<{ code: string; count: number }>;
    recommendation: {
      blockedStatusCodes: string[];
      blockedRulePrefixes: string[];
    };
    thresholds: {
      statusMinOccurrences: number;
      rulePrefixMinOccurrences: number;
      rulePrefixLength: number;
    };
    envSnippet: string[];
    generatedAt: string;
  };
  approvals: Array<{
    version: string;
    approvedAt: Date;
    approvedBy?: string;
    approvalTicket?: string;
    deploymentsInMonth: number;
  }>;
  recentDeployments: Array<{
    version: string;
    environment: string;
    deployedAt: Date;
    deployedBy?: string;
    changeTicket?: string;
    requestSource?: string;
    requestUser?: string;
  }>;
  latestApprovedSnapshot?: { version?: string; approvedAt?: Date; approvedBy?: string } | null;
  generatedAt: string;
}): string {
  const lines: string[] = [];

  lines.push(csvRow(['section', 'metric', 'value', 'extra1', 'extra2']));

  lines.push(csvRow(['period', 'year', report.period.year, '', '']));
  lines.push(csvRow(['period', 'month', report.period.month, '', '']));
  lines.push(csvRow(['period', 'from', report.period.from, '', '']));
  lines.push(csvRow(['period', 'toExclusive', report.period.toExclusive, '', '']));

  lines.push(csvRow(['governance', 'totalInvoicesInMonth', report.governance.totalInvoicesInMonth, '', '']));
  lines.push(csvRow(['governance', 'rejectedInvoicesInMonth', report.governance.rejectedInvoicesInMonth, '', '']));
  lines.push(csvRow(['governance', 'rejectionRatePercent', report.governance.rejectionRatePercent, '', '']));
  lines.push(csvRow(['governance', 'approvalsInMonth', report.governance.approvalsInMonth, '', '']));
  lines.push(csvRow(['governance', 'deploymentsInMonth', report.governance.deploymentsInMonth, '', '']));

  for (const entry of report.governance.deploymentsByEnvironment || []) {
    lines.push(csvRow(['deploymentsByEnvironment', entry.environment, entry.count, '', '']));
  }

  lines.push(csvRow(['recommendation', 'totalRejectedInvoices', report.recommendation.totalRejectedInvoices, '', '']));
  lines.push(
    csvRow([
      'recommendationThresholds',
      'statusMinOccurrences',
      report.recommendation.thresholds.statusMinOccurrences,
      'rulePrefixMinOccurrences',
      report.recommendation.thresholds.rulePrefixMinOccurrences,
    ]),
  );
  lines.push(
    csvRow([
      'recommendationThresholds',
      'rulePrefixLength',
      report.recommendation.thresholds.rulePrefixLength,
      '',
      '',
    ]),
  );

  lines.push(
    csvRow([
      'recommendationResult',
      'blockedStatusCodes',
      report.recommendation.recommendation.blockedStatusCodes.join('|'),
      '',
      '',
    ]),
  );
  lines.push(
    csvRow([
      'recommendationResult',
      'blockedRulePrefixes',
      report.recommendation.recommendation.blockedRulePrefixes.join('|'),
      '',
      '',
    ]),
  );

  for (const status of report.recommendation.sampledTopStatusCodes || []) {
    lines.push(csvRow(['topStatusCodes', status.code, status.count, '', '']));
  }

  for (const rule of report.recommendation.sampledTopRuleCodes || []) {
    lines.push(csvRow(['topRuleCodes', rule.code, rule.count, '', '']));
  }

  for (const snippet of report.recommendation.envSnippet || []) {
    lines.push(csvRow(['envSnippet', 'line', snippet, '', '']));
  }

  for (const approval of report.approvals || []) {
    lines.push(
      csvRow([
        'approvals',
        approval.version,
        approval.approvedAt instanceof Date ? approval.approvedAt.toISOString() : approval.approvedAt,
        approval.approvedBy || '',
        approval.approvalTicket || '',
      ]),
    );
    lines.push(csvRow(['approvals', `${approval.version}:deploymentsInMonth`, approval.deploymentsInMonth, '', '']));
  }

  for (const deployment of report.recentDeployments || []) {
    lines.push(
      csvRow([
        'recentDeployments',
        deployment.version,
        deployment.environment,
        deployment.deployedAt instanceof Date ? deployment.deployedAt.toISOString() : deployment.deployedAt,
        deployment.changeTicket || deployment.deployedBy || '',
      ]),
    );
  }

  if (report.latestApprovedSnapshot) {
    lines.push(
      csvRow([
        'latestApprovedSnapshot',
        report.latestApprovedSnapshot.version || '',
        report.latestApprovedSnapshot.approvedAt instanceof Date
          ? report.latestApprovedSnapshot.approvedAt.toISOString()
          : report.latestApprovedSnapshot.approvedAt,
        report.latestApprovedSnapshot.approvedBy || '',
        '',
      ]),
    );
  }

  lines.push(csvRow(['meta', 'reportGeneratedAt', report.generatedAt, '', '']));
  lines.push(csvRow(['meta', 'recommendationGeneratedAt', report.recommendation.generatedAt, '', '']));

  return lines.join('\n');
}

export function buildReprocessPolicyApprovalCsv(snapshot: {
  version: string;
  approvalTicket?: string;
  approvedBy?: string;
  approvedAt: Date | string;
  blockedStatusCodes: string[];
  blockedRulePrefixes: string[];
  statusMinOccurrences: number;
  rulePrefixMinOccurrences: number;
  rulePrefixLength: number;
  sampleLimit: number;
  envSnippet: string[];
  sampledTopStatusCodes: Array<{ code: string; count: number }>;
  sampledTopRuleCodes: Array<{ code: string; count: number }>;
  totalRejectedInvoices: number;
  notes?: string;
  requestSource?: string;
  requestUser?: string;
  deployments?: Array<{
    environment: string;
    deployedAt: Date | string;
    deployedBy?: string;
    changeTicket?: string;
    requestSource?: string;
    requestUser?: string;
    envSnippet?: string[];
    notes?: string;
  }>;
}): string {
  const lines: string[] = [];

  lines.push(csvRow(['section', 'metric', 'value', 'extra1', 'extra2']));

  lines.push(csvRow(['snapshot', 'version', snapshot.version, '', '']));
  lines.push(
    csvRow([
      'snapshot',
      'approvedAt',
      snapshot.approvedAt instanceof Date ? snapshot.approvedAt.toISOString() : snapshot.approvedAt,
      'approvedBy',
      snapshot.approvedBy || '',
    ]),
  );
  lines.push(csvRow(['snapshot', 'approvalTicket', snapshot.approvalTicket || '', '', '']));
  lines.push(csvRow(['snapshot', 'requestSource', snapshot.requestSource || '', 'requestUser', snapshot.requestUser || '']));
  lines.push(csvRow(['snapshot', 'notes', snapshot.notes || '', '', '']));

  lines.push(csvRow(['policy', 'blockedStatusCodes', (snapshot.blockedStatusCodes || []).join('|'), '', '']));
  lines.push(csvRow(['policy', 'blockedRulePrefixes', (snapshot.blockedRulePrefixes || []).join('|'), '', '']));
  lines.push(csvRow(['policy', 'statusMinOccurrences', snapshot.statusMinOccurrences, '', '']));
  lines.push(csvRow(['policy', 'rulePrefixMinOccurrences', snapshot.rulePrefixMinOccurrences, '', '']));
  lines.push(csvRow(['policy', 'rulePrefixLength', snapshot.rulePrefixLength, '', '']));
  lines.push(csvRow(['policy', 'sampleLimit', snapshot.sampleLimit, '', '']));
  lines.push(csvRow(['policy', 'totalRejectedInvoices', snapshot.totalRejectedInvoices, '', '']));

  for (const snippet of snapshot.envSnippet || []) {
    lines.push(csvRow(['envSnippet', 'line', snippet, '', '']));
  }

  for (const status of snapshot.sampledTopStatusCodes || []) {
    lines.push(csvRow(['sampledTopStatusCodes', status.code, status.count, '', '']));
  }

  for (const rule of snapshot.sampledTopRuleCodes || []) {
    lines.push(csvRow(['sampledTopRuleCodes', rule.code, rule.count, '', '']));
  }

  for (const deployment of snapshot.deployments || []) {
    lines.push(
      csvRow([
        'deployments',
        deployment.environment,
        deployment.deployedAt instanceof Date ? deployment.deployedAt.toISOString() : deployment.deployedAt,
        deployment.changeTicket || deployment.deployedBy || '',
        deployment.requestSource || deployment.requestUser || '',
      ]),
    );
    if (deployment.envSnippet?.length) {
      lines.push(csvRow(['deploymentsEnvSnippet', deployment.environment, deployment.envSnippet.join('|'), '', '']));
    }
  }

  return lines.join('\n');
}

export function computeSha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function computeHmacSha256Base64(content: string, secret: string): string {
  return createHmac('sha256', secret).update(content, 'utf8').digest('base64');
}
