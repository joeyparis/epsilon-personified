import { describe, expect, it } from 'vitest'
import { createBrowserMicrophoneCaptureAdapter } from './microphone-capture.js'

interface FakeTrack {
  stopped: boolean
  stop: () => void
}

function createTrack(): FakeTrack {
  return {
    stopped: false,
    stop() {
      this.stopped = true
    },
  }
}

describe('microphone capture adapter', () => {
  it('requests an audio-only media stream through getUserMedia', async () => {
    const track = createTrack()
    const constraints: MediaStreamConstraints[] = []
    const mediaDevices = {
      getUserMedia: async (nextConstraints: MediaStreamConstraints) => {
        constraints.push(nextConstraints)
        return {
          getTracks: () => [track] as unknown as MediaStreamTrack[],
          getAudioTracks: () => [track] as unknown as MediaStreamTrack[],
        } as MediaStream
      },
    }

    const capture = await createBrowserMicrophoneCaptureAdapter(mediaDevices).start()

    expect(constraints).toEqual([{ audio: true }])
    expect(capture.trackCount).toBe(1)
    expect(capture.audioTrack).toBe(track)
    expect(capture.active).toBe(true)

    capture.stop()

    expect(capture.active).toBe(false)
    expect(track.stopped).toBe(true)
  })
})
