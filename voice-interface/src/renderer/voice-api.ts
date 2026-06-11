import { createFaceStatusEvent, createStateChangedEvent, type AppEvent } from '../events/app-events.js'
import { createLocalEventBus } from '../events/local-event-bus.js'
import { createMockRealtimeSession } from '../realtime/mock-client.js'
import type { EpsilonVoiceApi } from '../shared/ipc.js'
import { AppState, createStatusSnapshot, type StatusSnapshot } from '../shared/state.js'

type WindowWithOptionalVoiceApi = Window & {
  epsilonVoice?: EpsilonVoiceApi
}

export function createDevelopmentVoiceApi(): EpsilonVoiceApi {
  let snapshot = createStatusSnapshot(AppState.Idle, 'Epsilon voice shell is ready in browser preview.')
  const listeners = new Set<(snapshot: StatusSnapshot) => void>()
  const eventBus = createLocalEventBus()

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
    onStatusUpdate: (callback) => {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    onAppEvent: (callback) => eventBus.subscribe(callback),
  }
}

export function getEpsilonVoiceApi(targetWindow: WindowWithOptionalVoiceApi): EpsilonVoiceApi {
  if (targetWindow.epsilonVoice) return targetWindow.epsilonVoice

  const api = createDevelopmentVoiceApi()
  targetWindow.epsilonVoice = api
  return api
}
