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
})
