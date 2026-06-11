import { describe, expect, it } from 'vitest'
import { MockRealtimeClient, createMockRealtimeSession } from '../../realtime/mock-client.js'
import type { RealtimeSessionMintResult } from '../../realtime/session.js'
import { AppState } from '../../shared/state.js'
import { createPushToTalkController, type PushToTalkClock } from './push-to-talk.js'

function testClock(): PushToTalkClock & { advance: (ms: number) => void } {
  let nowMs = 100
  return {
    now: () => nowMs,
    date: () => new Date(nowMs),
    advance: (ms: number) => {
      nowMs += ms
    },
  }
}

function mockSessionResult(): RealtimeSessionMintResult {
  return { ok: true, session: createMockRealtimeSession('unit-mock-session') }
}

describe('push-to-talk controller', () => {
  it('finalizes a press-and-hold turn on release', async () => {
    const realtimeClient = new MockRealtimeClient()
    const states: AppState[] = []
    const snapshots: string[] = []
    const controller = createPushToTalkController({
      realtimeClient,
      requestSession: async () => mockSessionResult(),
      setState: (state) => states.push(state),
      onSnapshot: (snapshot) => snapshots.push(snapshot.phase),
      clock: testClock(),
    })

    await controller.pressStart()
    const result = await controller.pressEnd()

    expect(result?.turnId).toMatch(/^turn-/)
    expect(states).toEqual([AppState.Listening, AppState.Thinking, AppState.Speaking])
    expect(snapshots).toEqual(['listening', 'thinking', 'speaking'])
    expect(realtimeClient.events.map((event) => event.type)).toEqual(['begin', 'commit'])
  })

  it('starts and stops toggle-to-talk cleanly', async () => {
    const realtimeClient = new MockRealtimeClient()
    const controller = createPushToTalkController({
      realtimeClient,
      requestSession: async () => mockSessionResult(),
      clock: testClock(),
    })

    await controller.toggle()
    expect(controller.getSnapshot()).toMatchObject({ phase: 'listening', inputMode: 'toggle' })

    await controller.toggle()
    expect(controller.getSnapshot()).toMatchObject({ phase: 'speaking', inputMode: 'toggle' })
    expect(realtimeClient.events.map((event) => event.type)).toEqual(['begin', 'commit'])
  })

  it('uses mocked realtime without live credentials', async () => {
    const realtimeClient = new MockRealtimeClient({ responseText: 'Offline spoken lane exercised.' })
    const events: string[] = []
    const controller = createPushToTalkController({
      realtimeClient,
      requestSession: async () => mockSessionResult(),
      publishEvent: (event) => events.push(event.type),
      clock: testClock(),
    })

    await controller.pressStart()
    const result = await controller.pressEnd()

    expect(result?.responseText).toBe('Offline spoken lane exercised.')
    expect(events).toContain('realtime.turn')
    expect(realtimeClient.events).toContainEqual({ type: 'begin', turnId: result?.turnId, mode: 'mock', inputMode: 'press-and-hold' })
  })

  it('fires local acknowledgement under 500ms', async () => {
    const clock = testClock()
    const ackMs: number[] = []
    const controller = createPushToTalkController({
      realtimeClient: new MockRealtimeClient(),
      requestSession: async () => mockSessionResult(),
      onAcknowledgement: (acknowledgement) => ackMs.push(acknowledgement.ackMs),
      clock,
    })

    await controller.pressStart()

    expect(ackMs).toHaveLength(1)
    expect(ackMs[0]).toBeLessThan(500)
  })

  it('cancels speaking playback when a new turn starts', async () => {
    const realtimeClient = new MockRealtimeClient()
    const interrupted: string[] = []
    const controller = createPushToTalkController({
      realtimeClient,
      requestSession: async () => mockSessionResult(),
      publishEvent: (event) => {
        if (event.type === 'voice.interrupted') interrupted.push(event.payload.previousTurnId)
      },
      clock: testClock(),
    })

    await controller.pressStart()
    const firstResult = await controller.pressEnd()
    await controller.pressStart()

    expect(firstResult).not.toBeNull()
    expect(interrupted).toEqual([firstResult?.turnId])
    expect(realtimeClient.cancelledTurnIds.has(firstResult?.turnId ?? '')).toBe(true)
    expect(controller.getSnapshot().phase).toBe('listening')
  })
})
