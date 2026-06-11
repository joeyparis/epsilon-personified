import { contextBridge, ipcRenderer } from 'electron'
import type { AppEvent } from '../events/app-events.js'
import type { RealtimeSessionMintResult } from '../realtime/types.js'
import type { CapabilityConfirmation, CapabilityExecutionResult, CapabilityManifest, ConfirmationInput, PrepareCapabilityRequest } from '../shared/capability-types.js'
import { IPC_CHANNELS, type EpsilonVoiceApi } from '../shared/ipc.js'
import type { AppState, StatusSnapshot } from '../shared/state.js'

const api: EpsilonVoiceApi = {
  getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.GET_STATUS) as Promise<StatusSnapshot>,
  setState: (state: AppState, message?: string, detail?: string) => ipcRenderer.invoke(IPC_CHANNELS.SET_STATE, state, message, detail) as Promise<StatusSnapshot>,
  publishEvent: (event: AppEvent) => ipcRenderer.invoke(IPC_CHANNELS.PUBLISH_EVENT, event) as Promise<AppEvent | null>,
  requestRealtimeSession: () => ipcRenderer.invoke(IPC_CHANNELS.REQUEST_REALTIME_SESSION) as Promise<RealtimeSessionMintResult>,
  prepareCapabilityAction: (request: PrepareCapabilityRequest) => ipcRenderer.invoke(IPC_CHANNELS.PREPARE_CAPABILITY_ACTION, request) as Promise<CapabilityManifest>,
  confirmCapabilityManifest: (manifest: CapabilityManifest, input: ConfirmationInput) => ipcRenderer.invoke(IPC_CHANNELS.CONFIRM_CAPABILITY_MANIFEST, manifest, input) as Promise<CapabilityConfirmation>,
  executeCapabilityManifest: (manifest: CapabilityManifest, confirmation: CapabilityConfirmation) => ipcRenderer.invoke(IPC_CHANNELS.EXECUTE_CAPABILITY_MANIFEST, manifest, confirmation) as Promise<CapabilityExecutionResult>,
  onStatusUpdate: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: StatusSnapshot) => callback(snapshot)
    ipcRenderer.on(IPC_CHANNELS.STATUS_UPDATED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.STATUS_UPDATED, listener)
  },
  onAppEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, appEvent: AppEvent) => callback(appEvent)
    ipcRenderer.on(IPC_CHANNELS.EVENT_PUBLISHED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_PUBLISHED, listener)
  },
}

contextBridge.exposeInMainWorld('epsilonVoice', api)
