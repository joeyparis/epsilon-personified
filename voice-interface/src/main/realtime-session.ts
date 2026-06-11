import { randomUUID } from 'node:crypto'
import { DEFAULT_REALTIME_MODEL, DEFAULT_REALTIME_VOICE, type RealtimeSessionMintResult } from '../realtime/types.js'

const SESSION_TTL_MS = 60_000
const REALTIME_CLIENT_SECRETS_URL = 'https://api.openai.com/v1/realtime/client_secrets'

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export interface RealtimeSessionMintOptions {
  env?: NodeJS.ProcessEnv
  now?: Date
  fetchImpl?: FetchLike
}

interface ClientSecretPayload {
  value?: string
  expires_at?: number
  client_secret?: {
    value?: string
    expires_at?: number
  }
}

export async function mintRealtimeSessionFromEnv(options: RealtimeSessionMintOptions = {}): Promise<RealtimeSessionMintResult> {
  const env = options.env ?? process.env
  const now = options.now ?? new Date()
  const fetchImpl: FetchLike = options.fetchImpl ?? fetch
  const apiKey = env.OPENAI_API_KEY
  if (!apiKey) {
    return {
      ok: false,
      code: 'missing_api_key',
      message: 'OpenAI Realtime credentials are unavailable in the main process environment.',
      recoverable: true,
    }
  }

  const model = env.OPENAI_REALTIME_MODEL ?? DEFAULT_REALTIME_MODEL
  const voice = env.OPENAI_REALTIME_VOICE ?? DEFAULT_REALTIME_VOICE

  try {
    const response = await fetchImpl(REALTIME_CLIENT_SECRETS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model,
          audio: { output: { voice } },
        },
      }),
    })

    if (!response.ok) {
      return {
        ok: false,
        code: 'realtime_session_failed',
        message: `OpenAI Realtime session minting failed with HTTP ${response.status}.`,
        recoverable: true,
      }
    }

    const clientSecret = extractClientSecret(await response.json())
    if (!clientSecret.value) {
      return {
        ok: false,
        code: 'realtime_session_missing_secret',
        message: 'OpenAI Realtime session minting returned no ephemeral client material.',
        recoverable: true,
      }
    }

    return {
      ok: true,
      session: {
        mode: 'ephemeral',
        sessionId: `rt-${randomUUID()}`,
        model,
        voice,
        expiresAt: expiresAtToIso(clientSecret.expiresAt, now),
        clientSecret: clientSecret.value,
      },
    }
  } catch (error) {
    return {
      ok: false,
      code: 'realtime_session_error',
      message: error instanceof Error ? error.message : String(error),
      recoverable: true,
    }
  }
}

function extractClientSecret(value: unknown): { value: string | null; expiresAt?: number } {
  if (!isRecord(value)) return { value: null }
  if (typeof value.value === 'string') {
    return {
      value: value.value,
      expiresAt: typeof value.expires_at === 'number' ? value.expires_at : undefined,
    }
  }

  const nested = value.client_secret
  if (!isRecord(nested) || typeof nested.value !== 'string') return { value: null }
  return {
    value: nested.value,
    expiresAt: typeof nested.expires_at === 'number' ? nested.expires_at : undefined,
  }
}

function expiresAtToIso(expiresAtSeconds: number | undefined, now: Date) {
  if (!expiresAtSeconds) return new Date(now.getTime() + SESSION_TTL_MS).toISOString()
  return new Date(expiresAtSeconds * 1000).toISOString()
}

function isRecord(value: unknown): value is ClientSecretPayload & Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
