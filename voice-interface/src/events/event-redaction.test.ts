import { describe, expect, it } from 'vitest'
import { AppState } from '../shared/state.js'
import { createEventMeta, normalizeAppEvent, sanitizeFaceStatusPayload, type FaceStatusEvent } from './app-events.js'

describe('event-redaction', () => {
  it('redacts transcript-like face status payloads to short bridge-safe fields', () => {
    const payload = sanitizeFaceStatusPayload({
      status: 'User said: please send the entire private transcript to the face bridge with every spoken word and raw assistant reply.',
      detail: 'Assistant said: '.repeat(20),
      expression: 'speaking',
      sourceState: AppState.Speaking,
      transcript: 'full transcript must not survive',
    })

    expect(payload.status.length).toBeLessThanOrEqual(72)
    expect(payload.detail?.length).toBeLessThanOrEqual(120)
    expect(JSON.stringify(payload)).not.toContain('full transcript')
  })

  it('normalizes face-status events by dropping unexpected transcript fields', () => {
    const event = {
      type: 'face.status',
      meta: createEventMeta('renderer'),
      payload: {
        status: 'Listening for the wake phrase.',
        expression: 'listening',
        sourceState: AppState.Listening,
        transcript: 'raw transcript should never be on a face status event',
      },
    } as FaceStatusEvent & { payload: FaceStatusEvent['payload'] & { transcript: string } }

    const normalized = normalizeAppEvent(event)

    expect(normalized?.type).toBe('face.status')
    expect(JSON.stringify(normalized)).not.toContain('raw transcript')
  })
})
