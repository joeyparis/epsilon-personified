import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CapabilityGateway } from '../capabilities/gateway.js'
import {
  ChurchScannerClarificationWriter,
  ConfirmedChurchScannerClarificationWriter,
  createJsonFileScannerIdempotencyStore,
  createMemoryScannerAuditSink,
  createMemoryScannerIdempotencyStore,
  createMemoryScannerMessageSource,
  createScannerWorker,
  findScannerMessages,
  processFoundScannerMessages,
  type GmailScannerMessageRecord,
  type ScannerAuditEntry,
} from './intake.js'

const PRIVATE_ATTACHMENT_TEXT = 'Invoice 12345 total $98.76 private account alpha beta gamma'

describe('scanner intake', () => {
  it('classifies and summarizes a text/plain RICOH-like scan without Church clarification', async () => {
    const audit_sink = createMemoryScannerAuditSink()
    const store = createMemoryScannerIdempotencyStore()
    const worker = createScannerWorker({ idempotencyStore: store, auditSink: audit_sink })

    const result = await worker.processMessage(createTextMessage())
    await worker.commitMessage(result)

    expect(result.trigger.source).toBe('gmail')
    expect(result.trigger.kind).toBe('ricoh_scan_message')
    expect(result.trigger.attachments).toHaveLength(1)
    expect(result.attachments[0]?.status).toBe('processed')
    expect(result.attachments[0]?.classification?.label).toBe('financial_document')
    expect(result.attachments[0]?.classification?.needsClarification).toBe(false)
    expect(result.attachments[0]?.classification?.summary).toContain('financial document')
    expect(await store.list()).toHaveLength(1)
    expect(JSON.stringify(await store.list())).not.toContain(PRIVATE_ATTACHMENT_TEXT)
    expect(audit_sink.lines.join('\n')).not.toContain(PRIVATE_ATTACHMENT_TEXT)
  })

  it('does not send raw extracted text across the audit sink boundary', async () => {
    const captured_entries: ScannerAuditEntry[] = []
    const worker = createScannerWorker({
      idempotencyStore: createMemoryScannerIdempotencyStore(),
      auditSink: {
        append: async (entry) => {
          captured_entries.push(entry)
        },
      },
    })

    const result = await worker.processMessage(createTextMessage())
    await worker.commitMessage(result)
    const captured_json = JSON.stringify(captured_entries)

    expect(captured_entries).toHaveLength(1)
    expect(captured_json).toContain('scanner.attachment.processed')
    expect(captured_json).not.toContain(PRIVATE_ATTACHMENT_TEXT)
    expect(captured_json).not.toContain('attachmentText')
    expect(captured_json).not.toContain('extractedText')
  })


  it('writes summary and question-only Church inbox clarification for low-confidence text', async () => {
    const church_root = await createChurchFixture()
    const gateway = new CapabilityGateway({ churchRoot: church_root })
    const worker = createScannerWorker({
      idempotencyStore: createMemoryScannerIdempotencyStore(),
      churchWriter: new ConfirmedChurchScannerClarificationWriter(gateway),
    })

    const message_record = createTextMessage({
      subject: 'Fwd: docs',
      attachment_text: 'private unlabeled scan content for Joey only',
    })
    const result = await worker.processMessage(message_record)
    const inbox = await readFile(join(church_root, 'inbox.md'), 'utf8')

    expect(result.attachments[0]?.classification?.needsClarification).toBe(true)
    expect(result.attachments[0]?.clarification?.execution?.ok).toBe(true)
    expect(inbox).toContain('Scanner clarification needed:')
    expect(inbox).toContain('Questions:')
    expect(inbox).not.toContain('private unlabeled scan content')
  })

  it('skips duplicate processing for the same message attachment extractor and content hash', async () => {
    const church_root = await createChurchFixture()
    const gateway = new CapabilityGateway({ churchRoot: church_root })
    const audit_sink = createMemoryScannerAuditSink()
    const worker = createScannerWorker({
      idempotencyStore: createMemoryScannerIdempotencyStore(),
      churchWriter: new ConfirmedChurchScannerClarificationWriter(gateway),
      auditSink: audit_sink,
    })
    const message_record = createTextMessage({ subject: 'Unclear', attachment_text: 'unlabeled private scan text' })

    const first_result = await worker.processMessage(message_record)
    await worker.commitMessage(first_result)
    const second_result = await worker.processMessage(message_record)
    const inbox = await readFile(join(church_root, 'inbox.md'), 'utf8')

    expect(first_result.attachments[0]?.status).toBe('processed')
    expect(second_result.attachments[0]?.status).toBe('skipped_duplicate')
    expect(inbox.match(/Scanner clarification needed:/g)).toHaveLength(1)
    expect(audit_sink.lines.some((line) => line.includes('skipped_duplicate'))).toBe(true)
  })

  it('asks for clarification for PDF and image attachments when no extractor is injected', async () => {
    const church_root = await createChurchFixture()
    const gateway = new CapabilityGateway({ churchRoot: church_root })
    const worker = createScannerWorker({
      idempotencyStore: createMemoryScannerIdempotencyStore(),
      churchWriter: new ConfirmedChurchScannerClarificationWriter(gateway),
    })
    const result = await worker.processMessage({
      id: 'gmail-pdf-1',
      from: 'scanner@ricoh.local',
      subject: 'RICOH scan',
      receivedAt: '2026-06-16T12:00:00.000Z',
      scannerEmailBody: 'body must not persist',
      attachments: [
        { id: 'pdf-1', filename: 'scan.pdf', mimeType: 'application/pdf', contentBase64: 'JVBERi0x', sizeBytes: 8 },
        { id: 'image-1', filename: 'scan.png', mimeType: 'image/png', contentBase64: 'iVBORw0KGgo=', sizeBytes: 8 },
      ],
    })
    const inbox = await readFile(join(church_root, 'inbox.md'), 'utf8')

    expect(result.attachments.map((attachment_result) => attachment_result.extraction?.status)).toEqual(['needs_ocr', 'needs_ocr'])
    expect(result.attachments.every((attachment_result) => attachment_result.classification?.needsClarification)).toBe(true)
    expect(inbox.match(/OCR is needed/g)).toHaveLength(2)
    expect(inbox).not.toContain('body must not persist')
    expect(inbox).not.toContain('JVBERi0x')
  })

  it('keeps production Church writer at prepared-manifest only', async () => {
    const church_root = await createChurchFixture()
    const gateway = new CapabilityGateway({ churchRoot: church_root })
    const worker = createScannerWorker({
      idempotencyStore: createMemoryScannerIdempotencyStore(),
      churchWriter: new ChurchScannerClarificationWriter(gateway),
    })

    const result = await worker.processMessage(createTextMessage({ subject: 'Unknown', attachment_text: 'private uncertain scan' }))
    const inbox = await readFile(join(church_root, 'inbox.md'), 'utf8')

    expect(result.attachments[0]?.clarification?.prepared).toBe(true)
    expect(result.attachments[0]?.clarification?.manifest?.action_type).toBe('church_inbox_capture')
    expect(inbox).toBe('')
  })

  it('serializes idempotency state without raw scanner text', async () => {
    const state_path = join(await mkdtemp(join(tmpdir(), 'epsilon-scanner-state-')), 'state.json')
    const worker = createScannerWorker({ idempotencyStore: createJsonFileScannerIdempotencyStore(state_path) })

    const result = await worker.processMessage(createTextMessage())
    await worker.commitMessage(result)
    const state = await readFile(state_path, 'utf8')

    expect(state).toContain('financial_document')
    expect(state).not.toContain(PRIVATE_ATTACHMENT_TEXT)
    expect(state).not.toContain('scannerEmailBody')
  })

  it('finds only matching scanner email records by label sender subject attachment and max results', async () => {
    const matching_first = createTextMessage({ id: 'match-1', labels: ['scanner/intake'], subject: 'RICOH invoice scan' })
    const matching_second = createTextMessage({ id: 'match-2', labels: ['scanner/intake'], subject: 'RICOH receipt scan' })
    const message_source = createMemoryScannerMessageSource([
      createTextMessage({ id: 'wrong-label', labels: ['inbox'], subject: 'RICOH invoice scan' }),
      createTextMessage({ id: 'wrong-sender', from: 'alerts@example.com', labels: ['scanner/intake'], subject: 'RICOH invoice scan' }),
      createTextMessage({ id: 'wrong-subject', labels: ['scanner/intake'], subject: 'Printer status' }),
      createTextMessage({ id: 'no-attachment', labels: ['scanner/intake'], subject: 'RICOH invoice scan', attachments: [] }),
      matching_first,
      matching_second,
    ])

    const matches = await findScannerMessages(message_source, {
      targetLabel: 'scanner/intake',
      sender: 'scanner@ricoh.local',
      subject: /RICOH .* scan/,
      hasAttachment: true,
      maxResults: 1,
    })

    expect(matches.map((message_record) => message_record.id)).toEqual(['match-1'])
  })

  it('processes only found RICOH labeled scanner emails without leaking ignored raw text', async () => {
    const audit_sink = createMemoryScannerAuditSink()
    const store = createMemoryScannerIdempotencyStore()
    const worker = createScannerWorker({ idempotencyStore: store, auditSink: audit_sink })
    const message_source = createMemoryScannerMessageSource([
      createTextMessage({
        id: 'ignored-private',
        from: 'friend@example.com',
        labels: ['personal'],
        subject: 'hello',
        attachment_text: 'ignored private attachment text must not appear',
      }),
      createTextMessage({
        id: 'processed-ricoh',
        labels: ['scanner/intake'],
        subject: 'RICOH invoice scan',
        attachment_text: PRIVATE_ATTACHMENT_TEXT,
      }),
    ])

    const results = await processFoundScannerMessages({
      source: message_source,
      worker,
      options: {
        targetLabel: 'scanner/intake',
        sender: /ricoh\.local$/,
        subject: 'RICOH',
        hasAttachment: true,
      },
    })
    const state = JSON.stringify(await store.list())
    const audit_lines = audit_sink.lines.join('\n')

    expect(results).toHaveLength(1)
    expect(results[0]?.trigger.contextRefs).toContain('gmail:message:processed-ricoh')
    expect(results[0]?.attachments[0]?.classification?.label).toBe('financial_document')
    expect(state).toContain('processed-ricoh')
    expect(state).not.toContain(PRIVATE_ATTACHMENT_TEXT)
    expect(state).not.toContain('ignored private attachment text')
    expect(audit_lines).not.toContain(PRIVATE_ATTACHMENT_TEXT)
    expect(audit_lines).not.toContain('ignored private attachment text')
  })
})

function createTextMessage(input: {
  id?: string
  from?: string
  labels?: string[]
  subject?: string
  attachment_text?: string
  attachments?: GmailScannerMessageRecord['attachments']
} = {}): GmailScannerMessageRecord {
  return {
    id: input.id ?? 'gmail-message-1',
    threadId: 'gmail-thread-1',
    from: input.from ?? 'scanner@ricoh.local',
    subject: input.subject ?? 'RICOH scan invoice',
    labels: input.labels ?? ['scanner/intake'],
    receivedAt: '2026-06-16T12:00:00.000Z',
    scannerEmailBody: 'Private scanner email body should never persist.',
    attachments: input.attachments ?? [{
      id: 'attachment-1',
      filename: 'ricoh-scan.txt',
      mimeType: 'text/plain',
      text: input.attachment_text ?? PRIVATE_ATTACHMENT_TEXT,
    }],
  }
}

async function createChurchFixture(): Promise<string> {
  const church_root = await mkdtemp(join(tmpdir(), 'epsilon-scanner-church-'))
  await mkdir(church_root, { recursive: true })
  await writeFile(join(church_root, 'inbox.md'), '')
  return church_root
}
