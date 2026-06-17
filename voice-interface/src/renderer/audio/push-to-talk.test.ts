import { describe, expect, it } from 'vitest'
import type { AppEvent } from '../../events/app-events.js'
import { MockRealtimeClient, createMockRealtimeSession } from '../../realtime/mock-client.js'
import type { RealtimeClient, RealtimeSessionMintResult } from '../../realtime/session.js'
import { AppState } from '../../shared/state.js'
import { createMediaStreamCapture, type MicrophoneCaptureAdapter } from './microphone-capture.js'
import { createPushToTalkController, type AudioLevelMeterFactory, type PushToTalkClock } from './push-to-talk.js'

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
      return createMediaStreamCapture({
        getTracks: () => tracks as unknown as MediaStreamTrack[],
        getAudioTracks: () => tracks as unknown as MediaStreamTrack[],
      })
    },
  }
}

function createDeferredCaptureAdapter(capturePromise: Promise<ReturnType<typeof createMediaStreamCapture>>): MicrophoneCaptureAdapter {
  return {
    start: async () => capturePromise,
  }
}

function createLevelMeterHarness(liveLevel = 0.42) {
  const meters: { startedStreams: MediaStream[], stops: number }[] = []
  const factory: AudioLevelMeterFactory = (options) => {
    const meter = {
      startedStreams: [] as MediaStream[],
      stops: 0,
      start: (stream: MediaStream) => {
        meter.startedStreams.push(stream)
        options.publishLevel({ level: liveLevel, muted: false })
      },
      stop: () => {
        meter.stops += 1
        options.publishLevel({ level: 0, muted: true })
      },
    }
    meters.push(meter)
    return meter
  }

  return { factory, meters }
}

function audioLevelPayloads(events: AppEvent[]) {
  return events.flatMap((event) => event.type === 'audio.level' ? [event.payload] : [])
}

function createFailingCaptureAdapter(message = 'permission denied'): MicrophoneCaptureAdapter {
  return {
    start: async () => {
      throw new Error(message)
    },
  }
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

async function settleMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
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

  it('starts level publishing after microphone capture succeeds', async () => {
    const events: AppEvent[] = []
    const levelMeter = createLevelMeterHarness(0.42)
    const controller = createPushToTalkController({
      realtimeClient: new MockRealtimeClient(),
      requestSession: async () => mockSessionResult(),
      microphoneCapture: createCountingCaptureAdapter(),
      audioLevelMeterFactory: levelMeter.factory,
      publishEvent: (event) => events.push(event),
      clock: testClock(),
    })

    await controller.pressStart()

    expect(levelMeter.meters).toHaveLength(1)
    expect(levelMeter.meters[0].startedStreams).toHaveLength(1)
    expect(audioLevelPayloads(events)[0]).toEqual({ level: 0.42, muted: false })
    expect(events).toContainEqual(expect.objectContaining({ type: 'audio.capture-state', payload: { active: true, reason: 'press-and-hold' } }))
  })

  it('publishes a muted zero level when capture stops on release', async () => {
    const events: AppEvent[] = []
    const levelMeter = createLevelMeterHarness(0.54)
    const controller = createPushToTalkController({
      realtimeClient: new MockRealtimeClient(),
      requestSession: async () => mockSessionResult(),
      microphoneCapture: createCountingCaptureAdapter(),
      audioLevelMeterFactory: levelMeter.factory,
      publishEvent: (event) => events.push(event),
      clock: testClock(),
    })

    await controller.pressStart()
    await controller.pressEnd()

    expect(levelMeter.meters[0].stops).toBe(1)
    expect(audioLevelPayloads(events).at(-1)).toEqual({ level: 0, muted: true })
  })

  it('publishes a muted zero level when microphone capture fails', async () => {
    const events: AppEvent[] = []
    const controller = createPushToTalkController({
      realtimeClient: new MockRealtimeClient(),
      requestSession: async () => mockSessionResult(),
      microphoneCapture: createFailingCaptureAdapter(),
      publishEvent: (event) => events.push(event),
      clock: testClock(),
    })

    await controller.pressStart()

    expect(audioLevelPayloads(events)).toContainEqual({ level: 0, muted: true })
    expect(controller.getSnapshot()).toMatchObject({ phase: 'idle' })
  })

  it('silences stale capture when release wins the same turn', async () => {
    const capture = deferred<ReturnType<typeof createMediaStreamCapture>>()
    const events: AppEvent[] = []
    const tracks = [createFakeTrack()]
    const controller = createPushToTalkController({
      realtimeClient: new MockRealtimeClient(),
      requestSession: async () => mockSessionResult(),
      microphoneCapture: createDeferredCaptureAdapter(capture.promise),
      publishEvent: (event) => events.push(event),
      clock: testClock(),
    })

    const startPromise = controller.pressStart()
    await settleMicrotasks()
    await controller.pressEnd()
    capture.resolve(createMediaStreamCapture({
      getTracks: () => tracks as unknown as MediaStreamTrack[],
      getAudioTracks: () => tracks as unknown as MediaStreamTrack[],
    }))
    await startPromise

    expect(tracks.every((track) => track.stopped)).toBe(true)
    expect(audioLevelPayloads(events).at(-1)).toEqual({ level: 0, muted: true })
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
    expect(JSON.stringify(controller.getSnapshot())).not.toContain('stream')
    expect(JSON.stringify(controller.getSnapshot())).not.toContain('track')
    expect(JSON.stringify(controller.getSnapshot())).not.toContain('sample')
    expect(JSON.stringify(controller.getSnapshot())).not.toContain('transcript')
    expect(JSON.stringify(controller.getSnapshot())).not.toContain('levelMeter')
  })

  it('passes the active microphone source to realtime beginTurn only', async () => {
    const tracks = [createFakeTrack()]
    const microphoneSources: unknown[] = []
    const realtimeClient = new MockRealtimeClient()
    const originalBeginTurn = realtimeClient.beginTurn.bind(realtimeClient)
    realtimeClient.beginTurn = async (turn) => {
      microphoneSources.push(turn.microphone)
      await originalBeginTurn(turn)
    }
    const controller = createPushToTalkController({
      realtimeClient,
      requestSession: async () => mockSessionResult(),
      microphoneCapture: createCountingCaptureAdapter([tracks]),
      clock: testClock(),
    })

    await controller.pressStart()

    expect(microphoneSources).toHaveLength(1)
    expect(microphoneSources[0]).toMatchObject({ track: tracks[0] })
    expect(Object.keys(controller.getSnapshot())).not.toContain('microphone')
  })

  it('stops capture and degrades when realtime beginTurn fails', async () => {
    const tracks = [createFakeTrack()]
    const states: AppState[] = []
    const events: string[] = []
    const failingRealtimeClient: RealtimeClient = {
      beginTurn: async () => {
        throw new Error('webrtc setup failed')
      },
      commitTurn: async (turnId) => ({ turnId, responseText: 'unused' }),
      cancelTurn: async () => undefined,
    }
    const controller = createPushToTalkController({
      realtimeClient: failingRealtimeClient,
      requestSession: async () => mockSessionResult(),
      microphoneCapture: createCountingCaptureAdapter([tracks]),
      setState: (state) => states.push(state),
      publishEvent: (event) => events.push(event.type),
      clock: testClock(),
    })

    await controller.pressStart()

    expect(tracks.every((track) => track.stopped)).toBe(true)
    expect(states).toEqual([AppState.Listening, AppState.Degraded])
    expect(events).toContain('realtime.error')
    expect(controller.getSnapshot()).toMatchObject({ phase: 'idle' })
  })

  it('does not leave a live turn when release happens before realtime beginTurn resolves', async () => {
    const begin = deferred()
    const cancelReasons: string[] = []
    const realtimeClient: RealtimeClient = {
      beginTurn: async () => begin.promise,
      commitTurn: async (turnId) => ({ turnId, responseText: 'unused' }),
      cancelTurn: async (_turnId, reason) => {
        cancelReasons.push(reason)
      },
    }
    const controller = createPushToTalkController({
      realtimeClient,
      requestSession: async () => mockSessionResult(),
      microphoneCapture: createCountingCaptureAdapter(),
      clock: testClock(),
    })

    const startPromise = controller.pressStart()
    await settleMicrotasks()
    const releaseResult = await controller.pressEnd()
    begin.resolve()
    await startPromise

    expect(releaseResult).toBeNull()
    expect(controller.getSnapshot()).toMatchObject({ phase: 'idle' })
    expect(cancelReasons).toContain('released-before-realtime-started')
    expect(cancelReasons).toContain('turn-no-longer-listening')
  })

  it('degrades and cleans realtime transport when commitTurn fails', async () => {
    const states: AppState[] = []
    const events: string[] = []
    const cancelReasons: string[] = []
    const realtimeClient: RealtimeClient = {
      beginTurn: async () => undefined,
      commitTurn: async () => {
        throw new Error('data channel failed')
      },
      cancelTurn: async (_turnId, reason) => {
        cancelReasons.push(reason)
      },
    }
    const controller = createPushToTalkController({
      realtimeClient,
      requestSession: async () => mockSessionResult(),
      microphoneCapture: createCountingCaptureAdapter(),
      setState: (state) => states.push(state),
      publishEvent: (event) => events.push(event.type),
      clock: testClock(),
    })

    await controller.pressStart()
    const result = await controller.pressEnd()

    expect(result).toBeNull()
    expect(controller.getSnapshot()).toMatchObject({ phase: 'idle' })
    expect(states).toEqual([AppState.Listening, AppState.Thinking, AppState.Degraded])
    expect(events).toContain('realtime.error')
    expect(cancelReasons).toEqual(['commit-failed'])
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

  it('cleans realtime transport after speaking completes', async () => {
    const realtimeClient = new MockRealtimeClient()
    const controller = createPushToTalkController({
      realtimeClient,
      requestSession: async () => mockSessionResult(),
      microphoneCapture: createCountingCaptureAdapter(),
      clock: testClock(),
    })

    await controller.pressStart()
    const result = await controller.pressEnd()
    await controller.completeSpeaking()

    expect(controller.getSnapshot()).toMatchObject({ phase: 'idle' })
    expect(realtimeClient.events).toContainEqual({ type: 'cancel', turnId: result?.turnId, reason: 'speaking-complete' })
  })

  it('cleans realtime transport when disposed', async () => {
    const realtimeClient = new MockRealtimeClient()
    const controller = createPushToTalkController({
      realtimeClient,
      requestSession: async () => mockSessionResult(),
      microphoneCapture: createCountingCaptureAdapter(),
      clock: testClock(),
    })

    await controller.pressStart()
    const turnId = controller.getSnapshot().turnId
    await controller.dispose()

    expect(controller.getSnapshot()).toMatchObject({ phase: 'idle' })
    expect(realtimeClient.events).toContainEqual({ type: 'cancel', turnId, reason: 'controller-disposed' })
  })
})
