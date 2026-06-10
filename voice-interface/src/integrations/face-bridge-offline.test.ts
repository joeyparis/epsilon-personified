import { describe, expect, it } from 'vitest'
import { createFaceStatusEvent } from '../events/app-events.js'
import { AppState, createStatusSnapshot } from '../shared/state.js'
import { createEpsilonFaceBridge, isLocalFaceBridgeEndpoint, serializeFaceStatusEvent } from './epsilon-face-bridge.js'

describe('face-bridge-offline', () => {
  it('does nothing when disabled by default', () => {
    const bridge = createEpsilonFaceBridge({
      socketFactory: () => {
        throw new Error('should not connect')
      },
    })

    expect(() => bridge.handleEvent(createFaceStatusEvent(
      createStatusSnapshot(AppState.Idle, 'Ready'),
      'main',
    ))).not.toThrow()
  })

  it('degrades non-blockingly when the localhost websocket is offline', () => {
    const degraded: string[] = []
    const bridge = createEpsilonFaceBridge({
      enabled: true,
      endpoint: 'wss://localhost:5174/ws',
      socketFactory: () => {
        throw new Error('connection refused')
      },
      onDegraded: (message, detail) => degraded.push(`${message} ${detail}`),
    })

    expect(() => bridge.handleEvent(createFaceStatusEvent(
      createStatusSnapshot(AppState.Speaking, 'Speaking briefly'),
      'main',
    ))).not.toThrow()
    expect(degraded).toEqual(['Epsilon Face bridge is offline. connection refused'])
  })

  it('keeps endpoints restricted to localhost websocket URLs', () => {
    expect(isLocalFaceBridgeEndpoint('wss://localhost:5174/ws')).toBe(true)
    expect(isLocalFaceBridgeEndpoint('ws://127.0.0.1:5174/ws')).toBe(true)
    expect(isLocalFaceBridgeEndpoint('wss://example.com/ws')).toBe(false)
    expect(isLocalFaceBridgeEndpoint('https://localhost:5174/ws')).toBe(false)
  })

  it('serializes only the short face status fields', () => {
    const event = createFaceStatusEvent(
      createStatusSnapshot(AppState.Speaking, 'Speaking now', 'full transcript '.repeat(50)),
      'main',
    )
    const serialized = serializeFaceStatusEvent(event)

    expect(serialized).toContain('face.status')
    expect(serialized.length).toBeLessThan(360)
    expect(serialized).not.toContain('full transcript full transcript full transcript')
  })

  it('reconnects lazily after a socket closes', () => {
    const sockets: TestSocket[] = []
    const bridge = createEpsilonFaceBridge({
      enabled: true,
      endpoint: 'wss://localhost:5174/ws',
      socketFactory: () => {
        const socket = new TestSocket()
        sockets.push(socket)
        return socket
      },
    })

    bridge.handleEvent(createFaceStatusEvent(
      createStatusSnapshot(AppState.Speaking, 'First status'),
      'main',
    ))
    sockets[0]?.emit('close')
    bridge.handleEvent(createFaceStatusEvent(
      createStatusSnapshot(AppState.Thinking, 'Second status'),
      'main',
    ))

    expect(sockets).toHaveLength(2)
    expect(sockets[0]?.sent).toHaveLength(1)
    expect(sockets[1]?.sent).toHaveLength(1)
  })

  it('reconnects lazily after send failure resets a stale socket', () => {
    const sockets: TestSocket[] = []
    const bridge = createEpsilonFaceBridge({
      enabled: true,
      endpoint: 'wss://localhost:5174/ws',
      socketFactory: () => {
        const socket = sockets.length === 0 ? new TestSocket({ failSend: true }) : new TestSocket()
        sockets.push(socket)
        return socket
      },
    })

    bridge.handleEvent(createFaceStatusEvent(
      createStatusSnapshot(AppState.Speaking, 'First status'),
      'main',
    ))
    bridge.handleEvent(createFaceStatusEvent(
      createStatusSnapshot(AppState.Thinking, 'Second status'),
      'main',
    ))

    expect(sockets).toHaveLength(2)
    expect(sockets[0]?.sent).toHaveLength(0)
    expect(sockets[1]?.sent).toHaveLength(1)
  })

})


type TestSocketEvent = 'open' | 'error' | 'close'

class TestSocket {
  readonly readyState = 1
  readonly sent: string[] = []
  private readonly listeners: Partial<Record<TestSocketEvent, Array<() => void>>> = {}

  constructor(private readonly options: { failSend?: boolean } = {}) {}

  send(message: string) {
    if (this.options.failSend) throw new Error('socket send failed')
    this.sent.push(message)
  }

  close() {
    this.emit('close')
  }

  addEventListener(type: TestSocketEvent, listener: () => void) {
    this.listeners[type] ??= []
    this.listeners[type]?.push(listener)
  }

  emit(type: TestSocketEvent) {
    for (const listener of this.listeners[type] ?? []) listener()
  }
}
