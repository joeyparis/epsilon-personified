import { normalizeAppEvent, type AppEvent } from './app-events.js'

export type AppEventListener = (event: AppEvent) => void

export interface LocalEventBus {
  publish: (event: AppEvent) => AppEvent | null
  subscribe: (listener: AppEventListener) => () => void
}

export function createLocalEventBus(): LocalEventBus {
  const listeners = new Set<AppEventListener>()

  return {
    publish: (event) => {
      const normalized = normalizeAppEvent(event)
      if (!normalized) return null
      for (const listener of listeners) listener(normalized)
      return normalized
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
