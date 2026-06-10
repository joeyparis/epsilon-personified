import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type EpsilonVoiceApi } from '../shared/ipc.js'
import type { AppState, StatusSnapshot } from '../shared/state.js'

const api: EpsilonVoiceApi = {
  getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.GET_STATUS) as Promise<StatusSnapshot>,
  setState: (state: AppState) => ipcRenderer.invoke(IPC_CHANNELS.SET_STATE, state) as Promise<StatusSnapshot>,
  onStatusUpdate: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: StatusSnapshot) => callback(snapshot)
    ipcRenderer.on(IPC_CHANNELS.STATUS_UPDATED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.STATUS_UPDATED, listener)
  },
}

contextBridge.exposeInMainWorld('epsilonVoice', api)
