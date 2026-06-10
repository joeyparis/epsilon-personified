import { AppState, createStatusSnapshot, type StatusSnapshot } from '../shared/state.js'

type StatusListener = (snapshot: StatusSnapshot) => void

export interface StatusStore {
  getSnapshot: () => StatusSnapshot
  setState: (state: AppState, message: string, detail?: string) => StatusSnapshot
  subscribe: (listener: StatusListener) => () => void
}

export function createStatusStore(initialState = AppState.Idle): StatusStore {
  let snapshot = createStatusSnapshot(initialState, 'Epsilon voice shell is ready.')
  const listeners = new Set<StatusListener>()

  return {
    getSnapshot: () => snapshot,
    setState: (state, message, detail) => {
      snapshot = createStatusSnapshot(state, message, detail)
      for (const listener of listeners) listener(snapshot)
      return snapshot
    },
    subscribe: (listener) => {
      listeners.add(listener)
      listener(snapshot)
      return () => listeners.delete(listener)
    },
  }
}
