import { createFaceStatusEvent, createStateChangedEvent, type AppEvent } from '../events/app-events.js'
import { createLocalEventBus } from '../events/local-event-bus.js'
import { createMockRealtimeSession } from '../realtime/mock-client.js'
import type { CapabilityConfirmation, CapabilityExecutionResult, CapabilityManifest, ConfirmationInput, PrepareCapabilityRequest } from '../shared/capability-types.js'
import type { EpsilonVoiceApi } from '../shared/ipc.js'
import { AppState, createStatusSnapshot, type StatusSnapshot } from '../shared/state.js'

type WindowWithOptionalVoiceApi = Window & {
  epsilonVoice?: EpsilonVoiceApi
}

export function createDevelopmentVoiceApi(): EpsilonVoiceApi {
  let snapshot = createStatusSnapshot(AppState.Idle, 'Epsilon voice shell is ready in browser preview.')
  let preparedManifest: CapabilityManifest | null = null
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
    prepareCapabilityAction: async (request: PrepareCapabilityRequest) => {
      const id = crypto.randomUUID()
      preparedManifest = {
        id,
        version: 'capability-manifest.v1',
        hash: 'browser-preview-no-write',
        action_type: request.action_type,
        target_path: request.action_type === 'local_draft_upsert' ? 'projects/epsilon-voice-interface/drafts/browser-preview.md' : 'inbox.md',
        human_summary: 'Browser preview prepared a display-only manifest. No write will run outside Electron.',
        exact_diff_or_payload: 'Browser preview only. Electron main process performs real manifest hashing and writes.',
        source_context_labels: [],
        risk_level: 'low',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        confirmation_phrase: `confirm ${id.slice(0, 8)}`,
      }
      eventBus.publish({
        type: 'manifest.updated',
        payload: { manifestId: preparedManifest.id, status: 'loaded' },
        meta: { id: crypto.randomUUID(), createdAt: new Date().toISOString(), source: 'renderer' },
      })
      return preparedManifest
    },
    confirmCapabilityManifest: async (manifest: CapabilityManifest, input: ConfirmationInput): Promise<CapabilityConfirmation> => {
      const accepted = input.method === 'click' ? input.accepted : input.method === 'voice' && input.transcript.trim() === manifest.confirmation_phrase
      return {
        manifest_id: manifest.id,
        manifest_hash: manifest.hash,
        accepted,
        reason: accepted ? 'accepted' : 'ambiguous',
        confirmed_at: new Date().toISOString(),
      }
    },
    executeCapabilityManifest: async (manifest: CapabilityManifest, confirmation: CapabilityConfirmation): Promise<CapabilityExecutionResult> => {
      if (!preparedManifest || preparedManifest.id !== manifest.id || !confirmation.accepted) {
        return { ok: false, manifest_id: manifest.id, reason: 'browser_preview_no_write', not_sent: true }
      }
      return { ok: true, manifest_id: manifest.id, target_path: manifest.target_path, bytes_written: 0, not_sent: true }
    },
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
