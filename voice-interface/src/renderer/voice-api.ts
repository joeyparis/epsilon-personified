import type { EpsilonVoiceApi } from '../shared/ipc.js'
import { AppState, createStatusSnapshot, type StatusSnapshot } from '../shared/state.js'

type WindowWithOptionalVoiceApi = Window & {
  epsilonVoice?: EpsilonVoiceApi
}

export function createDevelopmentVoiceApi(): EpsilonVoiceApi {
  let snapshot = createStatusSnapshot(AppState.Idle, 'Epsilon voice shell is ready in browser preview.')
  const listeners = new Set<(snapshot: StatusSnapshot) => void>()

  return {
    getStatus: async () => snapshot,
    setState: async (state) => {
      snapshot = createStatusSnapshot(state, `Showing ${state} state from the browser preview harness.`)
      for (const listener of listeners) listener(snapshot)
      return snapshot
    },
    onStatusUpdate: (callback) => {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
  }
}

export function getEpsilonVoiceApi(targetWindow: WindowWithOptionalVoiceApi): EpsilonVoiceApi {
  if (targetWindow.epsilonVoice) return targetWindow.epsilonVoice

  const api = createDevelopmentVoiceApi()
  targetWindow.epsilonVoice = api
  return api
}
