import { createLocalAcknowledgement, type LocalAcknowledgement } from '../../audio/local-ack.js'
import { createEventMeta, type AppEvent, type AppEventMeta } from '../../events/app-events.js'
import { createBrowserMicrophoneCaptureAdapter, type MicrophoneCapture, type MicrophoneCaptureAdapter } from './microphone-capture.js'
import { createMockRealtimeSession } from '../../realtime/mock-client.js'
import type { PushToTalkInputMode, RealtimeClient, RealtimeSessionMintResult, SafeRealtimeSession } from '../../realtime/session.js'
import { createDegradedStatus } from '../../shared/degraded-mode.js'
import { AppState } from '../../shared/state.js'

export type PushToTalkPhase = 'idle' | 'listening' | 'thinking' | 'speaking'

export interface PushToTalkSnapshot {
  phase: PushToTalkPhase
  turnId?: string
  inputMode?: PushToTalkInputMode
  ackMs?: number
}

export interface PushToTalkClock {
  now: () => number
  date: () => Date
}

export interface PushToTalkControllerOptions {
  realtimeClient: RealtimeClient
  requestSession?: () => Promise<RealtimeSessionMintResult>
  publishEvent?: (event: AppEvent) => Promise<unknown> | unknown
  setState?: (state: AppState, message: string, detail?: string) => Promise<unknown> | unknown
  onSnapshot?: (snapshot: PushToTalkSnapshot) => void
  onAcknowledgement?: (acknowledgement: LocalAcknowledgement) => void
  microphoneCapture?: MicrophoneCaptureAdapter
  clock?: PushToTalkClock
  source?: AppEventMeta['source']
}

interface ActiveTurn {
  turnId: string
  inputMode: PushToTalkInputMode
  phase: PushToTalkPhase
  startedAtMs: number
  session?: SafeRealtimeSession
  capture?: MicrophoneCapture
}

const DEFAULT_MOCK_SESSION_RESULT: RealtimeSessionMintResult = {
  ok: true,
  session: createMockRealtimeSession('renderer-mock-realtime-session'),
}

function defaultClock(): PushToTalkClock {
  return {
    now: () => globalThis.performance?.now?.() ?? Date.now(),
    date: () => new Date(),
  }
}

function createTurnId(clock: PushToTalkClock) {
  if (globalThis.crypto?.randomUUID) return `turn-${globalThis.crypto.randomUUID()}`
  return `turn-${Math.round(clock.now())}`
}

function eventMeta(source: AppEventMeta['source']) {
  return createEventMeta(source)
}

export function createPushToTalkController(options: PushToTalkControllerOptions) {
  const clock = options.clock ?? defaultClock()
  const source = options.source ?? 'renderer'
  const requestSession = options.requestSession ?? (async () => DEFAULT_MOCK_SESSION_RESULT)
  const microphoneCapture = options.microphoneCapture ?? createBrowserMicrophoneCaptureAdapter()
  let activeTurn: ActiveTurn | null = null
  let lastSnapshot: PushToTalkSnapshot = { phase: 'idle' }

  function publish(event: AppEvent) {
    return options.publishEvent?.(event)
  }

  function setAppState(state: AppState, message: string, detail?: string) {
    return options.setState?.(state, message, detail)
  }

  function updateSnapshot(snapshot: PushToTalkSnapshot) {
    lastSnapshot = snapshot
    options.onSnapshot?.(snapshot)
  }

  function publishPttState(snapshot: PushToTalkSnapshot) {
    publish({
      type: 'voice.ptt-state',
      payload: {
        active: snapshot.phase !== 'idle',
        phase: snapshot.phase,
        turnId: snapshot.turnId,
        inputMode: snapshot.inputMode,
        ackMs: snapshot.ackMs,
      },
      meta: eventMeta(source),
    })
  }

  function stopCapture(turn: ActiveTurn | null) {
    turn?.capture?.stop()
    if (turn) turn.capture = undefined
  }

  function publishCaptureState(active: boolean, reason: string) {
    publish({
      type: 'audio.capture-state',
      payload: { active, reason },
      meta: eventMeta(source),
    })
  }

  function transition(snapshot: PushToTalkSnapshot) {
    updateSnapshot(snapshot)
    publishPttState(snapshot)
  }

  async function interruptActiveTurn(reason: string) {
    if (!activeTurn) return null
    const interrupted = activeTurn
    activeTurn = null
    stopCapture(interrupted)
    await options.realtimeClient.cancelTurn(interrupted.turnId, reason)
    publishCaptureState(false, 'interrupted')
    publish({
      type: 'voice.interrupted',
      payload: { previousTurnId: interrupted.turnId, reason },
      meta: eventMeta(source),
    })
    publish({
      type: 'realtime.turn',
      payload: { turnId: interrupted.turnId, phase: 'cancelled', mode: interrupted.session?.mode ?? 'mock' },
      meta: eventMeta(source),
    })
    transition({ phase: 'idle' })
    return interrupted.turnId
  }

  async function start(inputMode: PushToTalkInputMode): Promise<LocalAcknowledgement> {
    if (activeTurn) await interruptActiveTurn('new-turn')

    const startedAtMs = clock.now()
    const turnId = createTurnId(clock)
    activeTurn = { turnId, inputMode, phase: 'listening', startedAtMs }

    const acknowledgement = createLocalAcknowledgement({
      turnId,
      startedAtMs,
      nowMs: clock.now(),
    })
    options.onAcknowledgement?.(acknowledgement)
    transition({ phase: 'listening', turnId, inputMode, ackMs: acknowledgement.ackMs })
    setAppState(AppState.Listening, 'Listening for push-to-talk input.', `Local acknowledgement in ${acknowledgement.ackMs}ms.`)

    try {
      const capture = await microphoneCapture.start()
      if (!activeTurn || activeTurn.turnId !== turnId) {
        capture.stop()
        return acknowledgement
      }
      activeTurn.capture = capture
      publishCaptureState(true, inputMode)
    } catch (error) {
      if (activeTurn?.turnId !== turnId) return acknowledgement
      activeTurn = null
      publishCaptureState(false, 'capture-failed')
      publish({
        type: 'realtime.error',
        payload: {
          code: 'audio_capture_failed',
          message: error instanceof Error ? error.message : String(error),
          recoverable: true,
        },
        meta: eventMeta(source),
      })
      transition({ phase: 'idle' })
      const degraded = createDegradedStatus('local_mic_denied', error instanceof Error ? error.message : String(error))
      setAppState(degraded.state, degraded.message, degraded.detail)
      return acknowledgement
    }

    const sessionResult = await requestSession()
    if (!activeTurn || activeTurn.turnId !== turnId) return acknowledgement

    if (!sessionResult.ok) {
      publish({
        type: 'realtime.error',
        payload: { code: sessionResult.code, message: sessionResult.message, recoverable: sessionResult.recoverable },
        meta: eventMeta(source),
      })
      stopCapture(activeTurn)
      activeTurn = null
      publishCaptureState(false, 'session-unavailable')
      transition({ phase: 'idle' })
      const degraded = sessionResult.code === 'cost_cap_reached'
        ? createDegradedStatus('cost_cap_reached', sessionResult.message)
        : createDegradedStatus('realtime_unavailable', sessionResult.message)
      setAppState(degraded.state, degraded.message, degraded.detail)
      return acknowledgement
    }

    activeTurn.session = sessionResult.session
    await options.realtimeClient.beginTurn({
      turnId,
      session: sessionResult.session,
      inputMode,
      startedAt: clock.date().toISOString(),
    })
    publish({
      type: 'realtime.turn',
      payload: { turnId, phase: 'started', mode: sessionResult.session.mode },
      meta: eventMeta(source),
    })

    return acknowledgement
  }

  async function release() {
    if (!activeTurn || activeTurn.phase !== 'listening') return null
    const turn = activeTurn
    turn.phase = 'thinking'
    stopCapture(turn)
    publishCaptureState(false, 'finalized')
    transition({ phase: 'thinking', turnId: turn.turnId, inputMode: turn.inputMode, ackMs: lastSnapshot.ackMs })
    setAppState(AppState.Thinking, 'Realtime turn finalized.', 'Mock realtime is preparing a spoken response.')
    publish({
      type: 'realtime.turn',
      payload: { turnId: turn.turnId, phase: 'committed', mode: turn.session?.mode ?? 'mock' },
      meta: eventMeta(source),
    })

    const result = await options.realtimeClient.commitTurn(turn.turnId)
    if (!activeTurn || activeTurn.turnId !== turn.turnId) return result

    activeTurn.phase = 'speaking'
    transition({ phase: 'speaking', turnId: turn.turnId, inputMode: turn.inputMode, ackMs: lastSnapshot.ackMs })
    setAppState(AppState.Speaking, 'Mock realtime response is speaking.', result.responseText)
    publish({
      type: 'realtime.turn',
      payload: { turnId: turn.turnId, phase: 'speaking', mode: turn.session?.mode ?? 'mock' },
      meta: eventMeta(source),
    })
    return result
  }

  async function toggle() {
    if (activeTurn?.phase === 'listening') return release()
    return start('toggle')
  }

  async function completeSpeaking() {
    if (!activeTurn || activeTurn.phase !== 'speaking') return
    const completedTurn = activeTurn
    stopCapture(completedTurn)
    activeTurn = null
    transition({ phase: 'idle' })
    setAppState(AppState.Idle, 'Epsilon voice shell is ready.')
    publish({
      type: 'realtime.turn',
      payload: { turnId: completedTurn.turnId, phase: 'completed', mode: completedTurn.session?.mode ?? 'mock' },
      meta: eventMeta(source),
    })
  }

  return {
    pressStart: () => start('press-and-hold'),
    pressEnd: release,
    toggle,
    interrupt: interruptActiveTurn,
    completeSpeaking,
    dispose: () => {
      const turn = activeTurn
      activeTurn = null
      stopCapture(turn)
    },
    getSnapshot: () => lastSnapshot,
  }
}

export type PushToTalkController = ReturnType<typeof createPushToTalkController>
