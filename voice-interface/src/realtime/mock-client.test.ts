import { describe, expect, it } from 'vitest'
import { MockRealtimeClient, createMockRealtimeSession } from './mock-client.js'

describe('MockRealtimeClient', () => {
  it('exercises a complete offline realtime spoken turn', async () => {
    const client = new MockRealtimeClient({ responseText: 'offline response' })

    await client.beginTurn({
      turnId: 'turn-1',
      session: createMockRealtimeSession('unit-session'),
      inputMode: 'press-and-hold',
      startedAt: new Date(0).toISOString(),
    })
    const result = await client.commitTurn('turn-1')

    expect(result.responseText).toBe('offline response')
    expect(client.events.map((event) => event.type)).toEqual(['begin', 'commit'])
  })

  it('keeps a response cancellable for interruption tests', async () => {
    const client = new MockRealtimeClient()

    await client.beginTurn({
      turnId: 'turn-2',
      session: createMockRealtimeSession('unit-session'),
      inputMode: 'toggle',
      startedAt: new Date(0).toISOString(),
    })
    await client.cancelTurn('turn-2', 'new-ptt-turn')

    expect(client.cancelledTurnIds.has('turn-2')).toBe(true)
    expect(client.events.map((event) => event.type)).toEqual(['begin', 'cancel'])
  })
})
