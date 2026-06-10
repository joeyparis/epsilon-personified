import { describe, expect, it } from 'vitest'
import { AppState } from '../shared/state.js'
import type { EpsilonVoiceApi } from '../shared/ipc.js'
import { getEpsilonVoiceApi } from './voice-api.js'

describe('getEpsilonVoiceApi', () => {
  it('uses the Electron preload API when it exists', () => {
    const preloadApi: EpsilonVoiceApi = {
      getStatus: async () => ({ state: AppState.Idle, message: 'preload', updatedAt: 'now' }),
      setState: async (state) => ({ state, message: 'preload', updatedAt: 'now' }),
      onStatusUpdate: () => () => undefined,
    }
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
