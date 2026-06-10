export enum AppState {
  Idle = 'idle',
  Listening = 'listening',
  Thinking = 'thinking',
  Speaking = 'speaking',
  Confirming = 'confirming',
  Delegated = 'delegated',
  Degraded = 'degraded',
  Error = 'error',
}

export const REQUIRED_APP_STATES = [
  AppState.Idle,
  AppState.Listening,
  AppState.Thinking,
  AppState.Speaking,
  AppState.Confirming,
  AppState.Delegated,
  AppState.Degraded,
  AppState.Error,
] as const

export type AppStateValue = `${AppState}`

export interface StatusSnapshot {
  state: AppState
  message: string
  detail?: string
  updatedAt: string
}

export function isAppState(value: unknown): value is AppState {
  return typeof value === 'string' && REQUIRED_APP_STATES.includes(value as AppState)
}

export function createStatusSnapshot(state: AppState, message: string, detail?: string): StatusSnapshot {
  return {
    state,
    message,
    detail,
    updatedAt: new Date().toISOString(),
  }
}
