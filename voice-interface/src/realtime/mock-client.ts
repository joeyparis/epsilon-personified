import {
  DEFAULT_REALTIME_MODEL,
  DEFAULT_REALTIME_VOICE,
  type PushToTalkInputMode,
  type RealtimeClient,
  type RealtimeSessionMode,
  type RealtimeTurnResult,
  type RealtimeTurnStart,
  type SafeRealtimeSession,
} from './types.js'

export type MockRealtimeEvent =
  | { type: 'begin'; turnId: string; mode: RealtimeSessionMode; inputMode: PushToTalkInputMode }
  | { type: 'commit'; turnId: string; mode: RealtimeSessionMode }
  | { type: 'cancel'; turnId: string; reason: string }

export interface MockRealtimeClientOptions {
  responseText?: string
}

export function createMockRealtimeSession(sessionId: string, now = new Date()): SafeRealtimeSession {
  return {
    mode: 'mock',
    sessionId,
    model: DEFAULT_REALTIME_MODEL,
    voice: DEFAULT_REALTIME_VOICE,
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
  }
}

export class MockRealtimeClient implements RealtimeClient {
  readonly events: MockRealtimeEvent[] = []
  readonly cancelledTurnIds = new Set<string>()
  private activeTurns = new Map<string, RealtimeTurnStart>()

  constructor(private readonly options: MockRealtimeClientOptions = {}) {}

  async beginTurn(turn: RealtimeTurnStart): Promise<void> {
    this.activeTurns.set(turn.turnId, turn)
    this.events.push({
      type: 'begin',
      turnId: turn.turnId,
      mode: turn.session.mode,
      inputMode: turn.inputMode,
    })
  }

  async commitTurn(turnId: string): Promise<RealtimeTurnResult> {
    const turn = this.activeTurns.get(turnId)
    if (!turn) {
      return { turnId, responseText: 'No active mocked realtime turn.' }
    }

    this.events.push({ type: 'commit', turnId, mode: turn.session.mode })
    return {
      turnId,
      responseText: this.options.responseText ?? 'Mock realtime response ready.',
    }
  }

  async cancelTurn(turnId: string, reason: string): Promise<void> {
    this.cancelledTurnIds.add(turnId)
    this.activeTurns.delete(turnId)
    this.events.push({ type: 'cancel', turnId, reason })
  }
}
