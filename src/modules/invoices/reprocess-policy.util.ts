export interface ReprocessPolicyConfig {
  allowedStatusCodes: Set<string>;
  blockedStatusCodes: Set<string>;
  blockedRuleCodePrefixes: string[];
  requireApprovalForBlocked: boolean;
}

export interface ReprocessPolicyDecision {
  statusCode: string | null;
  matchedRuleCodes: string[];
  blocked: boolean;
  reason?: string;
}

export interface RejectionCodeCount {
  code: string;
  count: number;
}

export interface ReprocessPolicyRecommendationInput {
  statusCodes: RejectionCodeCount[];
  ruleCodes: RejectionCodeCount[];
  statusMinOccurrences: number;
  rulePrefixMinOccurrences: number;
  rulePrefixLength: number;
}

export interface ReprocessPolicyRecommendation {
  blockedStatusCodes: string[];
  blockedRulePrefixes: string[];
}

const DEFAULT_RULE_CODE_REGEX = /\b([A-Z]{2,8}\d{2,5})\b/g;
const DEFAULT_REGLA_REGEX = /\bregla\s+([A-Z]{0,4}\d{2,5})\b/gi;

export function parseCsvToSet(value?: string): Set<string> {
  if (!value?.trim()) {
    return new Set<string>();
  }

  return new Set(
    value
      .split(',')
      .map((entry) => entry.trim().toUpperCase())
      .filter(Boolean),
  );
}

export function parseCsvToList(value?: string): string[] {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(',')
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);
}

export function extractDianRuleCodes(errors: unknown[]): string[] {
  const found = new Set<string>();

  for (const error of errors || []) {
    const text = typeof error === 'string' ? error : JSON.stringify(error);

    const directMatches = text.matchAll(DEFAULT_RULE_CODE_REGEX);
    for (const match of directMatches) {
      if (match[1]) {
        found.add(match[1].toUpperCase());
      }
    }

    const reglaMatches = text.matchAll(DEFAULT_REGLA_REGEX);
    for (const match of reglaMatches) {
      if (match[1]) {
        found.add(match[1].toUpperCase());
      }
    }
  }

  return Array.from(found);
}

export function evaluateReprocessPolicy(input: {
  statusCode?: string | null;
  errors?: unknown[];
  config: ReprocessPolicyConfig;
}): ReprocessPolicyDecision {
  const statusCode = input.statusCode?.trim()?.toUpperCase() || null;
  const matchedRuleCodes = extractDianRuleCodes(input.errors || []);

  if (statusCode && input.config.blockedStatusCodes.has(statusCode)) {
    return {
      statusCode,
      matchedRuleCodes,
      blocked: true,
      reason: `StatusCode ${statusCode} is blocked for direct reprocess`,
    };
  }

  if (statusCode && input.config.allowedStatusCodes.size > 0 && !input.config.allowedStatusCodes.has(statusCode)) {
    return {
      statusCode,
      matchedRuleCodes,
      blocked: true,
      reason: `StatusCode ${statusCode} is not in allowed reprocess status codes`,
    };
  }

  if (input.config.blockedRuleCodePrefixes.length > 0 && matchedRuleCodes.length > 0) {
    const blockedRule = matchedRuleCodes.find((ruleCode) =>
      input.config.blockedRuleCodePrefixes.some((prefix) => ruleCode.startsWith(prefix)),
    );

    if (blockedRule) {
      return {
        statusCode,
        matchedRuleCodes,
        blocked: true,
        reason: `Rule code ${blockedRule} is blocked for direct reprocess`,
      };
    }
  }

  return {
    statusCode,
    matchedRuleCodes,
    blocked: false,
  };
}

export function buildReprocessPolicyRecommendation(
  input: ReprocessPolicyRecommendationInput,
): ReprocessPolicyRecommendation {
  const statusMin = Math.max(1, input.statusMinOccurrences || 1);
  const prefixMin = Math.max(1, input.rulePrefixMinOccurrences || 1);
  const prefixLength = Math.max(2, Math.min(8, input.rulePrefixLength || 3));

  const blockedStatusCodes = input.statusCodes
    .filter((entry) => Number(entry.count || 0) >= statusMin)
    .map((entry) => entry.code.trim().toUpperCase())
    .filter(Boolean);

  const prefixCounter = new Map<string, number>();
  for (const rule of input.ruleCodes) {
    const normalizedCode = rule.code.trim().toUpperCase();
    if (!normalizedCode) {
      continue;
    }

    const prefix = normalizedCode.slice(0, prefixLength);
    const current = prefixCounter.get(prefix) || 0;
    prefixCounter.set(prefix, current + Number(rule.count || 0));
  }

  const blockedRulePrefixes = Array.from(prefixCounter.entries())
    .filter(([, count]) => count >= prefixMin)
    .sort((a, b) => b[1] - a[1])
    .map(([prefix]) => prefix);

  return {
    blockedStatusCodes: Array.from(new Set(blockedStatusCodes)),
    blockedRulePrefixes,
  };
}