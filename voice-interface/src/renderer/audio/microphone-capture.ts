export interface MicrophoneCapture {
  readonly trackCount: number
  readonly active: boolean
  stop: () => void
}

export interface MicrophoneCaptureAdapter {
  start: () => Promise<MicrophoneCapture>
}

type CapturableMediaStream = Pick<MediaStream, 'getTracks'>
type CapturableMediaDevices = Pick<MediaDevices, 'getUserMedia'>

export function createBrowserMicrophoneCaptureAdapter(
  mediaDevices: CapturableMediaDevices | undefined = globalThis.navigator?.mediaDevices,
): MicrophoneCaptureAdapter {
  return {
    start: async () => {
      if (!mediaDevices?.getUserMedia) {
        throw new Error('Microphone capture is unavailable in this renderer context.')
      }

      const stream = await mediaDevices.getUserMedia({ audio: true })
      return createMediaStreamCapture(stream)
    },
  }
}

export function createMediaStreamCapture(stream: CapturableMediaStream): MicrophoneCapture {
  let activeStream: CapturableMediaStream | null = stream
  const trackCount = stream.getTracks().length

  return {
    trackCount,
    get active() {
      return activeStream !== null
    },
    stop: () => {
      const streamToStop = activeStream
      activeStream = null
      if (!streamToStop) return
      for (const track of streamToStop.getTracks()) track.stop()
    },
  }
}

export function createSilentMicrophoneCaptureAdapter(): MicrophoneCaptureAdapter {
  return {
    start: async () => {
      let active = true
      return {
        trackCount: 0,
        get active() {
          return active
        },
        stop: () => {
          active = false
        },
      }
    },
  }
}
