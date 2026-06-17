import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createGmailRestScannerMessageSource, DEFAULT_GMAIL_SCANNER_QUERY, type GmailRestFetcher } from './gmail-rest-source.js'

describe('gmail REST scanner source', () => {
  it('uses GET-only Gmail metadata calls and maps attachment metadata without bodies when no download dir is configured', async () => {
    const calls: Array<{ url: string; method: string }> = []
    const fetcher: GmailRestFetcher = async (url, init) => {
      calls.push({ url, method: init.method })
      if (url.includes('/messages?')) {
        return jsonResponse({ messages: [{ id: 'gmail-1', threadId: 'thread-1' }] })
      }
      return jsonResponse({
        id: 'gmail-1',
        threadId: 'thread-1',
        labelIds: ['scanner/intake', 'INBOX'],
        internalDate: '1781712000000',
        payload: {
          headers: [
            { name: 'From', value: 'scanner@ricoh.local' },
            { name: 'Subject', value: 'RICOH scan invoice' },
            { name: 'Date', value: 'Wed, 17 Jun 2026 00:00:00 +0000' },
          ],
          parts: [{ filename: 'scan.pdf', mimeType: 'application/pdf', body: { attachmentId: 'attach-1', size: 12345, data: 'MUST_NOT_MAP' } }],
        },
      })
    }
    const source = createGmailRestScannerMessageSource({ accessTokenProvider: async () => 'token-secret', fetcher })

    const records = await source.searchScannerMessages({ targetLabel: 'scanner/intake', hasAttachment: true, maxResults: 3 })

    expect(records).toHaveLength(1)
    expect(calls.every((call) => call.method === 'GET')).toBe(true)
    expect(calls).toHaveLength(2)
    expect(new URL(calls[0]?.url ?? '').searchParams.get('q')).toBe(DEFAULT_GMAIL_SCANNER_QUERY)
    expect(calls[1]?.url).toContain('format=full')
    expect(records[0]?.attachments).toEqual([{ id: 'attach-1', filename: 'scan.pdf', mimeType: 'application/pdf', sizeBytes: 12345 }])
    expect(JSON.stringify(records)).not.toContain('MUST_NOT_MAP')
    expect(JSON.stringify(records)).not.toContain('scannerEmailBody')
  })

  it('downloads attachment bodies to private local files when a download dir is configured', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'epsilon-scanner-download-'))
    const calls: Array<{ url: string; method: string }> = []
    const downloaded_bytes = Buffer.from('PDF bytes for Joey')
    const fetcher: GmailRestFetcher = async (url, init) => {
      calls.push({ url, method: init.method })
      if (url.includes('/messages?')) return jsonResponse({ messages: [{ id: 'gmail/unsafe', threadId: 'thread-1' }] })
      if (url.includes('/attachments/')) return jsonResponse({ data: downloaded_bytes.toString('base64url'), size: downloaded_bytes.byteLength })
      return jsonResponse({
        id: 'gmail/unsafe',
        labelIds: ['scanner/intake'],
        payload: {
          headers: [{ name: 'From', value: 'scanner@ricoh.local' }, { name: 'Subject', value: 'RICOH scan' }],
          parts: [{ filename: '../scan secret.pdf', mimeType: 'application/pdf', body: { attachmentId: 'attach/unsafe', size: 999, data: 'INLINE_MUST_STAY_IGNORED' } }],
        },
      })
    }
    const source = createGmailRestScannerMessageSource({ accessTokenProvider: async () => 'token', fetcher, attachmentDownloadDir: dir })

    const records = await source.searchScannerMessages({ targetLabel: 'scanner/intake', hasAttachment: true })

    const attachment = records[0]?.attachments[0]
    expect(calls.map((call) => new URL(call.url).pathname)).toContain('/gmail/v1/users/me/messages/gmail%2Funsafe/attachments/attach%2Funsafe')
    expect(attachment?.localPath).toMatch(new RegExp(`^${escapeRegExp(dir)}/`))
    expect(attachment?.localPath).not.toContain('..')
    expect(attachment?.sizeBytes).toBe(downloaded_bytes.byteLength)
    expect(attachment?.contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(await readFile(attachment?.localPath ?? '')).toEqual(downloaded_bytes)
    expect(JSON.stringify(records)).not.toContain('INLINE_MUST_STAY_IGNORED')
  })

  it('supports a custom default query and local target-label filtering', async () => {
    const fetcher: GmailRestFetcher = async (url, init) => {
      expect(init.method).toBe('GET')
      if (url.includes('/messages?')) return jsonResponse({ messages: [{ id: 'ignored' }, { id: 'matched' }] })
      return jsonResponse({
        id: url.includes('matched') ? 'matched' : 'ignored',
        labelIds: url.includes('matched') ? ['scanner/intake'] : ['other'],
        payload: {
          headers: [{ name: 'From', value: 'scanner@ricoh.local' }, { name: 'Subject', value: 'RICOH scan' }],
          parts: [{ filename: 'scan.jpg', mimeType: 'image/jpeg', body: { attachmentId: 'a1', size: 5 } }],
        },
      })
    }
    const source = createGmailRestScannerMessageSource({ accessTokenProvider: async () => 'token', fetcher, defaultQuery: 'label:custom has:attachment' })

    const records = await source.searchScannerMessages({ targetLabel: 'scanner/intake' })

    expect(records.map((record) => record.id)).toEqual(['matched'])
  })

  it('does not require a scanner label when the local target-label filter is empty', async () => {
    const fetcher: GmailRestFetcher = async (url, init) => {
      expect(init.method).toBe('GET')
      if (url.includes('/messages?')) return jsonResponse({ messages: [{ id: 'south-office-scan' }] })
      return jsonResponse({
        id: 'south-office-scan',
        labelIds: ['UNREAD', 'CATEGORY_PERSONAL', 'INBOX'],
        payload: {
          headers: [{ name: 'From', value: 'Joey Paris <joey@leadjig.com>' }, { name: 'Subject', value: 'FW: Scanned Documents - South Office' }],
          parts: [{ filename: '20260617150509525.pdf', mimeType: 'application/pdf', body: { attachmentId: 'a1', size: 7 } }],
        },
      })
    }
    const source = createGmailRestScannerMessageSource({ accessTokenProvider: async () => 'token', fetcher })

    const records = await source.searchScannerMessages({ targetLabel: '', hasAttachment: true })

    expect(records).toHaveLength(1)
    expect(records[0]?.labels).toEqual(['UNREAD', 'CATEGORY_PERSONAL', 'INBOX'])
  })
})

function jsonResponse(value: unknown) {
  return { ok: true, status: 200, json: async () => value }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
