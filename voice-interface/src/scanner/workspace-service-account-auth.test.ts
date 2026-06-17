import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createIamSignJwtWorkspaceAccessTokenProvider, createWorkspaceServiceAccountAccessTokenProvider, GMAIL_READONLY_SCOPE } from './workspace-service-account-auth.js'

describe('workspace service account auth', () => {
  it('requests a delegated Gmail readonly token without broad scopes', async () => {
    const key_path = await writeKeyFixture()
    const requests: Array<{ url: string; body: URLSearchParams }> = []
    const provider = createWorkspaceServiceAccountAccessTokenProvider({
      keyPath: key_path,
      subject: 'mail@joeyparis.me',
      now: () => new Date('2026-06-17T00:00:00.000Z'),
      fetcher: async (url, init) => {
        requests.push({ url, body: new URLSearchParams(init.body) })
        return { ok: true, status: 200, json: async () => ({ access_token: 'delegated-token', expires_in: 3600 }) }
      },
    })

    const token = await provider()
    const cached_token = await provider()
    const assertion = requests[0]?.body.get('assertion') ?? ''
    const claims = decodeJwtPart(assertion, 1)

    expect(token).toBe('delegated-token')
    expect(cached_token).toBe('delegated-token')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe('https://oauth2.googleapis.com/token')
    expect(requests[0]?.body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
    expect(claims.iss).toBe('moi-gmail-scanner@epsilon-490315.iam.gserviceaccount.com')
    expect(claims.sub).toBe('mail@joeyparis.me')
    expect(claims.scope).toBe(GMAIL_READONLY_SCOPE)
    expect(String(claims.scope)).not.toContain('modify')
    expect(claims.aud).toBe('https://oauth2.googleapis.com/token')
  })

  it('uses IAM signJwt for keyless domain-wide delegated tokens', async () => {
    const requests: Array<{ url: string; headers: Record<string, string>; body: string }> = []
    const provider = createIamSignJwtWorkspaceAccessTokenProvider({
      serviceAccountEmail: 'moi-gmail-scanner@epsilon-490315.iam.gserviceaccount.com',
      iamAccessTokenProvider: async () => 'iam-access-token',
      subject: 'mail@joeyparis.me',
      now: () => new Date('2026-06-17T00:00:00.000Z'),
      fetcher: async (url, init) => {
        requests.push({ url, headers: init.headers, body: init.body })
        if (url.includes(':signJwt')) return { ok: true, status: 200, json: async () => ({ signedJwt: 'signed.delegated.jwt' }) }
        return { ok: true, status: 200, json: async () => ({ access_token: 'gmail-readonly-token', expires_in: 3600 }) }
      },
    })

    const token = await provider()
    const sign_body = JSON.parse(requests[0]?.body ?? '{}') as { payload?: string }
    const claims = JSON.parse(sign_body.payload ?? '{}') as Record<string, unknown>
    const token_body = new URLSearchParams(requests[1]?.body ?? '')

    expect(token).toBe('gmail-readonly-token')
    expect(requests).toHaveLength(2)
    expect(requests[0]?.url).toContain('/serviceAccounts/moi-gmail-scanner%40epsilon-490315.iam.gserviceaccount.com:signJwt')
    expect(requests[0]?.headers.Authorization).toBe('Bearer iam-access-token')
    expect(claims.iss).toBe('moi-gmail-scanner@epsilon-490315.iam.gserviceaccount.com')
    expect(claims.sub).toBe('mail@joeyparis.me')
    expect(claims.scope).toBe(GMAIL_READONLY_SCOPE)
    expect(token_body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
    expect(token_body.get('assertion')).toBe('signed.delegated.jwt')
  })

  it('fails clearly when the service account key is missing required fields', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'epsilon-workspace-auth-bad-'))
    const key_path = join(dir, 'key.json')
    await writeFile(key_path, JSON.stringify({ client_email: 'missing-private-key@example.com' }), 'utf8')
    const provider = createWorkspaceServiceAccountAccessTokenProvider({ keyPath: key_path })

    await expect(provider()).rejects.toThrow('missing private_key')
  })
})

async function writeKeyFixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'epsilon-workspace-auth-'))
  const key_path = join(dir, 'key.json')
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const private_key = pair.privateKey.export({ type: 'pkcs8', format: 'pem' })
  await writeFile(key_path, JSON.stringify({
    client_email: 'moi-gmail-scanner@epsilon-490315.iam.gserviceaccount.com',
    private_key,
    token_uri: 'https://oauth2.googleapis.com/token',
  }), 'utf8')
  return key_path
}

function decodeJwtPart(jwt: string, index: number): Record<string, unknown> {
  const part = jwt.split('.')[index] ?? ''
  const padded = part.padEnd(Math.ceil(part.length / 4) * 4, '=')
  const json = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  const parsed: unknown = JSON.parse(json)
  if (!parsed || typeof parsed !== 'object') throw new Error('JWT part did not decode to an object')
  return parsed as Record<string, unknown>
}
