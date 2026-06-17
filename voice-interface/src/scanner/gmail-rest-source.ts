import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { GmailScannerAttachmentRecord, GmailScannerMessageRecord, ScannerMessageFilterOptions, ScannerMessageSource } from './intake.js'

export type GmailAccessTokenProvider = () => Promise<string>

export interface GmailRestFetchResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

export type GmailRestFetcher = (url: string, init: { method: 'GET'; headers: Record<string, string> }) => Promise<GmailRestFetchResponse>

export interface GmailRestScannerMessageSourceOptions {
  accessTokenProvider: GmailAccessTokenProvider
  fetcher?: GmailRestFetcher
  userId?: string
  baseUrl?: string
  defaultQuery?: string
  maxResults?: number
  attachmentDownloadDir?: string
}

interface GmailSearchResponse {
  messages?: Array<{ id?: string; threadId?: string }>
}

interface GmailMessageResponse {
  id?: string
  threadId?: string
  labelIds?: string[]
  internalDate?: string
  payload?: GmailPayloadPart
}

interface GmailPayloadPart {
  partId?: string
  filename?: string
  mimeType?: string
  headers?: Array<{ name?: string; value?: string }>
  body?: { attachmentId?: string; size?: number; data?: string }
  parts?: GmailPayloadPart[]
}

interface GmailAttachmentResponse {
  data?: string
  size?: number
}

export const DEFAULT_GMAIL_SCANNER_QUERY = 'from:joey@leadjig.com to:mail@joeyparis.me subject:"Scanned Documents - South Office" has:attachment filename:pdf newer_than:30d'

export function createGmailRestScannerMessageSource(options: GmailRestScannerMessageSourceOptions): ScannerMessageSource {
  const fetcher = options.fetcher ?? defaultGmailRestFetcher
  const base_url = (options.baseUrl ?? 'https://gmail.googleapis.com').replace(/\/$/, '')
  const user_id = options.userId ?? 'me'
  const default_query = options.defaultQuery ?? DEFAULT_GMAIL_SCANNER_QUERY
  const default_max_results = options.maxResults ?? 10

  return {
    searchScannerMessages: async (filter_options = {}) => {
      const token = await options.accessTokenProvider()
      const search_url = buildGmailUrl(base_url, user_id, '/messages', {
        q: default_query,
        maxResults: String(filter_options.maxResults ?? default_max_results),
      })
      const search_json = await getJson<GmailSearchResponse>(fetcher, search_url, token)
      const messages = search_json.messages ?? []
      const records: GmailScannerMessageRecord[] = []

      for (const message of messages) {
        if (!message.id) continue
        const message_url = buildGmailUrl(base_url, user_id, `/messages/${encodeURIComponent(message.id)}`, {
          format: 'full',
        })
        const message_json = await getJson<GmailMessageResponse>(fetcher, message_url, token)
        records.push(await mapGmailMessage({ message: message_json, fallbackThreadId: message.threadId, baseUrl: base_url, userId: user_id, token, fetcher, attachmentDownloadDir: options.attachmentDownloadDir }))
      }

      return records.filter((record) => matchesLocalOptions(record, filter_options))
    },
  }
}

async function mapGmailMessage(input: {
  message: GmailMessageResponse
  fallbackThreadId?: string
  baseUrl: string
  userId: string
  token: string
  fetcher: GmailRestFetcher
  attachmentDownloadDir?: string
}): Promise<GmailScannerMessageRecord> {
  const headers = input.message.payload?.headers ?? []
  const from = headerValue(headers, 'from') || 'unknown sender'
  const subject = headerValue(headers, 'subject') || '(no subject)'
  const date_header = headerValue(headers, 'date')
  const received_at = input.message.internalDate ? new Date(Number(input.message.internalDate)).toISOString() : new Date(date_header || 0).toISOString()
  const message_id = input.message.id ?? 'unknown-message'

  return {
    id: message_id,
    threadId: input.message.threadId ?? input.fallbackThreadId,
    from,
    subject,
    receivedAt: received_at,
    labels: input.message.labelIds ?? [],
    attachments: await collectAttachments({ payload: input.message.payload, messageId: message_id, baseUrl: input.baseUrl, userId: input.userId, token: input.token, fetcher: input.fetcher, attachmentDownloadDir: input.attachmentDownloadDir }),
  }
}

async function collectAttachments(input: {
  payload?: GmailPayloadPart
  messageId: string
  baseUrl: string
  userId: string
  token: string
  fetcher: GmailRestFetcher
  attachmentDownloadDir?: string
}): Promise<GmailScannerAttachmentRecord[]> {
  if (!input.payload) return []
  const attachments: GmailScannerAttachmentRecord[] = []
  const visit = async (part: GmailPayloadPart) => {
    const filename = (part.filename ?? '').trim()
    const attachment_id = part.body?.attachmentId
    if (filename && attachment_id) {
      attachments.push(await mapAttachment({ part, filename, attachmentId: attachment_id, messageId: input.messageId, baseUrl: input.baseUrl, userId: input.userId, token: input.token, fetcher: input.fetcher, attachmentDownloadDir: input.attachmentDownloadDir }))
    }
    for (const child_part of part.parts ?? []) await visit(child_part)
  }
  await visit(input.payload)
  return attachments
}

async function mapAttachment(input: {
  part: GmailPayloadPart
  filename: string
  attachmentId: string
  messageId: string
  baseUrl: string
  userId: string
  token: string
  fetcher: GmailRestFetcher
  attachmentDownloadDir?: string
}): Promise<GmailScannerAttachmentRecord> {
  const base_record = {
    id: input.attachmentId,
    filename: input.filename,
    mimeType: input.part.mimeType ?? 'application/octet-stream',
    sizeBytes: input.part.body?.size ?? 0,
  }
  if (!input.attachmentDownloadDir) return base_record

  const attachment_url = buildGmailUrl(input.baseUrl, input.userId, `/messages/${encodeURIComponent(input.messageId)}/attachments/${encodeURIComponent(input.attachmentId)}`, {})
  const attachment_json = await getJson<GmailAttachmentResponse>(input.fetcher, attachment_url, input.token)
  const bytes = decodeBase64Url(attachment_json.data ?? '')
  const content_hash = hashBytes(bytes)
  const local_path = await writeDownloadedAttachment({ dir: input.attachmentDownloadDir, messageId: input.messageId, attachmentId: input.attachmentId, filename: input.filename, bytes })

  return {
    ...base_record,
    sizeBytes: attachment_json.size ?? bytes.byteLength,
    contentHash: content_hash,
    localPath: local_path,
  }
}

function matchesLocalOptions(record: GmailScannerMessageRecord, options: ScannerMessageFilterOptions): boolean {
  if (options.targetLabel && !(record.labels ?? []).includes(options.targetLabel)) return false
  if (options.hasAttachment === true && record.attachments.length === 0) return false
  if (options.hasAttachment === false && record.attachments.length > 0) return false
  return true
}

function headerValue(headers: Array<{ name?: string; value?: string }>, name: string): string {
  return headers.find((header) => header.name?.toLowerCase() === name)?.value ?? ''
}

async function getJson<T>(fetcher: GmailRestFetcher, url: string, token: string): Promise<T> {
  const response = await fetcher(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error(`Gmail REST GET failed with status ${response.status}`)
  return response.json() as Promise<T>
}

function buildGmailUrl(base_url: string, user_id: string, suffix: string, params: Record<string, string | string[]>): string {
  const url = new URL(`${base_url}/gmail/v1/users/${encodeURIComponent(user_id)}${suffix}`)
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item)
    } else {
      url.searchParams.set(key, value)
    }
  }
  return url.toString()
}

async function writeDownloadedAttachment(input: { dir: string; messageId: string; attachmentId: string; filename: string; bytes: Buffer }): Promise<string> {
  await mkdir(input.dir, { recursive: true, mode: 0o700 })
  const safe_name = sanitizePathSegment(`${input.messageId}-${input.attachmentId}-${basename(input.filename)}`)
  const local_path = join(input.dir, safe_name)
  await writeFile(local_path, input.bytes, { mode: 0o600 })
  return local_path
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').slice(0, 180) || 'scanner-attachment'
}

function decodeBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  return Buffer.from(padded, 'base64')
}

function hashBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

const defaultGmailRestFetcher: GmailRestFetcher = async (url, init) => fetch(url, init)
