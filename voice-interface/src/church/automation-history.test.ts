import { describe, expect, it } from 'vitest'
import { formatAutomationHistoryEntry } from './automation-history.js'

describe('automation history', () => {
  it('formats high-level automation entries without leaking secrets or tax IDs', () => {
    const entry = formatAutomationHistoryEntry({
      occurredAt: '2026-06-18T02:07:18.000Z',
      source: 'gmail',
      kind: 'ricoh_scan_message',
      title: 'FW: Scanned Documents - South Office sk-live-secret-value',
      actor: 'Joey Paris <joey@example.com> Bearer secret-token-value',
      contextRefs: ['gmail:message:19ed6f992e572d62'],
      status: 'opencode_completed',
      summary: 'Processed scan for MolaMola Industries LLC with EIN 41-5359990.',
      openCodeJobId: 'delegation-1',
      openCodeSummary: 'Setup chatter. Automation history summary: Federal EIN 41-5359990 was visible. Account 123456789012 should be stored elsewhere.',
      attachments: [{
        filename: '20260617150509525.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 443381,
        extractionStatus: 'needs_ocr',
        classificationLabel: 'scan_document',
        confidence: 0.42,
        needsClarification: true,
      }],
      attentionItems: ['OCR is needed before Epsilon can read this scan.'],
    })

    expect(entry).toContain('FW: Scanned Documents - South Office')
    expect(entry).toContain('opencode_completed')
    expect(entry).toContain('[REDACTED]')
    expect(entry).toContain('[REDACTED_TAX_ID]')
    expect(entry).toContain('[REDACTED_NUMBER]')
    expect(entry).not.toContain('Setup chatter')
    expect(entry).not.toContain('sk-live-secret-value')
    expect(entry).not.toContain('41-5359990')
    expect(entry).not.toContain('123456789012')
    expect(entry).not.toContain('20260617150509525.pdf')
  })

  it('omits OpenCode final summary text when the automation summary marker is missing', () => {
    const entry = formatAutomationHistoryEntry({
      occurredAt: '2026-06-18T02:07:18.000Z',
      source: 'gmail',
      kind: 'ricoh_scan_message',
      title: 'FW: Scanned Documents - South Office',
      contextRefs: ['gmail:message:19ed6f992e572d62'],
      status: 'opencode_completed',
      summary: 'Processed 1 automated attachment.',
      openCodeSummary: 'The model accidentally included private OCR text that should not be persisted.',
      attachments: [],
    })

    expect(entry).toContain('Processed 1 automated attachment.')
    expect(entry).not.toContain('OpenCode result:')
    expect(entry).not.toContain('private OCR text')
  })
})
