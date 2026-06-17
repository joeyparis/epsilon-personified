export interface AudioLevelPayload {
  level: number
  muted: boolean
}

export interface AudioLevelMeter {
  start: (stream: MediaStream) => void
  stop: () => void
}

export interface AudioLevelMeterOptions {
  publishLevel: (payload: AudioLevelPayload) => void
  audioContextFactory?: () => AudioContextLike | undefined
  frameScheduler?: AudioLevelFrameScheduler
  minIntervalMs?: number
}

export interface AudioLevelFrameScheduler {
  requestFrame: (callback: FrameRequestCallback) => number
  cancelFrame: (handle: number) => void
  now: () => number
}

interface AudioContextLike {
  createAnalyser: () => AnalyserNodeLike
  createMediaStreamSource: (stream: MediaStream) => MediaStreamAudioSourceNodeLike
  close?: () => Promise<void> | void
}

interface AnalyserNodeLike {
  fftSize: number
  frequencyBinCount: number
  getByteTimeDomainData: (array: Uint8Array<ArrayBuffer>) => void
  disconnect?: () => void
}

interface MediaStreamAudioSourceNodeLike {
  connect: (node: AudioNode) => unknown
  disconnect?: () => void
}

const DEFAULT_MIN_INTERVAL_MS = 55
const SILENT_LEVEL: AudioLevelPayload = { level: 0, muted: true }

function defaultScheduler(): AudioLevelFrameScheduler | undefined {
  if (!globalThis.requestAnimationFrame || !globalThis.cancelAnimationFrame) return undefined

  return {
    requestFrame: (callback) => globalThis.requestAnimationFrame(callback),
    cancelFrame: (handle) => globalThis.cancelAnimationFrame(handle),
    now: () => globalThis.performance?.now?.() ?? Date.now(),
  }
}

function defaultAudioContextFactory(): AudioContextLike | undefined {
  const AudioContextConstructor = globalThis.AudioContext
    ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

  return AudioContextConstructor ? new AudioContextConstructor() : undefined
}

export function normalizeRmsLevel(samples: Uint8Array): number {
  if (samples.length === 0) return 0

  let sumSquares = 0
  for (const sample of samples) {
    const centered = (sample - 128) / 128
    sumSquares += centered * centered
  }

  return clampLevel(Math.sqrt(sumSquares / samples.length) * 1.6)
}

export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 0
  return Math.min(1, Math.max(0, level))
}

export function createAudioLevelMeter(options: AudioLevelMeterOptions): AudioLevelMeter {
  const scheduler = options.frameScheduler ?? defaultScheduler()
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS
  let audioContext: AudioContextLike | undefined
  let analyser: AnalyserNodeLike | undefined
  let source: MediaStreamAudioSourceNodeLike | undefined
  let frameHandle: number | undefined
  let samples: Uint8Array<ArrayBuffer> | undefined
  let lastPublishMs = Number.NEGATIVE_INFINITY
  let active = false

  function publishSilence() {
    options.publishLevel(SILENT_LEVEL)
  }

  function scheduleNextFrame() {
    if (!active || !scheduler) return
    frameHandle = scheduler.requestFrame(tick)
  }

  function tick(timestamp: number) {
    if (!active || !analyser || !samples) return

    const nowMs = Number.isFinite(timestamp) ? timestamp : scheduler?.now() ?? Date.now()
    if (nowMs - lastPublishMs >= minIntervalMs) {
      analyser.getByteTimeDomainData(samples)
      options.publishLevel({ level: normalizeRmsLevel(samples), muted: false })
      lastPublishMs = nowMs
    }

    scheduleNextFrame()
  }

  function disconnect() {
    if (frameHandle !== undefined && scheduler) {
      scheduler.cancelFrame(frameHandle)
      frameHandle = undefined
    }
    source?.disconnect?.()
    analyser?.disconnect?.()
    void audioContext?.close?.()
    source = undefined
    analyser = undefined
    audioContext = undefined
    samples = undefined
  }

  return {
    start: (stream) => {
      disconnect()
      active = true
      audioContext = (options.audioContextFactory ?? defaultAudioContextFactory)()
      if (!audioContext || !scheduler) {
        publishSilence()
        return
      }

      analyser = audioContext.createAnalyser()
      analyser.fftSize = 1024
      source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser as unknown as AudioNode)
      samples = new Uint8Array(analyser.fftSize)
      lastPublishMs = Number.NEGATIVE_INFINITY
      scheduleNextFrame()
    },
    stop: () => {
      if (!active && !audioContext && !frameHandle) {
        publishSilence()
        return
      }
      active = false
      disconnect()
      publishSilence()
    },
  }
}
