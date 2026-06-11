import type { AppEvent } from '../events/app-events.js'
import type { CapabilityConfirmation, CapabilityExecutionResult, CapabilityManifest, ConfirmationInput, PrepareCapabilityRequest } from './capability-types.js'
import type { RealtimeSessionMintResult } from '../realtime/types.js'
import type { AppState, StatusSnapshot } from './state.js'

export const IPC_CHANNELS = {
  GET_STATUS: 'epsilon-voice:get-status',
  SET_STATE: 'epsilon-voice:set-state',
  STATUS_UPDATED: 'epsilon-voice:status-updated',
  PUBLISH_EVENT: 'epsilon-voice:publish-event',
  EVENT_PUBLISHED: 'epsilon-voice:event-published',
  REQUEST_REALTIME_SESSION: 'epsilon-voice:request-realtime-session',
  PREPARE_CAPABILITY_ACTION: 'epsilon-voice:prepare-capability-action',
  CONFIRM_CAPABILITY_MANIFEST: 'epsilon-voice:confirm-capability-manifest',
  EXECUTE_CAPABILITY_MANIFEST: 'epsilon-voice:execute-capability-manifest',
} as const

export interface EpsilonVoiceApi {
  getStatus: () => Promise<StatusSnapshot>
  setState: (state: AppState, message?: string, detail?: string) => Promise<StatusSnapshot>
  publishEvent: (event: AppEvent) => Promise<AppEvent | null>
  requestRealtimeSession: () => Promise<RealtimeSessionMintResult>
  prepareCapabilityAction: (request: PrepareCapabilityRequest) => Promise<CapabilityManifest>
  confirmCapabilityManifest: (manifest: CapabilityManifest, input: ConfirmationInput) => Promise<CapabilityConfirmation>
  executeCapabilityManifest: (manifest: CapabilityManifest, confirmation: CapabilityConfirmation) => Promise<CapabilityExecutionResult>
  onStatusUpdate: (callback: (snapshot: StatusSnapshot) => void) => () => void
  onAppEvent: (callback: (event: AppEvent) => void) => () => void
}
