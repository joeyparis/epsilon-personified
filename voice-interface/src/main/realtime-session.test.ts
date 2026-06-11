import { describe, expect, it, vi } from 'vitest'
import { mintRealtimeSessionFromEnv } from './realtime-session.js'

describe('realtime session minting boundary', () => {
  it('returns a typed unavailable result when no main-process key exists', async () => {
    const fetchImpl = vi.fn<(input: string, init: RequestInit) => Promise<Response>>()
    const result = await mintRealtimeSessionFromEnv({ env: {}, now: new Date(0), fetchImpl })

    expect(result).toMatchObject({ ok: false, code: 'missing_api_key', recoverable: true })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns only safe ephemeral session material when configured', async () => {
    const fetchImpl = vi.fn<(input: string, init: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({
      value: 'ephemeral-client-token',
      expires_at: 1780000000,
    }), { status: 200 }))
    const result = await mintRealtimeSessionFromEnv({
      env: { [['OPENAI', 'API', 'KEY'].join('_')]: 'main-process-token', OPENAI_REALTIME_MODEL: 'model-test' },
      now: new Date(0),
      fetchImpl,
    })

    expect(result.ok).toBe(true)
    expect(JSON.stringify(result)).not.toContain('main-process-token')
    if (result.ok) {
      expect(result.session).toMatchObject({ mode: 'ephemeral', model: 'model-test', clientSecret: 'ephemeral-client-token' })
      expect(result.session.sessionId).toMatch(/^rt-/)
    }
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('enforces one active session and uses the 30 minute renewal fallback', async () => {
    const fetchImpl = vi.fn<(input: string, init: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({
      value: 'ephemeral-client-token',
    }), { status: 200 }))

    const capped = await mintRealtimeSessionFromEnv({
      env: { OPENAI_API_KEY: 'main-process-token' },
      activeSessionCount: 1,
      now: new Date(0),
      fetchImpl,
    })
    expect(capped).toMatchObject({ ok: false, code: 'realtime_session_limit_reached' })
    expect(fetchImpl).not.toHaveBeenCalled()

    const result = await mintRealtimeSessionFromEnv({
      env: { OPENAI_API_KEY: 'main-process-token' },
      activeSessionCount: 0,
      now: new Date(0),
      fetchImpl,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.session.expiresAt).toBe(new Date(30 * 60 * 1000).toISOString())
  })
})
