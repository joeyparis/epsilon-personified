import { DELEGATION_DEFAULTS } from './delegation-types.js'

export interface RealtimeGuardrailConfig {
  maxActiveSessions: number
  sessionRenewalMs: number
}

export interface DelegationGuardrailConfig {
  maxTotalJobs: number
  maxPremiumDelegatedJobs: number
  delegatedJobTimeoutMs: number
}

export interface CostGuardrailConfig {
  dailyCloudSpendCapCents: number
  monthlyCloudSpendCapCents: number
}

export interface RetentionGuardrailConfig {
  retainRawAudio: boolean
  retainRedactedTranscripts: boolean
}

export interface PrivacyCostConfig {
  realtime: RealtimeGuardrailConfig
  delegation: DelegationGuardrailConfig
  cost: CostGuardrailConfig
  retention: RetentionGuardrailConfig
}

export interface GuardrailApprovalAuditEntry {
  approvedBy: string
  approvedAt: string
  reason: string
}

export interface GuardrailApproval {
  allowRaisedCaps: boolean
  auditEntry: GuardrailApprovalAuditEntry
}

export type PrivacyCostConfigInput = {
  realtime?: Partial<RealtimeGuardrailConfig>
  delegation?: Partial<DelegationGuardrailConfig>
  cost?: Partial<CostGuardrailConfig>
  retention?: Partial<RetentionGuardrailConfig>
}

export const DEFAULT_PRIVACY_COST_CONFIG: PrivacyCostConfig = {
  realtime: {
    maxActiveSessions: 1,
    sessionRenewalMs: 30 * 60 * 1000,
  },
  delegation: {
    maxTotalJobs: DELEGATION_DEFAULTS.maxTotalJobs,
    maxPremiumDelegatedJobs: DELEGATION_DEFAULTS.maxPremiumConcurrency,
    delegatedJobTimeoutMs: DELEGATION_DEFAULTS.timeoutMs,
  },
  cost: {
    dailyCloudSpendCapCents: 10 * 100,
    monthlyCloudSpendCapCents: 100 * 100,
  },
  retention: {
    retainRawAudio: false,
    retainRedactedTranscripts: true,
  },
}

export function resolvePrivacyCostConfig(input: PrivacyCostConfigInput = {}, approval?: GuardrailApproval): PrivacyCostConfig {
  const candidate: PrivacyCostConfig = {
    realtime: { ...DEFAULT_PRIVACY_COST_CONFIG.realtime, ...definedValues(input.realtime) },
    delegation: { ...DEFAULT_PRIVACY_COST_CONFIG.delegation, ...definedValues(input.delegation) },
    cost: { ...DEFAULT_PRIVACY_COST_CONFIG.cost, ...definedValues(input.cost) },
    retention: { ...DEFAULT_PRIVACY_COST_CONFIG.retention, ...definedValues(input.retention) },
  }

  const raisedCaps = findRaisedCaps(candidate, DEFAULT_PRIVACY_COST_CONFIG)
  if (raisedCaps.length > 0 && !hasValidApproval(approval)) {
    throw new Error(`Privacy/cost guardrail caps cannot be raised without approval audit metadata: ${raisedCaps.join(', ')}`)
  }

  if (candidate.retention.retainRawAudio && !hasValidApproval(approval)) {
    throw new Error('Raw audio retention cannot be enabled without approval audit metadata.')
  }

  return candidate
}

function findRaisedCaps(candidate: PrivacyCostConfig, defaults: PrivacyCostConfig): string[] {
  const raised: string[] = []
  compareNumericCap(raised, 'realtime.maxActiveSessions', candidate.realtime.maxActiveSessions, defaults.realtime.maxActiveSessions)
  compareNumericCap(raised, 'realtime.sessionRenewalMs', candidate.realtime.sessionRenewalMs, defaults.realtime.sessionRenewalMs)
  compareNumericCap(raised, 'delegation.maxTotalJobs', candidate.delegation.maxTotalJobs, defaults.delegation.maxTotalJobs)
  compareNumericCap(raised, 'delegation.maxPremiumDelegatedJobs', candidate.delegation.maxPremiumDelegatedJobs, defaults.delegation.maxPremiumDelegatedJobs)
  compareNumericCap(raised, 'delegation.delegatedJobTimeoutMs', candidate.delegation.delegatedJobTimeoutMs, defaults.delegation.delegatedJobTimeoutMs)
  compareNumericCap(raised, 'cost.dailyCloudSpendCapCents', candidate.cost.dailyCloudSpendCapCents, defaults.cost.dailyCloudSpendCapCents)
  compareNumericCap(raised, 'cost.monthlyCloudSpendCapCents', candidate.cost.monthlyCloudSpendCapCents, defaults.cost.monthlyCloudSpendCapCents)
  return raised
}

function compareNumericCap(raised: string[], label: string, candidate: number, defaultValue: number) {
  if (!Number.isFinite(candidate) || candidate < 0) throw new Error(`Invalid privacy/cost guardrail value for ${label}.`)
  if (candidate > defaultValue) raised.push(label)
}

function hasValidApproval(approval: GuardrailApproval | undefined) {
  return approval?.allowRaisedCaps === true
    && approval.auditEntry.approvedBy.trim().length > 0
    && approval.auditEntry.approvedAt.trim().length > 0
    && approval.auditEntry.reason.trim().length > 0
}

function definedValues<T extends Record<string, unknown>>(value: T | undefined): Partial<T> {
  if (!value) return {}
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>
}
