import { createSign } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { GmailAccessTokenProvider } from './gmail-rest-source.js'

export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
export const DEFAULT_WORKSPACE_DELEGATED_USER = 'mail@joeyparis.me'

export interface WorkspaceServiceAccountAccessTokenOptions {
  keyPath: string
  subject?: string
  scopes?: readonly string[]
  tokenUri?: string
  fetcher?: WorkspaceTokenFetcher
  now?: () => Date
}

export interface WorkspaceTokenResponse {
  access_token?: string
  expires_in?: number
}

export interface IamSignJwtWorkspaceAccessTokenOptions {
  serviceAccountEmail: string
  iamAccessTokenProvider: () => Promise<string>
  subject?: string
  scopes?: readonly string[]
  tokenUri?: string
  fetcher?: WorkspaceTokenFetcher
  now?: () => Date
}

export type WorkspaceTokenFetcher = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

interface ServiceAccountKeyFile {
  client_email: string
  private_key: string
  token_uri?: string
}

const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token'
const JWT_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:jwt-bearer'

export function createWorkspaceServiceAccountAccessTokenProvider(options: WorkspaceServiceAccountAccessTokenOptions): GmailAccessTokenProvider {
  const fetcher = options.fetcher ?? defaultWorkspaceTokenFetcher
  const now = options.now ?? (() => new Date())
  const subject = options.subject ?? DEFAULT_WORKSPACE_DELEGATED_USER
  const scopes = options.scopes ?? [GMAIL_READONLY_SCOPE]
  let cached_token: { token: string; expiresAtMs: number } | undefined

  return async () => {
    const now_ms = now().getTime()
    if (cached_token && cached_token.expiresAtMs - now_ms > 60_000) return cached_token.token

    const key_file = await readServiceAccountKeyFile(options.keyPath)
    const token_uri = options.tokenUri ?? key_file.token_uri ?? DEFAULT_TOKEN_URI
    const issued_at_seconds = Math.floor(now_ms / 1000)
    const assertion = signDelegatedJwt({
      clientEmail: key_file.client_email,
      privateKey: key_file.private_key,
      tokenUri: token_uri,
      subject,
      scope: scopes.join(' '),
      issuedAtSeconds: issued_at_seconds,
      expiresAtSeconds: issued_at_seconds + 3600,
    })
    const body = new URLSearchParams({ grant_type: JWT_GRANT_TYPE, assertion }).toString()
    const response = await fetcher(token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!response.ok) throw new Error(`Workspace service account token request failed with status ${response.status}`)
    const token_response = parseWorkspaceTokenResponse(await response.json())
    const expires_in = token_response.expires_in ?? 3600
    cached_token = { token: token_response.access_token, expiresAtMs: now_ms + expires_in * 1000 }
    return cached_token.token
  }
}


export function createIamSignJwtWorkspaceAccessTokenProvider(options: IamSignJwtWorkspaceAccessTokenOptions): GmailAccessTokenProvider {
  const fetcher = options.fetcher ?? defaultWorkspaceTokenFetcher
  const now = options.now ?? (() => new Date())
  const subject = options.subject ?? DEFAULT_WORKSPACE_DELEGATED_USER
  const scopes = options.scopes ?? [GMAIL_READONLY_SCOPE]
  const token_uri = options.tokenUri ?? DEFAULT_TOKEN_URI
  let cached_token: { token: string; expiresAtMs: number } | undefined

  return async () => {
    const now_ms = now().getTime()
    if (cached_token && cached_token.expiresAtMs - now_ms > 60_000) return cached_token.token

    const issued_at_seconds = Math.floor(now_ms / 1000)
    const payload = JSON.stringify({
      iss: options.serviceAccountEmail,
      scope: scopes.join(' '),
      aud: token_uri,
      sub: subject,
      iat: issued_at_seconds,
      exp: issued_at_seconds + 3600,
    })
    const iam_token = await options.iamAccessTokenProvider()
    const sign_url = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(options.serviceAccountEmail)}:signJwt`
    const sign_response = await fetcher(sign_url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${iam_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload }),
    })
    if (!sign_response.ok) throw new Error(`Workspace service account signJwt request failed with status ${sign_response.status}`)
    const signed_jwt = parseSignJwtResponse(await sign_response.json())
    const token_response = await fetcher(token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: JWT_GRANT_TYPE, assertion: signed_jwt }).toString(),
    })
    if (!token_response.ok) throw new Error(`Workspace service account token request failed with status ${token_response.status}`)
    const parsed_token = parseWorkspaceTokenResponse(await token_response.json())
    const expires_in = parsed_token.expires_in ?? 3600
    cached_token = { token: parsed_token.access_token, expiresAtMs: now_ms + expires_in * 1000 }
    return cached_token.token
  }
}

export async function readServiceAccountKeyFile(path: string): Promise<ServiceAccountKeyFile> {
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
  if (!parsed || typeof parsed !== 'object') throw new Error('Workspace service account key must be a JSON object')
  const record = parsed as Record<string, unknown>
  if (typeof record.client_email !== 'string' || !record.client_email) throw new Error('Workspace service account key is missing client_email')
  if (typeof record.private_key !== 'string' || !record.private_key) throw new Error('Workspace service account key is missing private_key')
  if (record.token_uri !== undefined && typeof record.token_uri !== 'string') throw new Error('Workspace service account key token_uri must be a string')
  return { client_email: record.client_email, private_key: record.private_key, token_uri: record.token_uri }
}

function signDelegatedJwt(input: {
  clientEmail: string
  privateKey: string
  tokenUri: string
  subject: string
  scope: string
  issuedAtSeconds: number
  expiresAtSeconds: number
}): string {
  const header = base64UrlJson({ alg: 'RS256', typ: 'JWT' })
  const claim_set = base64UrlJson({
    iss: input.clientEmail,
    scope: input.scope,
    aud: input.tokenUri,
    sub: input.subject,
    iat: input.issuedAtSeconds,
    exp: input.expiresAtSeconds,
  })
  const unsigned = `${header}.${claim_set}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(input.privateKey)
  return `${unsigned}.${base64Url(signature)}`
}

function parseSignJwtResponse(value: unknown): string {
  if (!value || typeof value !== 'object') throw new Error('Workspace signJwt response must be a JSON object')
  const record = value as Record<string, unknown>
  if (typeof record.signedJwt !== 'string' || !record.signedJwt) throw new Error('Workspace signJwt response is missing signedJwt')
  return record.signedJwt
}

function parseWorkspaceTokenResponse(value: unknown): { access_token: string; expires_in?: number } {
  if (!value || typeof value !== 'object') throw new Error('Workspace token response must be a JSON object')
  const record = value as Record<string, unknown>
  if (typeof record.access_token !== 'string' || !record.access_token) throw new Error('Workspace token response is missing access_token')
  if (record.expires_in !== undefined && typeof record.expires_in !== 'number') throw new Error('Workspace token response expires_in must be a number')
  return { access_token: record.access_token, expires_in: record.expires_in }
}

function base64UrlJson(value: Record<string, unknown>): string {
  return base64Url(Buffer.from(JSON.stringify(value), 'utf8'))
}

function base64Url(value: Buffer): string {
  return value.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

const defaultWorkspaceTokenFetcher: WorkspaceTokenFetcher = async (url, init) => fetch(url, init)
