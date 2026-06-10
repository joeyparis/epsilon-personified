import { AppState } from '../shared/state.js'
import { FACE_STATUS_LIMITS, sanitizeFaceStatusPayload, type AppEvent, type FaceStatusEvent } from '../events/app-events.js'

export const DEFAULT_FACE_BRIDGE_URL = 'wss://localhost:5174/ws'

interface SocketLike {
  readonly readyState: number
  send: (message: string) => void
  close?: () => void
  addEventListener?: (type: 'open' | 'error' | 'close', listener: () => void, options?: { once?: boolean }) => void
}

type SocketFactory = (url: string) => SocketLike

export interface EpsilonFaceBridgeOptions {
  enabled?: boolean
  endpoint?: string
  socketFactory?: SocketFactory
  onDegraded?: (message: string, detail?: string) => void
}

export interface EpsilonFaceBridge {
  handleEvent: (event: AppEvent) => void
  close: () => void
}

const SOCKET_OPEN = 1
const SOCKET_CONNECTING = 0

export function isLocalFaceBridgeEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint)
    return ['ws:', 'wss:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
}

export function createEpsilonFaceBridge(options: EpsilonFaceBridgeOptions = {}): EpsilonFaceBridge {
  const endpoint = options.endpoint ?? DEFAULT_FACE_BRIDGE_URL
  const socketFactory = options.socketFactory ?? ((url) => new WebSocket(url))
  let socket: SocketLike | null = null
  let degraded = false
  let pendingMessage: string | null = null
  let pendingOpenSocket: SocketLike | null = null

  function markDegraded(message: string, detail?: string) {
    if (degraded) return
    degraded = true
    options.onDegraded?.(message, detail)
  }

  function resetSocket(targetSocket: SocketLike) {
    if (socket !== targetSocket) return
    socket = null
    pendingMessage = null
    pendingOpenSocket = null
  }

  function getSocket() {
    if (socket) return socket
    if (!isLocalFaceBridgeEndpoint(endpoint)) {
      markDegraded('Epsilon Face bridge endpoint must stay on localhost.', endpoint)
      return null
    }

    try {
      const nextSocket = socketFactory(endpoint)
      socket = nextSocket
      nextSocket.addEventListener?.('error', () => {
        markDegraded('Epsilon Face bridge is offline.', endpoint)
        resetSocket(nextSocket)
      }, { once: true })
      nextSocket.addEventListener?.('close', () => resetSocket(nextSocket), { once: true })
      return nextSocket
    } catch (error) {
      markDegraded('Epsilon Face bridge is offline.', error instanceof Error ? error.message : String(error))
      return null
    }
  }

  function sendFaceStatus(event: FaceStatusEvent) {
    const targetSocket = getSocket()
    if (!targetSocket) return

    const message = serializeFaceStatusEvent(event)

    if (targetSocket.readyState === SOCKET_OPEN) {
      sendMessage(targetSocket, message)
      return
    }

    if (targetSocket.readyState === SOCKET_CONNECTING) {
      pendingMessage = message
      if (pendingOpenSocket === targetSocket) return
      pendingOpenSocket = targetSocket
      targetSocket.addEventListener?.('open', () => {
        const messageToSend = pendingMessage
        pendingMessage = null
        pendingOpenSocket = null
        if (messageToSend) sendMessage(targetSocket, messageToSend)
      }, { once: true })
      return
    }

    resetSocket(targetSocket)
  }

  function sendMessage(targetSocket: SocketLike, message: string) {
    try {
      targetSocket.send(message)
    } catch (error) {
      markDegraded('Epsilon Face bridge send failed.', error instanceof Error ? error.message : String(error))
      resetSocket(targetSocket)
    }
  }

  return {
    handleEvent: (event) => {
      if (!options.enabled || event.type !== 'face.status') return
      sendFaceStatus(event)
    },
    close: () => {
      socket?.close?.()
      socket = null
    },
  }
}

export function serializeFaceStatusEvent(event: FaceStatusEvent) {
  const payload = sanitizeFaceStatusPayload(event.payload as typeof event.payload & Record<string, unknown>)
  return JSON.stringify({
    type: 'face.status',
    status: payload.status.slice(0, FACE_STATUS_LIMITS.status),
    expression: payload.expression,
    detail: payload.detail?.slice(0, FACE_STATUS_LIMITS.detail),
    sourceState: payload.sourceState ?? AppState.Idle,
  })
}

export function readFaceBridgeConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    enabled: env.EPSILON_FACE_BRIDGE_ENABLED === '1' || env.EPSILON_FACE_BRIDGE_ENABLED === 'true',
    endpoint: env.EPSILON_FACE_BRIDGE_URL ?? DEFAULT_FACE_BRIDGE_URL,
  }
}
