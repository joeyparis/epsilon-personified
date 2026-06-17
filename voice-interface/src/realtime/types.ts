export const DEFAULT_REALTIME_MODEL = 'gpt-realtime-2'
export const DEFAULT_REALTIME_VOICE = 'marin'
export const DEFAULT_REALTIME_TRANSCRIPTION_MODEL = 'gpt-4o-transcribe'

export type PushToTalkInputMode = 'press-and-hold' | 'toggle'
export type RealtimeSessionMode = 'mock' | 'ephemeral'

export interface SafeRealtimeSession {
  mode: RealtimeSessionMode
  sessionId: string
  model: string
  voice: string
  expiresAt: string
  clientSecret?: string
}

export type RealtimeSessionMintResult =
  | { ok: true; session: SafeRealtimeSession }
  | { ok: false; code: string; message: string; recoverable: boolean }

export interface RealtimeTurnStart {
  turnId: string
  session: SafeRealtimeSession
  inputMode: PushToTalkInputMode
  startedAt: string
  microphone?: RealtimeTurnMicrophoneSource
}

export interface RealtimeTurnMicrophoneSource {
  stream?: MediaStream
  track?: MediaStreamTrack
}

export interface RealtimeTurnResult {
  turnId: string
  responseText: string
}

export interface RealtimeInputTranscript {
  turnId: string
  text: string
  final: boolean
}

export interface RealtimeClient {
  beginTurn: (turn: RealtimeTurnStart) => Promise<void>
  commitTurn: (turnId: string) => Promise<RealtimeTurnResult>
  cancelTurn: (turnId: string, reason: string) => Promise<void>
}
