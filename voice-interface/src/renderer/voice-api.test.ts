import { describe, expect, it } from 'vitest'
import { AppState } from '../shared/state.js'
import type { EpsilonVoiceApi } from '../shared/ipc.js'
import { getEpsilonVoiceApi } from './voice-api.js'

describe('getEpsilonVoiceApi', () => {
  it('uses the Electron preload API when it exists', () => {
    const preload_api: EpsilonVoiceApi = {
      getStatus: async () => ({ state: AppState.Idle, message: 'preload', updatedAt: 'now' }),
      setState: async (state) => ({ state, message: 'preload', updatedAt: 'now' }),
      publishEvent: async (event) => event,
      requestRealtimeSession: async () => ({
        ok: false,
        code: 'unavailable',
        message: 'preload test does not mint sessions',
        recoverable: true,
      }),
      prepareCapabilityAction: async () => { throw new Error('not used') },
      confirmCapabilityManifest: async () => { throw new Error('not used') },
      executeCapabilityManifest: async () => { throw new Error('not used') },
      delegateToOpenCode: async () => { throw new Error('not used') },
      getDelegationQueue: async () => { throw new Error('not used') },
      cancelDelegationJob: async () => { throw new Error('not used') },
      startDelegation: async () => { throw new Error('not used') },
      getDelegationSnapshot: async () => { throw new Error('not used') },
      onStatusUpdate: () => () => undefined,
      onAppEvent: () => () => undefined,
    }
    const target_window = { epsilonVoice: preload_api } as Window & { epsilonVoice?: EpsilonVoiceApi }

    expect(getEpsilonVoiceApi(target_window)).toBe(preload_api)
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

  it('keeps browser-preview OpenCode delegation bounded even when direct mode is requested', async () => {
    const api = getEpsilonVoiceApi({} as Window & { epsilonVoice?: EpsilonVoiceApi })

    const result = await api.delegateToOpenCode({
      parentVoiceTurnId: 'renderer-turn',
      promptSummary: '/church raw direct prompt from renderer',
      promptMode: 'direct',
      model: 'opencode/gpt-5.5',
      profile: 'standard',
      timeoutMs: 100,
      costBudgetCents: 75,
    })

    expect(result.job.promptMode).toBe('bounded')
    expect(result.job.promptSummary).toContain('/church raw direct prompt')
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
