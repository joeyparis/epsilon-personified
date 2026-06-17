import { describe, expect, it } from 'vitest'
import { createGmailRestScannerMessageSource, DEFAULT_GMAIL_SCANNER_QUERY, type GmailRestFetcher } from './gmail-rest-source.js'

describe('gmail REST scanner source', () => {
  it('uses GET-only Gmail metadata calls and maps attachment metadata without bodies', async () => {
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
    expect(new URL(calls[0]?.url ?? '').searchParams.get('q')).toBe(DEFAULT_GMAIL_SCANNER_QUERY)
    expect(calls[1]?.url).toContain('format=full')
    expect(records[0]?.attachments).toEqual([{ id: 'attach-1', filename: 'scan.pdf', mimeType: 'application/pdf', sizeBytes: 12345 }])
    expect(JSON.stringify(records)).not.toContain('MUST_NOT_MAP')
    expect(JSON.stringify(records)).not.toContain('scannerEmailBody')
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
})

function jsonResponse(value: unknown) {
  return { ok: true, status: 200, json: async () => value }
}
