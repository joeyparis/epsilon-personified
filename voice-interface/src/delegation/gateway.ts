import { createEventMeta, type DelegationEvent } from '../events/app-events.js'
import { evaluateCloudSpend, type EstimatedCloudSpend } from '../shared/cost-guardrails.js'
import { createDegradedStatus } from '../shared/degraded-mode.js'
import { AppState, type StatusSnapshot } from '../shared/state.js'
import { DEFAULT_PRIVACY_COST_CONFIG, resolvePrivacyCostConfig, type GuardrailApproval, type PrivacyCostConfig } from '../shared/privacy-cost-config.js'
import type {
  DelegationCancelResult,
  DelegationJobRequest,
  DelegationJobSnapshot,
  DelegationJobStatus,
  DelegationModelProfile,
  DelegationQueueSnapshot,
  DelegationSubmitResult,
} from '../shared/delegation-types.js'
import { fetchOpenCodeHealthChecker, type OpenCodeHealthChecker } from './opencode-health.js'
import { nodeProcessRunner, type ManagedWorkerProcess, type ProcessRunner, type WorkerProcessResult } from './process-runner.js'

export interface DelegationGatewayOptions {
  endpoint?: string
  totalConcurrency?: number
  maxTotalJobs?: number
  maxActivePremiumJobs?: number
  defaultTimeoutMs?: number
  maxPromptSummaryChars?: number
  processRunner?: ProcessRunner
  healthChecker?: OpenCodeHealthChecker
  estimatedSpend?: EstimatedCloudSpend
  privacyCostConfig?: Partial<PrivacyCostConfig>
  capApproval?: GuardrailApproval
  clock?: DelegationClock
  idFactory?: () => string
  setStatus?: (state: AppState, message: string, detail?: string) => StatusSnapshot | void
  publishEvent?: (event: DelegationEvent) => void
}

export interface DelegationClock {
  now: () => Date
  setTimeout: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void
}

type InternalDelegationJob = DelegationJobSnapshot & {
  process?: ManagedWorkerProcess
  timeoutHandle?: ReturnType<typeof setTimeout>
  settled: boolean
  cancellationCount: number
}

const DEFAULT_ENDPOINT = 'http://localhost:4097'
const DEFAULT_MAX_PROMPT_SUMMARY_CHARS = 700
const DEFAULT_TOTAL_CONCURRENCY = DEFAULT_PRIVACY_COST_CONFIG.delegation.maxTotalJobs
const RAW_CONTEXT_REDACTION_PLACEHOLDER = 'Raw voice context redacted. Provide a concise typed summary before delegation.'
const PREMIUM_MODEL_HINTS = ['opus', 'sonnet', 'gpt-5', 'premium', 'pro'] as const
const RAW_CONTEXT_HINTS = ['raw audio', 'full transcript', 'speaker:', 'user said:', 'assistant said:', 'data:audio', 'base64'] as const

export class DelegationGateway {
  private readonly endpoint: string
  private readonly totalConcurrency: number
  private readonly maxTotalJobs: number
  private readonly maxActivePremiumJobs: number
  private readonly defaultTimeoutMs: number
  private readonly maxPromptSummaryChars: number
  private readonly processRunner: ProcessRunner
  private readonly healthChecker: OpenCodeHealthChecker
  private readonly privacyCostConfig: PrivacyCostConfig
  private readonly estimatedSpend: EstimatedCloudSpend
  private readonly clock: DelegationClock
  private readonly idFactory: () => string
  private readonly setStatus?: (state: AppState, message: string, detail?: string) => StatusSnapshot | void
  private readonly publishEvent?: (event: DelegationEvent) => void
  private readonly jobs = new Map<string, InternalDelegationJob>()

  constructor(options: DelegationGatewayOptions = {}) {
    this.privacyCostConfig = resolvePrivacyCostConfig({
      ...options.privacyCostConfig,
      delegation: {
        ...options.privacyCostConfig?.delegation,
        maxTotalJobs: options.maxTotalJobs,
        maxPremiumDelegatedJobs: options.maxActivePremiumJobs,
        delegatedJobTimeoutMs: options.defaultTimeoutMs,
      },
    }, options.capApproval)
    this.endpoint = validateLocalOpenCodeEndpoint(options.endpoint ?? DEFAULT_ENDPOINT)
    this.totalConcurrency = Math.max(1, Math.min(options.totalConcurrency ?? DEFAULT_TOTAL_CONCURRENCY, DEFAULT_TOTAL_CONCURRENCY))
    this.maxTotalJobs = Math.max(1, this.privacyCostConfig.delegation.maxTotalJobs)
    this.maxActivePremiumJobs = Math.max(0, this.privacyCostConfig.delegation.maxPremiumDelegatedJobs)
    this.defaultTimeoutMs = this.privacyCostConfig.delegation.delegatedJobTimeoutMs
    this.maxPromptSummaryChars = options.maxPromptSummaryChars ?? DEFAULT_MAX_PROMPT_SUMMARY_CHARS
    this.processRunner = options.processRunner ?? nodeProcessRunner
    this.healthChecker = options.healthChecker ?? fetchOpenCodeHealthChecker
    this.estimatedSpend = options.estimatedSpend ?? { todayCents: 0, monthCents: 0 }
    this.clock = options.clock ?? realClock
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID())
    this.setStatus = options.setStatus
    this.publishEvent = options.publishEvent
  }

  async delegate(request: DelegationJobRequest): Promise<DelegationSubmitResult> {
    const profile = request.profile ?? inferModelProfile(request.model)
    const job = this.createJob(request, profile)
    const costDecision = evaluateCloudSpend(this.estimatedSpend, this.privacyCostConfig)

    if (costDecision.capReached || request.costBudgetCents <= 0 || this.activeAndQueuedJobs().length >= this.maxTotalJobs) {
      job.status = 'blocked_by_cost_cap'
      job.completedAt = this.isoNow()
      job.updatedAt = job.completedAt
      job.finalSummary = costDecision.capReached
        ? costDecision.reason
        : request.costBudgetCents <= 0
        ? 'Delegation blocked because the job budget is empty.'
        : `Delegation blocked because the queue is capped at ${this.maxTotalJobs} total jobs.`
      job.statusMessage = job.finalSummary
      this.jobs.set(job.id, job)
      const degraded = createDegradedStatus('cost_cap_reached', job.finalSummary)
      this.setStatus?.(degraded.state, degraded.message, degraded.detail)
      this.emitUpdated(job)
      return { accepted: false, job: this.snapshot(job), queue: this.getQueueSnapshot() }
    }

    const available = await this.healthChecker.isAvailable(this.endpoint)
    if (!available) {
      job.status = 'degraded_unavailable'
      job.completedAt = this.isoNow()
      job.updatedAt = job.completedAt
      job.degradedReason = `OpenCode serve is unavailable at ${this.endpoint}.`
      job.finalSummary = 'Delegation unavailable. OpenCode serve is not reachable, so no worker process was spawned.'
      job.statusMessage = job.finalSummary
      this.jobs.set(job.id, job)
      const degraded = createDegradedStatus('opencode_unavailable', job.degradedReason)
      this.setStatus?.(degraded.state, degraded.message, degraded.detail)
      this.emitUpdated(job)
      return { accepted: false, job: this.snapshot(job), queue: this.getQueueSnapshot() }
    }

    this.jobs.set(job.id, job)
    this.setStatus?.(AppState.Delegated, 'Delegation queued.', `${job.id}: ${job.promptSummary}`)
    this.emitUpdated(job)
    this.startEligibleJobs()
    return { accepted: true, job: this.snapshot(job), queue: this.getQueueSnapshot() }
  }

  async cancel(jobId: string, reason = 'cancelled'): Promise<DelegationCancelResult> {
    const job = this.jobs.get(jobId)
    if (!job) return { cancelled: false, reason: 'job_not_found' }
    if (isTerminalStatus(job.status)) return { cancelled: false, job: this.snapshot(job), reason: 'already_terminal' }

    await this.cancelJob(job, reason, 'cancelled')
    this.startEligibleJobs()
    return { cancelled: true, job: this.snapshot(job) }
  }

  getJob(jobId: string): DelegationJobSnapshot | undefined {
    const job = this.jobs.get(jobId)
    return job ? this.snapshot(job) : undefined
  }

  getQueueSnapshot(): DelegationQueueSnapshot {
    const jobs = [...this.jobs.values()].map((job) => this.snapshot(job))
    return {
      jobs,
      activeCount: jobs.filter((job) => job.status === 'running').length,
      queuedCount: jobs.filter((job) => job.status === 'queued').length,
      activePremiumCount: jobs.filter((job) => job.status === 'running' && job.profile === 'premium').length,
      maxTotalConcurrency: this.totalConcurrency,
      maxPremiumConcurrency: this.maxActivePremiumJobs,
      maxTotalJobs: this.maxTotalJobs,
      degraded: jobs.some((job) => job.status === 'degraded_unavailable' || job.status === 'blocked_by_cost_cap'),
      degradedMessage: jobs.find((job) => job.status === 'degraded_unavailable')?.degradedReason
        ?? jobs.find((job) => job.status === 'blocked_by_cost_cap')?.finalSummary
        ?? undefined,
      endpoint: this.endpoint,
    }
  }

  async waitForJob(jobId: string): Promise<DelegationJobSnapshot> {
    const job = this.jobs.get(jobId)
    if (!job) throw new Error(`Unknown delegation job: ${jobId}`)
    if (!job.process || isTerminalStatus(job.status)) return this.snapshot(job)
    await job.process.completed.catch(() => undefined)
    return this.snapshot(job)
  }

  private createJob(request: DelegationJobRequest, profile: DelegationModelProfile): InternalDelegationJob {
    const promptSummary = sanitizePromptSummary(request.promptSummary, this.maxPromptSummaryChars)
    const timeoutMs = Math.max(1, Math.min(request.timeoutMs ?? this.defaultTimeoutMs, this.defaultTimeoutMs))
    const id = `delegation-${this.idFactory()}`
    const now = this.isoNow()
    const cancellationCommand = { kind: 'process-signal' as const, signal: 'SIGTERM' as const, reason: `cancel delegation job ${id}` }
    return {
      id,
      parentVoiceTurnId: sanitizeIdentifier(request.parentVoiceTurnId),
      promptSummary,
      model: request.model,
      profile,
      endpoint: this.endpoint,
      status: 'queued',
      startTime: null,
      createdAt: now,
      updatedAt: now,
      timeoutMs,
      costBudgetCents: request.costBudgetCents,
      cancellationCommand,
      finalSummary: null,
      statusMessage: 'Delegation queued.',
      settled: false,
      cancellationCount: 0,
    }
  }

  private startEligibleJobs() {
    for (const job of this.jobs.values()) {
      if (job.status !== 'queued') continue
      if (this.runningJobs().length >= this.totalConcurrency) return
      if (job.profile === 'premium' && this.activePremiumJobs().length >= this.maxActivePremiumJobs) continue
      this.startJob(job)
    }
  }

  private startJob(job: InternalDelegationJob) {
    job.status = 'running'
    job.startedAt = this.isoNow()
    job.startTime = job.startedAt
    job.updatedAt = job.startedAt
    job.statusMessage = 'Delegation running.'
    const prompt = buildBoundedOpenCodePrompt(job)
    const args = ['run', '--attach', this.endpoint, '-m', job.model, prompt]
    job.workerCommand = ['opencode', ...args]
    this.setStatus?.(AppState.Delegated, 'Delegation running.', `${job.id}: ${job.promptSummary}`)
    this.publishEvent?.({
      type: 'delegation.started',
      payload: delegationEventPayload(job),
      meta: createEventMeta('main'),
    })

    const worker = this.processRunner.run('opencode', args)
    job.process = worker
    job.timeoutHandle = this.clock.setTimeout(() => {
      void this.cancelJob(job, `Timed out after ${job.timeoutMs}ms.`, 'timed_out')
    }, job.timeoutMs)

    worker.completed.then((result) => {
      this.finishFromWorker(job, result)
    }).catch((error: unknown) => {
      this.finishFromWorker(job, { exitCode: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) })
    })
    this.emitUpdated(job)
  }

  private finishFromWorker(job: InternalDelegationJob, result: WorkerProcessResult) {
    if (job.settled) return
    job.settled = true
    if (job.timeoutHandle) this.clock.clearTimeout(job.timeoutHandle)
    job.completedAt = this.isoNow()
    job.updatedAt = job.completedAt
    if (result.exitCode === 0) {
      job.status = 'completed'
      job.finalSummary = summarizeWorkerOutput(result.stdout, 'Delegated job completed without a summary.')
      this.setStatus?.(AppState.Idle, 'Delegation completed.', job.finalSummary)
      job.statusMessage = 'Delegation completed.'
      this.publishEvent?.({
        type: 'delegation.completed',
        payload: { ...delegationEventPayload(job), outcome: 'completed' },
        meta: createEventMeta('main'),
      })
    } else {
      job.status = 'failed'
      job.finalSummary = summarizeWorkerOutput(result.stderr || result.stdout, 'Delegated job failed.')
      this.setStatus?.(AppState.Error, 'Delegation failed.', job.finalSummary)
      job.statusMessage = 'Delegation failed.'
      this.publishEvent?.({
        type: 'delegation.completed',
        payload: { ...delegationEventPayload(job), outcome: 'failed' },
        meta: createEventMeta('main'),
      })
    }
    this.emitUpdated(job)
    this.startEligibleJobs()
  }

  private async cancelJob(job: InternalDelegationJob, reason: string, status: Extract<DelegationJobStatus, 'cancelled' | 'timed_out'>) {
    if (job.settled) return
    job.settled = true
    if (job.timeoutHandle) this.clock.clearTimeout(job.timeoutHandle)
    job.cancellationCount += 1
    job.completedAt = this.isoNow()
    job.updatedAt = job.completedAt
    job.status = status
    job.finalSummary = status === 'timed_out'
      ? `Delegation timed out and cancellation was invoked once. ${reason}`
      : `Delegation cancelled. ${reason}`
    job.statusMessage = status === 'timed_out' ? 'Delegation timed out.' : 'Delegation cancelled.'
    if (job.process) await job.process.cancel()
    this.setStatus?.(status === 'timed_out' ? AppState.Degraded : AppState.Idle, status === 'timed_out' ? 'Delegation timed out.' : 'Delegation cancelled.', job.finalSummary)
    this.publishEvent?.({
      type: 'delegation.completed',
      payload: { ...delegationEventPayload(job), outcome: status === 'timed_out' ? 'timed_out' : 'cancelled' },
      meta: createEventMeta('main'),
    })
    this.emitUpdated(job)
  }

  private emitUpdated(job: InternalDelegationJob) {
    this.publishEvent?.({
      type: 'delegation.updated',
      payload: delegationEventPayload(job),
      meta: createEventMeta('main'),
    })
  }

  private snapshot(job: InternalDelegationJob): DelegationJobSnapshot {
    const { process: _process, timeoutHandle: _timeoutHandle, settled: _settled, cancellationCount: _cancellationCount, ...snapshot } = job
    return { ...snapshot }
  }

  private runningJobs() {
    return [...this.jobs.values()].filter((job) => job.status === 'running')
  }

  private activePremiumJobs() {
    return this.runningJobs().filter((job) => job.profile === 'premium')
  }

  private activeAndQueuedJobs() {
    return [...this.jobs.values()].filter((job) => job.status === 'running' || job.status === 'queued')
  }

  private isoNow() {
    return this.clock.now().toISOString()
  }
}

export function buildBoundedOpenCodePrompt(job: DelegationJobSnapshot): string {
  return [
    'Epsilon voice bounded delegation request.',
    `Job ID: ${job.id}`,
    `Parent voice turn ID: ${job.parentVoiceTurnId}`,
    `Model/profile: ${job.model} / ${job.profile}`,
    `Timeout milliseconds: ${job.timeoutMs}`,
    `Cost budget cents: ${job.costBudgetCents}`,
    `Cancellation command: ${job.cancellationCommand.kind} ${job.cancellationCommand.signal} (${job.cancellationCommand.reason})`,
    '',
    'Prompt summary only:',
    job.promptSummary,
    '',
    'Safety contract: use only this summary. Do not request or infer raw audio, full transcripts, full Church context, full OpenViking memory, email bodies, service raw responses, secrets, writes, sends, mutations, devices, arbitrary sessions, or unbounded agents. Return a concise final summary for the voice UI.',
  ].join('\n')
}

export function sanitizePromptSummary(summary: string, maxChars = DEFAULT_MAX_PROMPT_SUMMARY_CHARS): string {
  const normalized = summary.replace(/\s+/g, ' ').trim()
  const bounded = normalized.length > maxChars ? `${normalized.slice(0, maxChars - 3)}...` : normalized
  const lower = bounded.toLowerCase()
  if (RAW_CONTEXT_HINTS.some((hint) => lower.includes(hint))) {
    return RAW_CONTEXT_REDACTION_PLACEHOLDER.length > maxChars
      ? `${RAW_CONTEXT_REDACTION_PLACEHOLDER.slice(0, maxChars - 3)}...`
      : RAW_CONTEXT_REDACTION_PLACEHOLDER
  }
  return bounded || 'No safe delegation summary provided.'
}

export function validateLocalOpenCodeEndpoint(endpoint: string): string {
  const parsed = new URL(endpoint)
  if (parsed.protocol !== 'http:') throw new Error('OpenCode delegation endpoint must use http.')
  if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) throw new Error('OpenCode delegation endpoint must be local.')
  parsed.hash = ''
  parsed.username = ''
  parsed.password = ''
  return parsed.toString().replace(/\/$/, '')
}


function delegationEventPayload(job: DelegationJobSnapshot) {
  return {
    jobId: job.id,
    parentVoiceTurnId: job.parentVoiceTurnId,
    promptSummary: job.promptSummary,
    model: job.model,
    profile: job.profile,
    status: job.status,
    startTime: job.startTime ?? job.startedAt ?? null,
    timeoutMs: job.timeoutMs,
    costBudgetCents: job.costBudgetCents,
    cancellationCommand: job.cancellationCommand,
    finalSummary: job.finalSummary ?? null,
    statusMessage: job.statusMessage ?? job.finalSummary ?? job.status,
  }
}

function inferModelProfile(model: string): DelegationModelProfile {
  const lower = model.toLowerCase()
  return PREMIUM_MODEL_HINTS.some((hint) => lower.includes(hint)) ? 'premium' : 'standard'
}

function sanitizeIdentifier(value: string) {
  return value.replace(/[^a-zA-Z0-9:._-]/g, '').slice(0, 96) || 'unknown-turn'
}

function summarizeWorkerOutput(output: string, fallback: string) {
  const normalized = output.replace(/\s+/g, ' ').trim()
  if (!normalized) return fallback
  return normalized.length > 700 ? `${normalized.slice(0, 697)}...` : normalized
}

function isTerminalStatus(status: DelegationJobStatus) {
  return ['completed', 'failed', 'timed_out', 'cancelled', 'blocked_by_cost_cap', 'degraded_unavailable'].includes(status)
}

const realClock: DelegationClock = {
  now: () => new Date(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle),
}
