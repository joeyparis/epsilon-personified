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

export const DEFAULT_GMAIL_SCANNER_QUERY = 'label:scanner/intake has:attachment newer_than:30d'

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
        records.push(mapGmailMessage(message_json, message.threadId))
      }

      return records.filter((record) => matchesLocalOptions(record, filter_options))
    },
  }
}

function mapGmailMessage(message: GmailMessageResponse, fallback_thread_id?: string): GmailScannerMessageRecord {
  const headers = message.payload?.headers ?? []
  const from = headerValue(headers, 'from') || 'unknown sender'
  const subject = headerValue(headers, 'subject') || '(no subject)'
  const date_header = headerValue(headers, 'date')
  const received_at = message.internalDate ? new Date(Number(message.internalDate)).toISOString() : new Date(date_header || 0).toISOString()

  return {
    id: message.id ?? 'unknown-message',
    threadId: message.threadId ?? fallback_thread_id,
    from,
    subject,
    receivedAt: received_at,
    labels: message.labelIds ?? [],
    attachments: collectAttachments(message.payload),
  }
}

function collectAttachments(payload?: GmailPayloadPart): GmailScannerAttachmentRecord[] {
  if (!payload) return []
  const attachments: GmailScannerAttachmentRecord[] = []
  const visit = (part: GmailPayloadPart) => {
    const filename = (part.filename ?? '').trim()
    const attachment_id = part.body?.attachmentId
    if (filename && attachment_id) {
      attachments.push({
        id: attachment_id,
        filename,
        mimeType: part.mimeType ?? 'application/octet-stream',
        sizeBytes: part.body?.size ?? 0,
      })
    }
    for (const child_part of part.parts ?? []) visit(child_part)
  }
  visit(payload)
  return attachments
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

const defaultGmailRestFetcher: GmailRestFetcher = async (url, init) => fetch(url, init)
