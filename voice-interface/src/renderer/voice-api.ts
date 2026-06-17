import { createFaceStatusEvent, createStateChangedEvent, type AppEvent } from '../events/app-events.js'
import { createLocalEventBus } from '../events/local-event-bus.js'
import { createMockRealtimeSession } from '../realtime/mock-client.js'
import type { CapabilityConfirmation, CapabilityExecutionResult, CapabilityManifest, ConfirmationInput, PrepareCapabilityRequest } from '../shared/capability-types.js'
import { DELEGATION_DEFAULTS, type DelegationJob, type DelegationSnapshot, type DelegationStartResult } from '../shared/delegation-types.js'
import type { DelegationCancelResult, DelegationJobRequest, DelegationQueueSnapshot, DelegationSubmitResult } from '../shared/delegation-types.js'
import type { EpsilonVoiceApi } from '../shared/ipc.js'
import { AppState, createStatusSnapshot, type StatusSnapshot } from '../shared/state.js'

type WindowWithOptionalVoiceApi = Window & {
  epsilonVoice?: EpsilonVoiceApi
}

export function createDevelopmentVoiceApi(): EpsilonVoiceApi {
  let snapshot = createStatusSnapshot(AppState.Idle, 'Epsilon voice shell is ready in browser preview.')
  let preparedManifest: CapabilityManifest | null = null
  const delegationJobs: DelegationJob[] = []
  const listeners = new Set<(snapshot: StatusSnapshot) => void>()
  const eventBus = createLocalEventBus()
  const delegationQueue: DelegationQueueSnapshot = { jobs: [], activeCount: 0, queuedCount: 0, activePremiumCount: 0, maxTotalConcurrency: DELEGATION_DEFAULTS.maxTotalConcurrency, maxPremiumConcurrency: DELEGATION_DEFAULTS.maxPremiumConcurrency, maxTotalJobs: DELEGATION_DEFAULTS.maxTotalJobs, degraded: true, endpoint: DELEGATION_DEFAULTS.endpoint }

  function publishStatusEvents(nextSnapshot: StatusSnapshot) {
    eventBus.publish(createStateChangedEvent(nextSnapshot, 'renderer'))
    eventBus.publish(createFaceStatusEvent(nextSnapshot, 'renderer'))
  }

  return {
    getStatus: async () => snapshot,
    setState: async (state, message, detail) => {
      snapshot = createStatusSnapshot(state, message ?? `Showing ${state} state from the browser preview harness.`, detail)
      for (const listener of listeners) listener(snapshot)
      publishStatusEvents(snapshot)
      return snapshot
    },
    publishEvent: async (event: AppEvent) => eventBus.publish(event),
    requestRealtimeSession: async () => ({ ok: true, session: createMockRealtimeSession('browser-preview-realtime-session') }),
    prepareCapabilityAction: async (request: PrepareCapabilityRequest) => {
      const id = crypto.randomUUID()
      preparedManifest = {
        id,
        version: 'capability-manifest.v1',
        hash: 'browser-preview-no-write',
        action_type: request.action_type,
        target_path: request.action_type === 'local_draft_upsert' ? 'projects/epsilon-voice-interface/drafts/browser-preview.md' : 'inbox.md',
        human_summary: 'Browser preview prepared a display-only manifest. No write will run outside Electron.',
        exact_diff_or_payload: 'Browser preview only. Electron main process performs real manifest hashing and writes.',
        source_context_labels: [],
        risk_level: 'low',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        confirmation_phrase: `confirm ${id.slice(0, 8)}`,
      }
      eventBus.publish({
        type: 'manifest.updated',
        payload: { manifestId: preparedManifest.id, status: 'loaded' },
        meta: { id: crypto.randomUUID(), createdAt: new Date().toISOString(), source: 'renderer' },
      })
      return preparedManifest
    },
    confirmCapabilityManifest: async (manifest: CapabilityManifest, input: ConfirmationInput): Promise<CapabilityConfirmation> => {
      const accepted = input.method === 'click' ? input.accepted : input.method === 'voice' && input.transcript.trim() === manifest.confirmation_phrase
      return {
        manifest_id: manifest.id,
        manifest_hash: manifest.hash,
        accepted,
        reason: accepted ? 'accepted' : 'ambiguous',
        confirmed_at: new Date().toISOString(),
      }
    },
    executeCapabilityManifest: async (manifest: CapabilityManifest, confirmation: CapabilityConfirmation): Promise<CapabilityExecutionResult> => {
      if (!preparedManifest || preparedManifest.id !== manifest.id || !confirmation.accepted) {
        return { ok: false, manifest_id: manifest.id, reason: 'browser_preview_no_write', not_sent: true }
      }
      return { ok: true, manifest_id: manifest.id, target_path: manifest.target_path, bytes_written: 0, not_sent: true }
    },
    startDelegation: async (request): Promise<DelegationStartResult> => {
      const now = new Date().toISOString()
      const job: DelegationJob = {
        id: crypto.randomUUID(),
        parentVoiceTurnId: request.parentVoiceTurnId,
        promptSummary: request.promptSummary.replace(/\s+/g, ' ').trim().slice(0, DELEGATION_DEFAULTS.promptSummaryLimit),
        model: request.model ?? DELEGATION_DEFAULTS.model,
        profile: request.profile ?? DELEGATION_DEFAULTS.profile,
        status: 'blocked_by_cost_cap',
        startTime: null,
        createdAt: now,
        updatedAt: now,
        timeoutMs: Math.min(request.timeoutMs ?? DELEGATION_DEFAULTS.timeoutMs, DELEGATION_DEFAULTS.timeoutMs),
        costBudgetCents: Math.min(request.costBudgetCents ?? DELEGATION_DEFAULTS.costBudgetCents, DELEGATION_DEFAULTS.costBudgetCents),
        cancellationCommand: { kind: 'process-signal', signal: 'SIGTERM', reason: 'Browser preview does not spawn delegation.' },
        finalSummary: 'Browser preview cannot reach opencode serve. Electron main process performs real delegation.',
        statusMessage: 'Delegation unavailable in browser preview.',
        endpoint: DELEGATION_DEFAULTS.endpoint,
      }
      delegationJobs.push(job)
      eventBus.publish({
        type: 'delegation.updated',
        payload: {
          jobId: job.id,
          parentVoiceTurnId: job.parentVoiceTurnId,
          promptSummary: job.promptSummary,
          model: job.model,
          profile: job.profile,
          status: job.status,
          startTime: job.startTime ?? null,
          timeoutMs: job.timeoutMs,
          costBudgetCents: job.costBudgetCents,
          cancellationCommand: job.cancellationCommand,
          finalSummary: job.finalSummary ?? null,
          statusMessage: job.statusMessage ?? '',
        },
        meta: { id: crypto.randomUUID(), createdAt: new Date().toISOString(), source: 'renderer' },
      })
      snapshot = createStatusSnapshot(AppState.Degraded, 'OpenCode delegation unavailable in browser preview.', job.statusMessage)
      for (const listener of listeners) listener(snapshot)
      publishStatusEvents(snapshot)
      return { accepted: false, job, snapshot: createDelegationSnapshot(delegationJobs, true, snapshot.detail) }
    },
    getDelegationSnapshot: async () => createDelegationSnapshot(delegationJobs, false),
    delegateToOpenCode: async (request: DelegationJobRequest): Promise<DelegationSubmitResult> => {
      const job = {
        id: `browser-preview-delegation-${crypto.randomUUID()}`,
        parentVoiceTurnId: request.parentVoiceTurnId,
        promptSummary: request.promptSummary.slice(0, 700),
        promptMode: 'bounded' as const,
        model: request.model,
        profile: request.profile ?? 'standard',
        endpoint: delegationQueue.endpoint,
        status: 'degraded_unavailable' as const,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        timeoutMs: request.timeoutMs ?? 1_200_000,
        costBudgetCents: request.costBudgetCents,
        startTime: null,
        updatedAt: new Date().toISOString(),
        cancellationCommand: { kind: 'process-signal' as const, signal: 'SIGTERM' as const, reason: 'Browser preview has no OpenCode worker.' },
        finalSummary: 'Browser preview does not spawn OpenCode. Delegation is available only in Electron main.',
        statusMessage: 'Delegation unavailable in browser preview.',
        degradedReason: 'Electron main process unavailable.',
      }
      delegationQueue.jobs.push(job)
      delegationQueue.degraded = true
      snapshot = createStatusSnapshot(AppState.Degraded, 'OpenCode delegation unavailable in browser preview.', job.finalSummary)
      for (const listener of listeners) listener(snapshot)
      publishStatusEvents(snapshot)
      return { accepted: false, job, queue: delegationQueue }
    },
    getDelegationQueue: async () => delegationQueue,
    cancelDelegationJob: async (jobId: string): Promise<DelegationCancelResult> => ({ cancelled: false, reason: `No running browser-preview delegation job ${jobId}.` }),
    onStatusUpdate: (callback) => {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    onAppEvent: (callback) => eventBus.subscribe(callback),
  }
}

function createDelegationSnapshot(jobs: DelegationJob[], degraded: boolean, degradedMessage?: string): DelegationSnapshot {
  return {
    jobs,
    activeCount: jobs.filter((job) => job.status === 'running').length,
    queuedCount: jobs.filter((job) => job.status === 'queued').length,
    activePremiumCount: jobs.filter((job) => job.status === 'running' && job.profile === 'premium').length,
    maxTotalConcurrency: DELEGATION_DEFAULTS.maxTotalConcurrency,
    maxPremiumConcurrency: DELEGATION_DEFAULTS.maxPremiumConcurrency,
    maxTotalJobs: DELEGATION_DEFAULTS.maxTotalJobs,
    degraded,
    degradedMessage,
    endpoint: DELEGATION_DEFAULTS.endpoint,
  }
}

export function getEpsilonVoiceApi(targetWindow: WindowWithOptionalVoiceApi): EpsilonVoiceApi {
  if (targetWindow.epsilonVoice) return targetWindow.epsilonVoice

  const api = createDevelopmentVoiceApi()
  targetWindow.epsilonVoice = api
  return api
}
