import { describe, expect, it } from 'vitest'
import type { DelegationJobRequest, DelegationSubmitResult } from '../shared/delegation-types.js'
import { buildScannerOpenCodePrompt, handoffScannerResultToOpenCode, type ScannerDelegationGateway } from './opencode-handoff.js'
import type { ScannerMessageProcessResult } from './intake.js'

const FORBIDDEN_VALUES = [
  'PRIVATE_EMAIL_BODY_SHOULD_NOT_APPEAR',
  'PRIVATE_ATTACHMENT_TEXT_SHOULD_NOT_APPEAR',
  'PRIVATE_OCR_TEXT_SHOULD_NOT_APPEAR',
  'U0VDUkVUX0JBU0U2NA==',
  'sk-live-secret-value',
]

describe('scanner OpenCode handoff', () => {
  it('builds a Church prompt with downloaded document paths and no raw scanner content or secrets', () => {
    const prompt = buildScannerOpenCodePrompt(createProcessResult())

    expect(prompt).toContain('/church Analyze and organize the scanned document(s) for Joey.')
    expect(prompt).toContain('Open the local document file path(s) listed below.')
    expect(prompt).toContain('list action items, owners, and due dates')
    expect(prompt).toContain('list questions Joey needs to answer')
    expect(prompt).toContain('Automation history summary:')
    expect(prompt).toContain('Document local path: /Users/joey/Library/Application Support/Epsilon/scanner-intake/attachments/gmail-1-attach-1-scan.pdf')
    expect(prompt).toContain('gmail:message:gmail-1')
    expect(prompt).toContain('scanner@ricoh.local')
    expect(prompt).toContain('RICOH scan invoice')
    expect(prompt).toContain('scan-[REDACTED].pdf')
    expect(prompt).toContain('application/pdf')
    for (const forbidden_value of FORBIDDEN_VALUES) expect(prompt).not.toContain(forbidden_value)
  })

  it('does not truncate Church prompts unless an explicit cap is provided', () => {
    const long_result = createProcessResult()
    long_result.attachments[0]!.classification!.unresolvedQuestions = ['tail-marker ' + 'extra scanner context '.repeat(200)]

    const full_prompt = buildScannerOpenCodePrompt(long_result)
    const capped_prompt = buildScannerOpenCodePrompt(long_result, 180)

    expect(full_prompt).toContain('tail-marker')
    expect(full_prompt).toContain('extra scanner context')
    expect(capped_prompt.length).toBeLessThanOrEqual(180)
    expect(capped_prompt.endsWith('...')).toBe(true)
  })

  it('submits the Church prompt through direct DelegationGateway mode', async () => {
    const requests: DelegationJobRequest[] = []
    const gateway: ScannerDelegationGateway = {
      delegate: async (request) => {
        requests.push(request)
        return { accepted: true, job: createJob(request), queue: createQueue() }
      },
    }

    const result = await handoffScannerResultToOpenCode(createProcessResult(), { gateway, model: 'local-standard', costBudgetCents: 5 })

    expect(result.submitted).toBe(true)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.model).toBe('local-standard')
    expect(requests[0]?.costBudgetCents).toBe(5)
    expect(requests[0]?.promptMode).toBe('direct')
    expect(requests[0]?.promptSummary).toContain('/church')
    expect(requests[0]?.promptSummary).toContain('Document local path:')
    for (const forbidden_value of FORBIDDEN_VALUES) expect(requests[0]?.promptSummary).not.toContain(forbidden_value)
  })

  it('waits for OpenCode completion when the gateway supports final job snapshots', async () => {
    const gateway: ScannerDelegationGateway = {
      delegate: async (request) => ({ accepted: true, job: createJob(request), queue: createQueue() }),
      waitForJob: async (jobId) => ({ ...createJob({ ...createProcessRequest(), parentVoiceTurnId: 'scanner:gmail:message:gmail-1' }), id: jobId, status: 'completed', finalSummary: 'Scan summarized.' }),
    }

    const result = await handoffScannerResultToOpenCode(createProcessResult(), { gateway })

    expect(result.result?.job.status).toBe('completed')
    expect(result.result?.job.finalSummary).toBe('Scan summarized.')
  })
})

function createProcessResult(): ScannerMessageProcessResult {
  return {
    trigger: {
      source: 'gmail',
      kind: 'ricoh_scan_message',
      receivedAt: '2026-06-17T00:00:00.000Z',
      actor: 'scanner@ricoh.local Bearer sk-live-secret-value',
      subject: 'RICOH scan invoice sk-live-secret-value',
      contextRefs: ['gmail:message:gmail-1', 'gmail:thread:thread-1'],
      attachments: [{ id: 'attach-1', filename: 'scan-sk-live-secret-value.pdf', mimeType: 'application/pdf', sizeBytes: 123, contentHash: 'hash-safe', localPath: '/Users/joey/Library/Application Support/Epsilon/scanner-intake/attachments/gmail-1-attach-1-scan.pdf' }],
    },
    attachments: [{
      status: 'processed',
      idempotencyKey: 'key-1',
      attachment: { id: 'attach-1', filename: 'scan-sk-live-secret-value.pdf', mimeType: 'application/pdf', sizeBytes: 123, contentHash: 'hash-safe', localPath: '/Users/joey/Library/Application Support/Epsilon/scanner-intake/attachments/gmail-1-attach-1-scan.pdf' },
      extraction: { status: 'needs_ocr', text: 'PRIVATE_ATTACHMENT_TEXT_SHOULD_NOT_APPEAR PRIVATE_OCR_TEXT_SHOULD_NOT_APPEAR U0VDUkVUX0JBU0U2NA== sk-live-secret-value', extractorVersion: 'builtin-needs-ocr.v1' },
      classification: { label: 'scan_document', confidence: 0.42, summary: 'safe summary', needsClarification: true, unresolvedQuestions: ['OCR is needed before Epsilon can read this scan. Secret sk-live-secret-value should not appear. What should be done with the document?'] },
    }],
  }
}

function createJob(request: DelegationJobRequest): DelegationSubmitResult['job'] {
  return {
    id: 'delegation-1',
    parentVoiceTurnId: request.parentVoiceTurnId,
    promptSummary: request.promptSummary,
    promptMode: request.promptMode,
    model: request.model,
    profile: request.profile ?? 'standard',
    status: 'queued',
    createdAt: '2026-06-17T00:00:00.000Z',
    timeoutMs: request.timeoutMs ?? 1,
    costBudgetCents: request.costBudgetCents,
    cancellationCommand: { kind: 'process-signal', signal: 'SIGTERM', reason: 'test' },
    endpoint: 'http://127.0.0.1:4097',
  }
}

function createProcessRequest(): DelegationJobRequest {
  return {
    parentVoiceTurnId: 'scanner:gmail:message:gmail-1',
    promptSummary: 'scan',
    model: 'openai/gpt-5.5',
    costBudgetCents: 75,
  }
}

function createQueue(): DelegationSubmitResult['queue'] {
  return { jobs: [], activeCount: 0, queuedCount: 0, activePremiumCount: 0, maxTotalConcurrency: 1, maxPremiumConcurrency: 0, maxTotalJobs: 1, degraded: false, endpoint: 'http://127.0.0.1:4097' }
}
