import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'
import { redactForLog, safeLogLine } from './log-redaction.js'

const EVIDENCE_PATH = '/Users/joey/Church/.omo/evidence/task-8-redacted-logs.txt'

async function writeEvidence(content: string) {
  await mkdir(dirname(EVIDENCE_PATH), { recursive: true })
  await writeFile(EVIDENCE_PATH, `${content.trimEnd()}\n`, 'utf8')
}

describe('log-redaction', () => {
  it('redacts fake API keys, email bodies, manifest payloads, raw transcripts, service raw responses, and scanner text', async () => {
    const unsafe = {
      apiKey: 'sk-fake-task8-redaction-key',
      emailBody: 'Hi Joey, here is a private email body that must not be logged.',
      manifest: {
        id: 'manifest-123',
        exact_diff_or_payload: 'Full manifest payload with private action details.',
      },
      rawTranscript: 'Speaker: Joey said a private transcript snippet.',
      serviceRawResponse: { inbox: ['private message body'] },
      attachmentText: 'private raw scanner attachment text',
      extractedText: 'private extracted scanner text',
      ocrText: 'private OCR scanner text',
      rawAttachment: 'raw attachment bytes',
      documentText: 'private document text',
      scannerEmailBody: 'private scanner email body',
      safeStatus: 'Cost cap reached. Using local read-only mode.',
      nested: { authorization: 'Bearer fake-provider-token-value' },
    }

    const line = safeLogLine('task-8', unsafe)
    const redacted = redactForLog(unsafe)

    expect(line).toContain('[REDACTED]')
    expect(line).toContain('Cost cap reached. Using local read-only mode.')
    expect(line).not.toContain('sk-fake-task8-redaction-key')
    expect(line).not.toContain('private email body')
    expect(line).not.toContain('Full manifest payload')
    expect(line).not.toContain('Speaker: Joey')
    expect(line).not.toContain('private message body')
    expect(line).not.toContain('private raw scanner attachment text')
    expect(line).not.toContain('private extracted scanner text')
    expect(line).not.toContain('private OCR scanner text')
    expect(line).not.toContain('raw attachment bytes')
    expect(line).not.toContain('private document text')
    expect(line).not.toContain('private scanner email body')
    expect(JSON.stringify(redacted)).not.toContain('fake-provider-token-value')

    await writeEvidence([
      'Scenario: log-redaction',
      line,
      'contains redaction marker: true',
      'raw fake API key present: false',
      'raw email body present: false',
      'raw manifest payload present: false',
      'raw transcript present: false',
      'raw service response present: false',
      'raw scanner text present: false',
    ].join('\n'))
  })
})
