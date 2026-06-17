import { MockRealtimeClient } from '../../realtime/mock-client.js'
import type { RealtimeClient, RealtimeInputTranscript, RealtimeTurnResult, RealtimeTurnStart } from '../../realtime/types.js'

const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls'
const DATA_CHANNEL_LABEL = 'oai-events'
const DEFAULT_DATA_CHANNEL_OPEN_TIMEOUT_MS = 10_000

interface DataChannelLike {
  readyState: RTCDataChannelState
  onopen: RTCDataChannel['onopen']
  onclose: RTCDataChannel['onclose']
  onerror: RTCDataChannel['onerror']
  onmessage: RTCDataChannel['onmessage']
  send: (data: string) => void
  close: () => void
}

interface PeerConnectionLike {
  ontrack: ((event: RTCTrackEvent) => void) | null
  addTrack: (track: MediaStreamTrack, stream: MediaStream) => RTCRtpSender
  createDataChannel: (label: string) => DataChannelLike
  createOffer: () => Promise<RTCSessionDescriptionInit>
  setLocalDescription: (description: RTCSessionDescriptionInit) => Promise<void>
  setRemoteDescription: (description: RTCSessionDescriptionInit) => Promise<void>
  close: () => void
}

type PeerConnectionFactory = new (configuration?: RTCConfiguration) => PeerConnectionLike
type FetchLike = (input: string, init: RequestInit) => Promise<Response>
type AudioElementFactory = () => HTMLAudioElement

export interface OpenAiRealtimeWebRtcClientOptions {
  fetchImpl?: FetchLike
  peerConnectionFactory?: PeerConnectionFactory
  audioElementFactory?: AudioElementFactory
  dataChannelOpenTimeoutMs?: number
  onTurnComplete?: (turnId: string) => void
  onInputTranscript?: (transcript: RealtimeInputTranscript) => void
}

type DataChannelReadiness =
  | { ok: true }
  | { ok: false; message: string }

interface ActiveRealtimeTurn {
  peerConnection: PeerConnectionLike
  dataChannel: DataChannelLike
  remoteAudio: HTMLAudioElement
  dataChannelReady: Promise<DataChannelReadiness>
  playbackError: string | null
}

export class OpenAiRealtimeWebRtcClient implements RealtimeClient {
  private readonly activeTurns = new Map<string, ActiveRealtimeTurn>()
  private readonly fetchImpl: FetchLike
  private readonly peerConnectionFactory: PeerConnectionFactory
  private readonly audioElementFactory: AudioElementFactory
  private readonly dataChannelOpenTimeoutMs: number
  private readonly onTurnComplete?: (turnId: string) => void
  private readonly onInputTranscript?: (transcript: RealtimeInputTranscript) => void

  constructor(options: OpenAiRealtimeWebRtcClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.peerConnectionFactory = options.peerConnectionFactory ?? RTCPeerConnection
    this.audioElementFactory = options.audioElementFactory ?? createAutoplayAudioElement
    this.dataChannelOpenTimeoutMs = options.dataChannelOpenTimeoutMs ?? DEFAULT_DATA_CHANNEL_OPEN_TIMEOUT_MS
    this.onTurnComplete = options.onTurnComplete
    this.onInputTranscript = options.onInputTranscript
  }

  async beginTurn(turn: RealtimeTurnStart): Promise<void> {
    const clientSecret = turn.session.clientSecret
    if (!clientSecret) throw new Error('Realtime ephemeral client material is unavailable for this turn.')

    const stream = resolveMicrophoneStream(turn)
    const audioTrack = resolveMicrophoneTrack(turn)
    if (!stream || !audioTrack) throw new Error('Realtime microphone stream is unavailable for this turn.')

    await this.cancelTurn(turn.turnId, 'replace-existing-turn')

    const peerConnection = new this.peerConnectionFactory()
    const dataChannel = peerConnection.createDataChannel(DATA_CHANNEL_LABEL)
    const remoteAudio = this.audioElementFactory()
    const activeTurn: ActiveRealtimeTurn = {
      peerConnection,
      dataChannel,
      remoteAudio,
      dataChannelReady: waitForDataChannel(dataChannel, this.dataChannelOpenTimeoutMs),
      playbackError: null,
    }

    dataChannel.onmessage = (event) => {
      const realtimeEvent = parseRealtimeEvent(event.data)
      const eventType = realtimeEvent?.type
      const inputTranscript = parseInputTranscript(realtimeEvent, turn.turnId)
      if (inputTranscript) this.onInputTranscript?.(inputTranscript)
      if (eventType === 'response.done' || eventType === 'output_audio_buffer.stopped') this.completeTurn(turn.turnId)
    }

    peerConnection.ontrack = (event) => {
      remoteAudio.srcObject = event.streams[0] ?? new MediaStream([event.track])
      remoteAudio.onended = () => this.completeTurn(turn.turnId)
      const playPromise = remoteAudio.play()
      if (playPromise) {
        void playPromise.catch((error: unknown) => {
          activeTurn.playbackError = error instanceof Error ? error.message : String(error)
        })
      }
    }

    peerConnection.addTrack(audioTrack, stream)
    this.activeTurns.set(turn.turnId, activeTurn)

    try {
      const offer = await peerConnection.createOffer()
      await peerConnection.setLocalDescription(offer)
      if (!offer.sdp) throw new Error('Realtime WebRTC offer did not include SDP.')

      const response = await this.fetchImpl(REALTIME_CALLS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      })

      if (!response.ok) throw new Error(`Realtime WebRTC SDP exchange failed with HTTP ${response.status}.`)

      await peerConnection.setRemoteDescription({ type: 'answer', sdp: await response.text() })
    } catch (error) {
      await this.cancelTurn(turn.turnId, 'begin-failed')
      throw error
    }
  }

  async commitTurn(turnId: string): Promise<RealtimeTurnResult> {
    const turn = this.activeTurns.get(turnId)
    if (!turn) return { turnId, responseText: 'No active realtime turn.' }

    const readiness = await turn.dataChannelReady
    if (!readiness.ok) throw new Error(readiness.message)
    if (turn.dataChannel.readyState !== 'open') throw new Error('Realtime data channel is not open.')
    sendRealtimeEvent(turn.dataChannel, { type: 'response.create' })

    return { turnId, responseText: 'Realtime response requested.' }
  }

  async cancelTurn(turnId: string, _reason: string): Promise<void> {
    const turn = this.activeTurns.get(turnId)
    if (!turn) return

    this.activeTurns.delete(turnId)
    cleanupRemoteAudio(turn.remoteAudio)
    turn.dataChannel.close()
    turn.peerConnection.close()
  }

  private completeTurn(turnId: string) {
    if (!this.activeTurns.has(turnId)) return
    void this.cancelTurn(turnId, 'realtime-response-complete').then(() => {
      this.onTurnComplete?.(turnId)
    })
  }
}

export class RoutingRealtimeClient implements RealtimeClient {
  private readonly activeClients = new Map<string, RealtimeClient>()

  constructor(
    private readonly realClient: RealtimeClient,
    private readonly mockClient: RealtimeClient = new MockRealtimeClient(),
    private readonly realTransportEnabled = true,
  ) {}

  async beginTurn(turn: RealtimeTurnStart): Promise<void> {
    const client = this.shouldUseRealClient(turn) ? this.realClient : this.mockClient
    this.activeClients.set(turn.turnId, client)
    try {
      await client.beginTurn(turn)
    } catch (error) {
      this.activeClients.delete(turn.turnId)
      throw error
    }
  }

  async commitTurn(turnId: string): Promise<RealtimeTurnResult> {
    return (this.activeClients.get(turnId) ?? this.mockClient).commitTurn(turnId)
  }

  async cancelTurn(turnId: string, reason: string): Promise<void> {
    const client = this.activeClients.get(turnId)
    this.activeClients.delete(turnId)
    await (client ?? this.mockClient).cancelTurn(turnId, reason)
  }

  private shouldUseRealClient(turn: RealtimeTurnStart) {
    return this.realTransportEnabled && turn.session.mode === 'ephemeral' && Boolean(turn.session.clientSecret)
  }
}

function resolveMicrophoneStream(turn: RealtimeTurnStart) {
  if (turn.microphone?.stream) return turn.microphone.stream
  const track = turn.microphone?.track
  return track ? new MediaStream([track]) : undefined
}

function resolveMicrophoneTrack(turn: RealtimeTurnStart) {
  return turn.microphone?.track ?? turn.microphone?.stream?.getAudioTracks()[0]
}

function waitForDataChannel(dataChannel: DataChannelLike, timeoutMs: number) {
  if (dataChannel.readyState === 'open') return Promise.resolve({ ok: true } satisfies DataChannelReadiness)
  return new Promise<DataChannelReadiness>((resolve) => {
    let settled = false
    const finish = (result: DataChannelReadiness) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(result)
    }
    const timeout = setTimeout(() => {
      finish({ ok: false, message: 'Realtime data channel timed out before opening.' })
    }, timeoutMs)
    dataChannel.onopen = () => finish({ ok: true })
    dataChannel.onerror = () => finish({ ok: false, message: 'Realtime data channel failed before opening.' })
    dataChannel.onclose = () => finish({ ok: false, message: 'Realtime data channel closed before opening.' })
  })
}

function sendRealtimeEvent(dataChannel: DataChannelLike, event: { type: string }) {
  dataChannel.send(JSON.stringify(event))
}

function parseRealtimeEvent(data: unknown): Record<string, unknown> | null {
  if (typeof data !== 'string') return null
  try {
    const event = JSON.parse(data) as unknown
    if (!isRecord(event) || typeof event.type !== 'string') return null
    return event
  } catch {
    return null
  }
}

function parseInputTranscript(event: Record<string, unknown> | null, turnId: string): RealtimeInputTranscript | null {
  if (!event) return null
  if (event.type === 'conversation.item.input_audio_transcription.delta') {
    const text = normalizeTranscriptText(event.delta)
    return text ? { turnId, text, final: false } : null
  }
  if (event.type === 'conversation.item.input_audio_transcription.completed') {
    const text = normalizeTranscriptText(event.transcript)
    return text ? { turnId, text, final: true } : null
  }
  return null
}

function normalizeTranscriptText(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function createAutoplayAudioElement() {
  const audioElement = document.createElement('audio')
  audioElement.autoplay = true
  audioElement.hidden = true
  document.body.append(audioElement)
  return audioElement
}

function cleanupRemoteAudio(audioElement: HTMLAudioElement) {
  audioElement.pause()
  audioElement.srcObject = null
  audioElement.remove()
}
