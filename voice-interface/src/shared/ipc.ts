import type { AppState, StatusSnapshot } from './state.js'

export const IPC_CHANNELS = {
  GET_STATUS: 'epsilon-voice:get-status',
  SET_STATE: 'epsilon-voice:set-state',
  STATUS_UPDATED: 'epsilon-voice:status-updated',
} as const

export interface EpsilonVoiceApi {
  getStatus: () => Promise<StatusSnapshot>
  setState: (state: AppState) => Promise<StatusSnapshot>
  onStatusUpdate: (callback: (snapshot: StatusSnapshot) => void) => () => void
}
