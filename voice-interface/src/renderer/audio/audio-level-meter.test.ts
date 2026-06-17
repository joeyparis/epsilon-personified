import { describe, expect, it } from 'vitest'
import { createAudioLevelMeter, normalizeRmsLevel, type AudioLevelPayload } from './audio-level-meter.js'

function createManualScheduler() {
  let nextHandle = 0
  let activeHandle = 0
  const callbacks = new Map<number, FrameRequestCallback>()
  const cancelled: number[] = []

  return {
    scheduler: {
      requestFrame: (callback: FrameRequestCallback) => {
        const handle = ++nextHandle
        activeHandle = handle
        callbacks.set(handle, callback)
        return handle
      },
      cancelFrame: (handle: number) => {
        cancelled.push(handle)
        callbacks.delete(handle)
      },
      now: () => 0,
    },
    runFrame: (timestamp: number) => {
      const callback = callbacks.get(activeHandle)
      callbacks.delete(activeHandle)
      callback?.(timestamp)
    },
    cancelled,
  }
}

describe('audio level meter', () => {
  it('normalizes RMS samples into a clamped 0..1 level', () => {
    expect(normalizeRmsLevel(new Uint8Array([128, 128, 128]))).toBe(0)
    expect(normalizeRmsLevel(new Uint8Array([192, 192, 192]))).toBeCloseTo(0.8, 3)
    expect(normalizeRmsLevel(new Uint8Array([255, 255, 255]))).toBe(1)
    expect(normalizeRmsLevel(new Uint8Array())).toBe(0)
  })

  it('publishes at a bounded cadence and stops cleanly without exposing samples', () => {
    const events: AudioLevelPayload[] = []
    const scheduler = createManualScheduler()
    const disconnected: string[] = []
    const samples = new Uint8Array([192, 192, 192, 192])
    const analyser = {
      fftSize: 4,
      frequencyBinCount: 2,
      getByteTimeDomainData: (array: Uint8Array) => array.fill(samples[0]),
      disconnect: () => { disconnected.push('analyser') },
    }
    const source = {
      connect: () => undefined,
      disconnect: () => { disconnected.push('source') },
    }
    const audioContext = {
      createAnalyser: () => analyser,
      createMediaStreamSource: () => source,
      close: () => { disconnected.push('context') },
    }

    const meter = createAudioLevelMeter({
      publishLevel: (payload) => events.push(payload),
      audioContextFactory: () => audioContext,
      frameScheduler: scheduler.scheduler,
      minIntervalMs: 55,
    })

    meter.start({} as MediaStream)
    scheduler.runFrame(0)
    scheduler.runFrame(20)
    scheduler.runFrame(60)
    meter.stop()

    expect(events).toEqual([
      { level: 0.8, muted: false },
      { level: 0.8, muted: false },
      { level: 0, muted: true },
    ])
    expect(disconnected).toEqual(['source', 'analyser', 'context'])
    expect(scheduler.cancelled).toHaveLength(1)
    expect(JSON.stringify(events)).not.toContain('192')
    expect(JSON.stringify(events)).not.toContain('samples')
  })
})
