import { describe, expect, it } from 'vitest'
import { MockRealtimeClient, createMockRealtimeSession } from '../../realtime/mock-client.js'
import type { RealtimeSessionMintResult } from '../../realtime/session.js'
import { AppState } from '../../shared/state.js'
import { createMediaStreamCapture, type MicrophoneCaptureAdapter } from './microphone-capture.js'
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

interface FakeTrack {
  stopped: boolean
  stop: () => void
}

function createFakeTrack(): FakeTrack {
  return {
    stopped: false,
    stop() {
      this.stopped = true
    },
  }
}

function createCountingCaptureAdapter(trackSets: FakeTrack[][] = [[createFakeTrack()]]): MicrophoneCaptureAdapter {
  let starts = 0
  return {
    start: async () => {
      const tracks = trackSets[Math.min(starts, trackSets.length - 1)] ?? []
      starts += 1
      return createMediaStreamCapture({ getTracks: () => tracks as unknown as MediaStreamTrack[] })
    },
  }
}

function createFailingCaptureAdapter(message = 'permission denied'): MicrophoneCaptureAdapter {
  return {
    start: async () => {
      throw new Error(message)
    },
  }
}

describe('push-to-talk controller', () => {
  it('finalizes a press-and-hold turn on release', async () => {
    const realtimeClient = new MockRealtimeClient()
    const states: AppState[] = []
    const snapshots: string[] = []
    const controller = createPushToTalkController({
      realtimeClient,
      requestSession: async () => mockSessionResult(),
      microphoneCapture: createCountingCaptureAdapter(),
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
      microphoneCapture: createCountingCaptureAdapter(),
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
      microphoneCapture: createCountingCaptureAdapter(),
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
      microphoneCapture: createCountingCaptureAdapter(),
      onAcknowledgement: (acknowledgement) => ackMs.push(acknowledgement.ackMs),
      clock,
    })

    await controller.pressStart()

    expect(ackMs).toHaveLength(1)
    expect(ackMs[0]).toBeLessThan(500)
  })


  it('stops microphone tracks when press-and-hold is released', async () => {
    const tracks = [createFakeTrack(), createFakeTrack()]
    const controller = createPushToTalkController({
      realtimeClient: new MockRealtimeClient(),
      requestSession: async () => mockSessionResult(),
      microphoneCapture: createCountingCaptureAdapter([tracks]),
      clock: testClock(),
    })

    await controller.pressStart()
    expect(tracks.every((track) => !track.stopped)).toBe(true)

    await controller.pressEnd()

    expect(tracks.every((track) => track.stopped)).toBe(true)
  })

  it('stops microphone tracks when toggle-to-talk is stopped', async () => {
    const tracks = [createFakeTrack()]
    const controller = createPushToTalkController({
      realtimeClient: new MockRealtimeClient(),
      requestSession: async () => mockSessionResult(),
      microphoneCapture: createCountingCaptureAdapter([tracks]),
      clock: testClock(),
    })

    await controller.toggle()
    await controller.toggle()

    expect(tracks.every((track) => track.stopped)).toBe(true)
  })

  it('degrades safely when microphone permission fails and does not start realtime', async () => {
    const realtimeClient = new MockRealtimeClient()
    const states: AppState[] = []
    const events: string[] = []
    const controller = createPushToTalkController({
      realtimeClient,
      requestSession: async () => mockSessionResult(),
      microphoneCapture: createFailingCaptureAdapter(),
      setState: (state) => states.push(state),
      publishEvent: (event) => events.push(event.type),
      clock: testClock(),
    })

    await controller.pressStart()

    expect(realtimeClient.events).toEqual([])
    expect(states).toEqual([AppState.Listening, AppState.Degraded])
    expect(events).toContain('realtime.error')
    expect(controller.getSnapshot()).toMatchObject({ phase: 'idle' })
  })

  it('stops the previous capture when a new turn interrupts listening', async () => {
    const firstTracks = [createFakeTrack()]
    const secondTracks = [createFakeTrack()]
    const realtimeClient = new MockRealtimeClient()
    const controller = createPushToTalkController({
      realtimeClient,
      requestSession: async () => mockSessionResult(),
      microphoneCapture: createCountingCaptureAdapter([firstTracks, secondTracks]),
      clock: testClock(),
    })

    await controller.pressStart()
    await controller.pressStart()

    expect(firstTracks.every((track) => track.stopped)).toBe(true)
    expect(secondTracks.every((track) => !track.stopped)).toBe(true)
    expect(realtimeClient.events.map((event) => event.type)).toEqual(['begin', 'cancel', 'begin'])
  })

  it('keeps capture internals out of public snapshots', async () => {
    const controller = createPushToTalkController({
      realtimeClient: new MockRealtimeClient(),
      requestSession: async () => mockSessionResult(),
      microphoneCapture: createCountingCaptureAdapter(),
      clock: testClock(),
    })

    await controller.pressStart()

    expect(Object.keys(controller.getSnapshot()).sort()).toEqual(['ackMs', 'inputMode', 'phase', 'turnId'])
  })

  it('cancels speaking playback when a new turn starts', async () => {
    const realtimeClient = new MockRealtimeClient()
    const interrupted: string[] = []
    const controller = createPushToTalkController({
      realtimeClient,
      requestSession: async () => mockSessionResult(),
      microphoneCapture: createCountingCaptureAdapter(),
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
