export const DELEGATION_DEFAULTS = {
  endpoint: 'http://localhost:4097',
  model: 'claude-sonnet-4-6',
  profile: 'standard',
  maxTotalConcurrency: 2,
  maxPremiumConcurrency: 1,
  maxTotalJobs: 2,
  timeoutMs: 20 * 60 * 1000,
  costBudgetCents: 250,
  promptSummaryLimit: 700,
} as const

export const DELEGATION_JOB_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
  'timed_out',
  'cancelled',
  'blocked_by_cost_cap',
  'degraded_unavailable',
] as const

export type DelegationProfile = 'standard' | 'premium'
export type DelegationModelProfile = DelegationProfile
export type DelegationJobStatus = typeof DELEGATION_JOB_STATUSES[number]

export interface DelegationRequest {
  parentVoiceTurnId: string
  promptSummary: string
  model?: string
  profile?: DelegationProfile
  timeoutMs?: number
  costBudgetCents?: number
}

export interface DelegationJobRequest {
  parentVoiceTurnId: string
  promptSummary: string
  model: string
  profile?: DelegationProfile
  timeoutMs?: number
  costBudgetCents: number
}

export interface DelegationCancellationCommand {
  kind: 'process-signal'
  signal: 'SIGTERM'
  reason: string
}

export interface DelegationJob {
  id: string
  parentVoiceTurnId: string
  promptSummary: string
  model: string
  profile: DelegationProfile
  status: DelegationJobStatus
  startTime?: string | null
  startedAt?: string
  createdAt: string
  updatedAt?: string
  completedAt?: string
  timeoutMs: number
  costBudgetCents: number
  cancellationCommand: DelegationCancellationCommand
  finalSummary?: string | null
  statusMessage?: string
  degradedReason?: string
  endpoint: string
  workerCommand?: string[]
}

export type DelegationJobSnapshot = DelegationJob

export interface DelegationSnapshot {
  jobs: DelegationJob[]
  activeCount: number
  queuedCount: number
  activePremiumCount: number
  maxTotalConcurrency: number
  maxPremiumConcurrency: number
  maxTotalJobs: number
  degraded: boolean
  degradedMessage?: string
  endpoint: string
}

export type DelegationQueueSnapshot = DelegationSnapshot

export interface DelegationStartResult {
  accepted: boolean
  job: DelegationJob
  snapshot: DelegationSnapshot
}

export interface DelegationSubmitResult {
  accepted: boolean
  job: DelegationJobSnapshot
  queue: DelegationQueueSnapshot
}

export interface DelegationCancelResult {
  cancelled: boolean
  job?: DelegationJobSnapshot
  reason?: string
}
