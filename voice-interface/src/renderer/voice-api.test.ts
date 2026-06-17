import { describe, expect, it } from 'vitest'
import { AppState } from '../shared/state.js'
import type { EpsilonVoiceApi } from '../shared/ipc.js'
import { getEpsilonVoiceApi } from './voice-api.js'

function createPreloadApiStub(): EpsilonVoiceApi {
  return {
    getStatus: async () => ({ state: AppState.Idle, message: 'preload', updatedAt: 'now' }),
    setState: async (state) => ({ state, message: 'preload', updatedAt: 'now' }),
    publishEvent: async (event) => event,
    requestRealtimeSession: async () => ({
      ok: false,
      code: 'unavailable',
      message: 'preload test does not mint sessions',
      recoverable: true,
    }),
    prepareCapabilityAction: async (request) => ({
      id: 'manifest-test',
      version: 'capability-manifest.v1',
      hash: 'hash-test',
      action_type: request.action_type,
      target_path: 'inbox.md',
      human_summary: 'Preload test manifest',
      exact_diff_or_payload: 'test payload',
      source_context_labels: [],
      risk_level: 'low',
      expires_at: 'now',
      confirmation_phrase: 'confirm manifest-test',
    }),
    confirmCapabilityManifest: async (manifest) => ({
      manifest_id: manifest.id,
      manifest_hash: manifest.hash,
      accepted: true,
      reason: 'accepted',
      confirmed_at: 'now',
    }),
    executeCapabilityManifest: async (manifest) => ({
      ok: true,
      manifest_id: manifest.id,
      target_path: manifest.target_path,
      bytes_written: 0,
      not_sent: true,
    }),
    delegateToOpenCode: async (request) => ({
      accepted: false,
      job: {
        id: 'job-test',
        parentVoiceTurnId: request.parentVoiceTurnId,
        promptSummary: request.promptSummary,
        model: request.model,
        profile: request.profile ?? 'standard',
        status: 'degraded_unavailable',
        createdAt: 'now',
        timeoutMs: request.timeoutMs ?? 0,
        costBudgetCents: request.costBudgetCents,
        cancellationCommand: { kind: 'process-signal', signal: 'SIGTERM', reason: 'test' },
        endpoint: 'test',
      },
      queue: {
        jobs: [],
        activeCount: 0,
        queuedCount: 0,
        activePremiumCount: 0,
        maxTotalConcurrency: 0,
        maxPremiumConcurrency: 0,
        maxTotalJobs: 0,
        degraded: true,
        endpoint: 'test',
      },
    }),
    getDelegationQueue: async () => ({
      jobs: [],
      activeCount: 0,
      queuedCount: 0,
      activePremiumCount: 0,
      maxTotalConcurrency: 0,
      maxPremiumConcurrency: 0,
      maxTotalJobs: 0,
      degraded: true,
      endpoint: 'test',
    }),
    cancelDelegationJob: async () => ({ cancelled: false, reason: 'test' }),
    startDelegation: async (request) => ({
      accepted: false,
      job: {
        id: 'job-test',
        parentVoiceTurnId: request.parentVoiceTurnId,
        promptSummary: request.promptSummary,
        model: request.model ?? 'test-model',
        profile: request.profile ?? 'standard',
        status: 'degraded_unavailable',
        createdAt: 'now',
        timeoutMs: request.timeoutMs ?? 0,
        costBudgetCents: request.costBudgetCents ?? 0,
        cancellationCommand: { kind: 'process-signal', signal: 'SIGTERM', reason: 'test' },
        endpoint: 'test',
      },
      snapshot: {
        jobs: [],
        activeCount: 0,
        queuedCount: 0,
        activePremiumCount: 0,
        maxTotalConcurrency: 0,
        maxPremiumConcurrency: 0,
        maxTotalJobs: 0,
        degraded: true,
        endpoint: 'test',
      },
    }),
    getDelegationSnapshot: async () => ({
      jobs: [],
      activeCount: 0,
      queuedCount: 0,
      activePremiumCount: 0,
      maxTotalConcurrency: 0,
      maxPremiumConcurrency: 0,
      maxTotalJobs: 0,
      degraded: true,
      endpoint: 'test',
    }),
    onStatusUpdate: () => () => undefined,
    onAppEvent: () => () => undefined,
    onPushToTalkHotkey: () => () => undefined,
  }
}

describe('getEpsilonVoiceApi', () => {
  it('uses the Electron preload API when it exists', () => {
    const preloadApi = createPreloadApiStub()
    const targetWindow = { epsilonVoice: preloadApi } as Window & { epsilonVoice?: EpsilonVoiceApi }

    expect(getEpsilonVoiceApi(targetWindow)).toBe(preloadApi)
  })

  it('creates an in-memory idle API when browser preview has no preload API', async () => {
    const targetWindow = {} as Window & { epsilonVoice?: EpsilonVoiceApi }

    const api = getEpsilonVoiceApi(targetWindow)
    const initial = await api.getStatus()

    expect(targetWindow.epsilonVoice).toBe(api)
    expect(initial.state).toBe(AppState.Idle)
    expect(initial.message).toContain('browser preview')
  })

  it('returns mock realtime session config in browser preview without secrets', async () => {
    const api = getEpsilonVoiceApi({} as Window & { epsilonVoice?: EpsilonVoiceApi })

    const result = await api.requestRealtimeSession()

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.session.mode).toBe('mock')
      expect(result.session.sessionId).toContain('browser-preview')
    }
  })

  it('notifies browser preview listeners when state changes', async () => {
    const api = getEpsilonVoiceApi({} as Window & { epsilonVoice?: EpsilonVoiceApi })
    const updates = [] as AppState[]

    const unsubscribe = api.onStatusUpdate((snapshot) => updates.push(snapshot.state))
    await api.setState(AppState.Thinking)
    unsubscribe()
    await api.setState(AppState.Speaking)

    expect(updates).toEqual([AppState.Thinking])
    await expect(api.getStatus()).resolves.toMatchObject({ state: AppState.Speaking })
  })
})


describe('development event bus fallback', () => {
  it('publishes typed app events without Electron preload', async () => {
    const api = getEpsilonVoiceApi({} as Window & { epsilonVoice?: EpsilonVoiceApi })
    const eventTypes: string[] = []

    const unsubscribe = api.onAppEvent((event) => eventTypes.push(event.type))
    await api.setState(AppState.Confirming)
    unsubscribe()

    expect(eventTypes).toEqual(['state.changed', 'face.status'])
  })
})
