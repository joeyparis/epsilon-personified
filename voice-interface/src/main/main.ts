import { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage, screen } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CapabilityGateway } from '../capabilities/gateway.js'
import { DelegationGateway } from '../delegation/gateway.js'
import { createFaceStatusEvent, createStateChangedEvent, normalizeAppEvent } from '../events/app-events.js'
import type { CapabilityConfirmation, CapabilityManifest, ConfirmationInput, PrepareCapabilityRequest } from '../shared/capability-types.js'
import { DELEGATION_DEFAULTS, type DelegationJobRequest, type DelegationRequest } from '../shared/delegation-types.js'
import { createLocalEventBus } from '../events/local-event-bus.js'
import { createEpsilonFaceBridge, readFaceBridgeConfig } from '../integrations/epsilon-face-bridge.js'
import { AppState, isAppState } from '../shared/state.js'
import { IPC_CHANNELS } from '../shared/ipc.js'
import { createStatusStore } from './status-store.js'
import { registerVoiceHotkey } from './hotkey.js'
import { mintRealtimeSessionFromEnv } from './realtime-session.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const statusStore = createStatusStore()
const eventBus = createLocalEventBus()
const capabilityGateway = new CapabilityGateway({ churchRoot: process.env.EPSILON_VOICE_CHURCH_ROOT ?? path.join(app.getPath('home'), 'Church') })
const delegationGateway = new DelegationGateway({
  endpoint: process.env.EPSILON_VOICE_OPENCODE_ENDPOINT,
  setStatus: (state, message, detail) => statusStore.setState(state, message, detail),
  publishEvent: (event) => { eventBus.publish(event) },
})
const faceBridge = createEpsilonFaceBridge({
  ...readFaceBridgeConfig(),
  onDegraded: (message, detail) => statusStore.setState(AppState.Degraded, message, detail),
})
let statusWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createTrayIcon() {
  const transparentPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHklEQVR4AWP4//8/AyUYTFhYGJgYqGJgYMAAAMb8AxVFy4YBAAAAAElFTkSuQmCC'
  const image = nativeImage.createFromDataURL(transparentPng)
  image.setTemplateImage(true)
  return image
}

function rendererUrl() {
  if (process.env.VITE_DEV_SERVER_URL) return process.env.VITE_DEV_SERVER_URL
  return `file://${path.join(__dirname, '../../dist/renderer/index.html')}`
}

function placeWindowNearTray(window: BrowserWindow) {
  if (!tray) return
  const trayBounds = tray.getBounds()
  const windowBounds = window.getBounds()
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2)
  const y = process.platform === 'darwin'
    ? Math.round(trayBounds.y + trayBounds.height + 6)
    : Math.round(display.workArea.y + display.workArea.height - windowBounds.height - 6)

  window.setPosition(x, y, false)
}

function toggleStatusWindow() {
  if (!statusWindow) return
  if (statusWindow.isVisible()) {
    statusWindow.hide()
    return
  }

  placeWindowNearTray(statusWindow)
  statusWindow.show()
  statusWindow.focus()
}

function createStatusWindow() {
  const window = new BrowserWindow({
    width: 340,
    height: 420,
    show: false,
    frame: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  window.on('blur', () => window.hide())
  window.loadURL(rendererUrl())
  return window
}

function setupIpc() {
  ipcMain.handle(IPC_CHANNELS.GET_STATUS, () => statusStore.getSnapshot())
  ipcMain.handle(IPC_CHANNELS.SET_STATE, (_event, state: unknown, message?: unknown, detail?: unknown) => {
    if (!isAppState(state)) {
      return statusStore.setState(AppState.Error, 'Renderer requested an unknown state.', String(state))
    }

    return statusStore.setState(
      state,
      typeof message === 'string' ? message : `Showing ${state} state from the status harness.`,
      typeof detail === 'string' ? detail : undefined,
    )
  })
  ipcMain.handle(IPC_CHANNELS.REQUEST_REALTIME_SESSION, () => mintRealtimeSessionFromEnv())
  ipcMain.handle(IPC_CHANNELS.PREPARE_CAPABILITY_ACTION, (_event, request: PrepareCapabilityRequest) => {
    const manifest = capabilityGateway.prepare(request)
    statusStore.setState(AppState.Confirming, manifest.human_summary, `Say or click: ${manifest.confirmation_phrase}`)
    eventBus.publish({
      type: 'manifest.updated',
      payload: { manifestId: manifest.id, status: 'loaded' },
      meta: { id: crypto.randomUUID(), createdAt: new Date().toISOString(), source: 'main' },
    })
    eventBus.publish({
      type: 'confirmation.requested',
      payload: { confirmationId: manifest.id, summary: manifest.human_summary },
      meta: { id: crypto.randomUUID(), createdAt: new Date().toISOString(), source: 'main' },
    })
    return manifest
  })
  ipcMain.handle(IPC_CHANNELS.CONFIRM_CAPABILITY_MANIFEST, (_event, manifest: CapabilityManifest, input: ConfirmationInput) => {
    const confirmation = capabilityGateway.confirm(manifest, input)
    eventBus.publish({
      type: 'confirmation.resolved',
      payload: { confirmationId: confirmation.manifest_id, accepted: confirmation.accepted },
      meta: { id: crypto.randomUUID(), createdAt: new Date().toISOString(), source: 'main' },
    })
    if (!confirmation.accepted) statusStore.setState(AppState.Idle, 'Manifest rejected. No write performed.', confirmation.reason)
    return confirmation
  })
  ipcMain.handle(IPC_CHANNELS.EXECUTE_CAPABILITY_MANIFEST, async (_event, manifest: CapabilityManifest, confirmation: CapabilityConfirmation) => {
    const result = await capabilityGateway.execute(manifest, confirmation)
    if (result.ok) {
      statusStore.setState(AppState.Idle, result.not_sent ? 'Local draft or Church write completed. No external send performed.' : 'Capability action completed.', result.target_path)
    } else {
      statusStore.setState(AppState.Error, 'Manifest execution blocked. No write performed.', result.reason)
    }
    return result
  })
  ipcMain.handle(IPC_CHANNELS.START_DELEGATION, async (_event, request: DelegationRequest) => {
    const result = await delegationGateway.delegate({
      parentVoiceTurnId: request.parentVoiceTurnId,
      promptSummary: request.promptSummary,
      model: request.model ?? DELEGATION_DEFAULTS.model,
      profile: request.profile,
      timeoutMs: request.timeoutMs,
      costBudgetCents: request.costBudgetCents ?? DELEGATION_DEFAULTS.costBudgetCents,
    })
    return { accepted: result.accepted, job: result.job, snapshot: result.queue }
  })
  ipcMain.handle(IPC_CHANNELS.GET_DELEGATION_SNAPSHOT, () => delegationGateway.getQueueSnapshot())
  ipcMain.handle(IPC_CHANNELS.DELEGATE_TO_OPENCODE, (_event, request: DelegationJobRequest) => delegationGateway.delegate(request))
  ipcMain.handle(IPC_CHANNELS.GET_DELEGATION_QUEUE, () => delegationGateway.getQueueSnapshot())
  ipcMain.handle(IPC_CHANNELS.CANCEL_DELEGATION_JOB, (_event, jobId: unknown) => delegationGateway.cancel(typeof jobId === 'string' ? jobId : '', 'renderer-requested cancellation'))
  ipcMain.handle(IPC_CHANNELS.PUBLISH_EVENT, (_event, event: unknown) => {
    const normalized = normalizeAppEvent(event)
    if (!normalized) {
      statusStore.setState(AppState.Error, 'Renderer published an invalid app event.')
      return null
    }

    return eventBus.publish(normalized)
  })
}

function setupTray() {
  tray = new Tray(createTrayIcon())
  tray.setToolTip('Epsilon Voice')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Epsilon Voice', click: toggleStatusWindow },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' },
  ]))
  tray.on('click', toggleStatusWindow)
}

app.whenReady().then(() => {
  setupIpc()
  setupTray()
  statusWindow = createStatusWindow()

  eventBus.subscribe((event) => {
    statusWindow?.webContents.send(IPC_CHANNELS.EVENT_PUBLISHED, event)
    faceBridge.handleEvent(event)
  })

  statusStore.subscribe((snapshot) => {
    tray?.setToolTip(`Epsilon Voice: ${snapshot.state}`)
    statusWindow?.webContents.send(IPC_CHANNELS.STATUS_UPDATED, snapshot)
    eventBus.publish(createStateChangedEvent(snapshot, 'main'))
    eventBus.publish(createFaceStatusEvent(snapshot, 'main'))
  })

  registerVoiceHotkey(globalShortcut, statusStore, toggleStatusWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) statusWindow = createStatusWindow()
  })
})

app.on('will-quit', () => {
  faceBridge.close()
  globalShortcut.unregisterAll()
})
