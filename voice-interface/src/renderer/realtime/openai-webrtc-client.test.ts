import { describe, expect, it } from 'vitest'
import { createMockRealtimeSession, MockRealtimeClient } from '../../realtime/mock-client.js'
import type { RealtimeTurnStart } from '../../realtime/types.js'
import { OpenAiRealtimeWebRtcClient, RoutingRealtimeClient } from './openai-webrtc-client.js'

class FakeDataChannel {
  readyState: RTCDataChannelState = 'connecting'
  onopen: RTCDataChannel['onopen'] = null
  onclose: RTCDataChannel['onclose'] = null
  onerror: RTCDataChannel['onerror'] = null
  onmessage: RTCDataChannel['onmessage'] = null
  readonly sent: string[] = []
  closed = false

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.closed = true
    this.readyState = 'closed'
  }

  closeFromRemote() {
    this.close()
    this.onclose?.call(this as unknown as RTCDataChannel, new Event('close'))
  }

  open() {
    this.readyState = 'open'
    this.onopen?.call(this as unknown as RTCDataChannel, new Event('open'))
  }

  emitMessage(data: string) {
    this.onmessage?.call(this as unknown as RTCDataChannel, { data } as MessageEvent)
  }
}

class FakePeerConnection {
  static instances: FakePeerConnection[] = []
  ontrack: ((event: RTCTrackEvent) => void) | null = null
  readonly dataChannel = new FakeDataChannel()
  readonly addedTracks: Array<{ track: MediaStreamTrack; stream: MediaStream }> = []
  localDescription: RTCSessionDescriptionInit | null = null
  remoteDescription: RTCSessionDescriptionInit | null = null
  closed = false

  constructor() {
    FakePeerConnection.instances.push(this)
  }

  addTrack(track: MediaStreamTrack, stream: MediaStream) {
    this.addedTracks.push({ track, stream })
    return {} as unknown as RTCRtpSender
  }

  createDataChannel(label: string) {
    expect(label).toBe('oai-events')
    return this.dataChannel
  }

  async createOffer() {
    return { type: 'offer', sdp: 'fake-offer-sdp' } satisfies RTCSessionDescriptionInit
  }

  async setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description
  }

  close() {
    this.closed = true
  }
}

interface FakeAudioElement {
  autoplay: boolean
  hidden: boolean
  srcObject: MediaStream | null
  playCalls: number
  pauseCalls: number
  removed: boolean
  play: () => Promise<void>
  pause: () => void
  remove: () => void
  onended: (() => void) | null
}

function createFakeAudioElement(): FakeAudioElement {
  return {
    autoplay: false,
    hidden: false,
    srcObject: null,
    playCalls: 0,
    pauseCalls: 0,
    removed: false,
    onended: null,
    async play() {
      this.playCalls += 1
    },
    pause() {
      this.pauseCalls += 1
    },
    remove() {
      this.removed = true
    },
  }
}

function createFakeStream() {
  const track = { stop: () => undefined } as unknown as MediaStreamTrack
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream
  return { stream, track }
}

function createEphemeralTurn(): RealtimeTurnStart {
  const { stream, track } = createFakeStream()
  return {
    turnId: 'turn-real-1',
    session: {
      mode: 'ephemeral',
      sessionId: 'session-real-1',
      model: 'gpt-realtime-2',
      voice: 'marin',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      clientSecret: 'ephemeral-client-secret',
    },
    inputMode: 'press-and-hold',
    startedAt: new Date(0).toISOString(),
    microphone: { stream, track },
  }
}

describe('OpenAiRealtimeWebRtcClient', () => {
  it('posts an SDP offer with only the ephemeral client secret and attaches microphone audio', async () => {
    FakePeerConnection.instances = []
    const requests: RequestInit[] = []
    const client = new OpenAiRealtimeWebRtcClient({
      peerConnectionFactory: FakePeerConnection,
      audioElementFactory: () => createFakeAudioElement() as unknown as HTMLAudioElement,
      fetchImpl: async (_input, init) => {
        requests.push(init)
        return new Response('fake-answer-sdp', { status: 200 })
      },
    })
    const turn = createEphemeralTurn()

    await client.beginTurn(turn)

    const peerConnection = FakePeerConnection.instances[0]
    expect(peerConnection.addedTracks).toEqual([{ track: turn.microphone?.track, stream: turn.microphone?.stream }])
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.headers).toEqual({
      Authorization: 'Bearer ephemeral-client-secret',
      'Content-Type': 'application/sdp',
    })
    expect(requests[0]?.body).toBe('fake-offer-sdp')
    expect(peerConnection.remoteDescription).toEqual({ type: 'answer', sdp: 'fake-answer-sdp' })
  })

  it('requests a response after release without committing an empty WebRTC input buffer', async () => {
    FakePeerConnection.instances = []
    const client = new OpenAiRealtimeWebRtcClient({
      peerConnectionFactory: FakePeerConnection,
      audioElementFactory: () => createFakeAudioElement() as unknown as HTMLAudioElement,
      fetchImpl: async () => new Response('fake-answer-sdp', { status: 200 }),
    })
    await client.beginTurn(createEphemeralTurn())
    const peerConnection = FakePeerConnection.instances[0]
    peerConnection.dataChannel.open()

    const result = await client.commitTurn('turn-real-1')

    expect(result).toEqual({ turnId: 'turn-real-1', responseText: 'Realtime response requested.' })
    expect(peerConnection.dataChannel.sent.map((message) => JSON.parse(message) as { type: string })).toEqual([
      { type: 'response.create' },
    ])
  })

  it('plays remote audio and cleans up playback on cancel', async () => {
    FakePeerConnection.instances = []
    const audioElement = createFakeAudioElement()
    const client = new OpenAiRealtimeWebRtcClient({
      peerConnectionFactory: FakePeerConnection,
      audioElementFactory: () => audioElement as unknown as HTMLAudioElement,
      fetchImpl: async () => new Response('fake-answer-sdp', { status: 200 }),
    })
    const turn = createEphemeralTurn()
    await client.beginTurn(turn)
    const peerConnection = FakePeerConnection.instances[0]

    peerConnection.ontrack?.({ streams: [turn.microphone?.stream], track: turn.microphone?.track } as unknown as RTCTrackEvent)
    await client.cancelTurn(turn.turnId, 'unit-test')

    expect(audioElement.srcObject).toBe(null)
    expect(audioElement.playCalls).toBe(1)
    expect(audioElement.pauseCalls).toBe(1)
    expect(audioElement.removed).toBe(true)
    expect(peerConnection.dataChannel.closed).toBe(true)
    expect(peerConnection.closed).toBe(true)
  })

  it('fails commit cleanly when the data channel closes before opening', async () => {
    FakePeerConnection.instances = []
    const client = new OpenAiRealtimeWebRtcClient({
      peerConnectionFactory: FakePeerConnection,
      audioElementFactory: () => createFakeAudioElement() as unknown as HTMLAudioElement,
      fetchImpl: async () => new Response('fake-answer-sdp', { status: 200 }),
    })
    await client.beginTurn(createEphemeralTurn())
    const peerConnection = FakePeerConnection.instances[0]
    peerConnection.dataChannel.closeFromRemote()

    await expect(client.commitTurn('turn-real-1')).rejects.toThrow('Realtime data channel closed before opening.')
  })

  it('fails commit cleanly when the data channel never opens', async () => {
    FakePeerConnection.instances = []
    const client = new OpenAiRealtimeWebRtcClient({
      peerConnectionFactory: FakePeerConnection,
      audioElementFactory: () => createFakeAudioElement() as unknown as HTMLAudioElement,
      fetchImpl: async () => new Response('fake-answer-sdp', { status: 200 }),
      dataChannelOpenTimeoutMs: 1,
    })
    await client.beginTurn(createEphemeralTurn())

    await expect(client.commitTurn('turn-real-1')).rejects.toThrow('Realtime data channel timed out before opening.')
  })

  it('cleans up and reports completion when realtime sends response done', async () => {
    FakePeerConnection.instances = []
    const completedTurns: string[] = []
    const audioElement = createFakeAudioElement()
    const client = new OpenAiRealtimeWebRtcClient({
      peerConnectionFactory: FakePeerConnection,
      audioElementFactory: () => audioElement as unknown as HTMLAudioElement,
      fetchImpl: async () => new Response('fake-answer-sdp', { status: 200 }),
      onTurnComplete: (turnId) => completedTurns.push(turnId),
    })
    await client.beginTurn(createEphemeralTurn())
    const peerConnection = FakePeerConnection.instances[0]

    peerConnection.dataChannel.emitMessage(JSON.stringify({ type: 'response.done' }))
    await Promise.resolve()

    expect(peerConnection.dataChannel.closed).toBe(true)
    expect(peerConnection.closed).toBe(true)
    expect(audioElement.removed).toBe(true)
    expect(completedTurns).toEqual(['turn-real-1'])
  })

  it('keeps playback alive on output audio done until the output buffer stops', async () => {
    FakePeerConnection.instances = []
    const completedTurns: string[] = []
    const audioElement = createFakeAudioElement()
    const client = new OpenAiRealtimeWebRtcClient({
      peerConnectionFactory: FakePeerConnection,
      audioElementFactory: () => audioElement as unknown as HTMLAudioElement,
      fetchImpl: async () => new Response('fake-answer-sdp', { status: 200 }),
      onTurnComplete: (turnId) => completedTurns.push(turnId),
    })
    await client.beginTurn(createEphemeralTurn())
    const peerConnection = FakePeerConnection.instances[0]

    peerConnection.dataChannel.emitMessage(JSON.stringify({ type: 'response.output_audio.done' }))
    await Promise.resolve()

    expect(peerConnection.dataChannel.closed).toBe(false)
    expect(peerConnection.closed).toBe(false)
    expect(audioElement.removed).toBe(false)
    expect(completedTurns).toEqual([])

    peerConnection.dataChannel.emitMessage(JSON.stringify({ type: 'output_audio_buffer.stopped' }))
    await Promise.resolve()

    expect(peerConnection.dataChannel.closed).toBe(true)
    expect(peerConnection.closed).toBe(true)
    expect(audioElement.removed).toBe(true)
    expect(completedTurns).toEqual(['turn-real-1'])
  })

  it('reports input transcript deltas and final text without exposing raw provider events', async () => {
    FakePeerConnection.instances = []
    const transcripts: Array<{ turnId: string, text: string, final: boolean }> = []
    const client = new OpenAiRealtimeWebRtcClient({
      peerConnectionFactory: FakePeerConnection,
      audioElementFactory: () => createFakeAudioElement() as unknown as HTMLAudioElement,
      fetchImpl: async () => new Response('fake-answer-sdp', { status: 200 }),
      onInputTranscript: (transcript) => transcripts.push(transcript),
    })
    await client.beginTurn(createEphemeralTurn())
    const peerConnection = FakePeerConnection.instances[0]

    peerConnection.dataChannel.emitMessage(JSON.stringify({
      type: 'conversation.item.input_audio_transcription.delta',
      delta: 'turn on',
      raw_provider_payload: 'must not be forwarded',
    }))
    peerConnection.dataChannel.emitMessage(JSON.stringify({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: 'turn on the office lights',
      raw_provider_payload: 'must not be forwarded',
    }))

    expect(transcripts).toEqual([
      { turnId: 'turn-real-1', text: 'turn on', final: false },
      { turnId: 'turn-real-1', text: 'turn on the office lights', final: true },
    ])
    expect(JSON.stringify(transcripts)).not.toContain('raw_provider_payload')
  })

  it('cleans up and reports completion when remote audio ends', async () => {
    FakePeerConnection.instances = []
    const completedTurns: string[] = []
    const audioElement = createFakeAudioElement()
    const client = new OpenAiRealtimeWebRtcClient({
      peerConnectionFactory: FakePeerConnection,
      audioElementFactory: () => audioElement as unknown as HTMLAudioElement,
      fetchImpl: async () => new Response('fake-answer-sdp', { status: 200 }),
      onTurnComplete: (turnId) => completedTurns.push(turnId),
    })
    const turn = createEphemeralTurn()
    await client.beginTurn(turn)
    const peerConnection = FakePeerConnection.instances[0]
    peerConnection.ontrack?.({ streams: [turn.microphone?.stream], track: turn.microphone?.track } as unknown as RTCTrackEvent)

    audioElement.onended?.()
    await Promise.resolve()

    expect(peerConnection.dataChannel.closed).toBe(true)
    expect(peerConnection.closed).toBe(true)
    expect(audioElement.removed).toBe(true)
    expect(completedTurns).toEqual(['turn-real-1'])
  })
})

describe('RoutingRealtimeClient', () => {
  it('keeps browser preview and missing ephemeral sessions on the mock client', async () => {
    const realClient = new MockRealtimeClient()
    const mockClient = new MockRealtimeClient()
    const routingClient = new RoutingRealtimeClient(realClient, mockClient, false)
    const turn: RealtimeTurnStart = {
      turnId: 'turn-mock-1',
      session: createMockRealtimeSession('mock-session'),
      inputMode: 'toggle',
      startedAt: new Date(0).toISOString(),
    }

    await routingClient.beginTurn(turn)
    await routingClient.commitTurn(turn.turnId)

    expect(realClient.events).toEqual([])
    expect(mockClient.events.map((event) => event.type)).toEqual(['begin', 'commit'])
  })

  it('forgets failed real beginTurn routes', async () => {
    const realClient: MockRealtimeClient = new MockRealtimeClient()
    realClient.beginTurn = async () => {
      throw new Error('real begin failed')
    }
    const mockClient = new MockRealtimeClient()
    const routingClient = new RoutingRealtimeClient(realClient, mockClient, true)

    await expect(routingClient.beginTurn(createEphemeralTurn())).rejects.toThrow('real begin failed')
    const result = await routingClient.commitTurn('turn-real-1')

    expect(result).toEqual({ turnId: 'turn-real-1', responseText: 'No active mocked realtime turn.' })
  })
})
