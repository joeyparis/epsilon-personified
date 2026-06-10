import { AppState } from '../shared/state.js'
import { FACE_STATUS_LIMITS, sanitizeFaceStatusPayload, type AppEvent, type FaceStatusEvent } from '../events/app-events.js'

export const DEFAULT_FACE_BRIDGE_URL = 'wss://localhost:5174/ws'

interface SocketLike {
  readonly readyState: number
  send: (message: string) => void
  close?: () => void
  addEventListener?: (type: 'open' | 'error', listener: () => void, options?: { once?: boolean }) => void
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

  function markDegraded(message: string, detail?: string) {
    if (degraded) return
    degraded = true
    options.onDegraded?.(message, detail)
  }

  function getSocket() {
    if (socket) return socket
    if (!isLocalFaceBridgeEndpoint(endpoint)) {
      markDegraded('Epsilon Face bridge endpoint must stay on localhost.', endpoint)
      return null
    }

    try {
      socket = socketFactory(endpoint)
      socket.addEventListener?.('error', () => markDegraded('Epsilon Face bridge is offline.', endpoint), { once: true })
      return socket
    } catch (error) {
      markDegraded('Epsilon Face bridge is offline.', error instanceof Error ? error.message : String(error))
      return null
    }
  }

  function sendFaceStatus(event: FaceStatusEvent) {
    const targetSocket = getSocket()
    if (!targetSocket) return

    const message = serializeFaceStatusEvent(event)
    const send = () => {
      try {
        targetSocket.send(message)
      } catch (error) {
        markDegraded('Epsilon Face bridge send failed.', error instanceof Error ? error.message : String(error))
      }
    }

    if (targetSocket.readyState === SOCKET_OPEN) {
      send()
      return
    }

    if (targetSocket.readyState === SOCKET_CONNECTING) {
      targetSocket.addEventListener?.('open', send, { once: true })
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
