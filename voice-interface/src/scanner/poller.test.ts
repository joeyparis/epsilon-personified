import { describe, expect, it } from 'vitest'
import type { DelegationJobRequest, DelegationSubmitResult } from '../shared/delegation-types.js'
import { createMemoryScannerIdempotencyStore, createMemoryScannerMessageSource, createScannerWorker, type GmailScannerMessageRecord } from './intake.js'
import { runScannerPollOnce, startScannerPollLoop, type ScannerPollTimer } from './poller.js'
import type { ScannerDelegationGateway } from './opencode-handoff.js'

describe('scanner poller', () => {
  it('polls matching Gmail source records, processes scans, and hands off once', async () => {
    const requests: DelegationJobRequest[] = []
    const gateway = createGateway(requests)
    const source = createMemoryScannerMessageSource([createMessage('gmail-1')])
    const worker = createScannerWorker({ idempotencyStore: createMemoryScannerIdempotencyStore() })

    const result = await runScannerPollOnce({
      source,
      worker,
      handoff: { gateway },
      filters: { targetLabel: 'scanner/intake', hasAttachment: true, subject: /ricoh/i },
    })

    expect(result.matchedCount).toBe(1)
    expect(result.processedCount).toBe(1)
    expect(result.handoffCount).toBe(1)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.promptSummary).toContain('gmail:message:gmail-1')
  })

  it('does not hand off duplicate idempotent skips on later polls', async () => {
    const requests: DelegationJobRequest[] = []
    const gateway = createGateway(requests)
    const source = createMemoryScannerMessageSource([createMessage('gmail-1')])
    const worker = createScannerWorker({ idempotencyStore: createMemoryScannerIdempotencyStore() })
    const options = { source, worker, handoff: { gateway }, filters: { targetLabel: 'scanner/intake', hasAttachment: true } }

    await runScannerPollOnce(options)
    const second_result = await runScannerPollOnce(options)

    expect(second_result.matchedCount).toBe(1)
    expect(second_result.processedCount).toBe(0)
    expect(second_result.handoffCount).toBe(0)
    expect(requests).toHaveLength(1)
  })



  it('retries a processed attachment when OpenCode handoff fails before commit', async () => {
    const requests: DelegationJobRequest[] = []
    let attempts = 0
    const gateway: ScannerDelegationGateway = {
      delegate: async (request) => {
        attempts += 1
        requests.push(request)
        if (attempts === 1) throw new Error('OpenCode unavailable after processing')
        return { accepted: true, job: createJob(request), queue: createQueue() }
      },
    }
    const source = createMemoryScannerMessageSource([createMessage('gmail-retry')])
    const worker = createScannerWorker({ idempotencyStore: createMemoryScannerIdempotencyStore() })
    const options = { source, worker, handoff: { gateway }, filters: { targetLabel: 'scanner/intake', hasAttachment: true } }

    const first_result = await runScannerPollOnce(options)
    const second_result = await runScannerPollOnce(options)
    const third_result = await runScannerPollOnce(options)

    expect(first_result.errors).toHaveLength(1)
    expect(second_result.handoffCount).toBe(1)
    expect(third_result.handoffCount).toBe(0)
    expect(requests).toHaveLength(2)
  })


  it('redacts errors and continues unless configured to throw', async () => {
    const source = { searchScannerMessages: async () => { throw new Error('Bearer sk-live-secret-value failed') } }
    const worker = createScannerWorker({ idempotencyStore: createMemoryScannerIdempotencyStore() })

    const result = await runScannerPollOnce({ source, worker, handoff: { gateway: createGateway([]) } })

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).not.toContain('sk-live-secret-value')
  })

  it('schedules loop ticks through an injectable timer and supports stop', async () => {
    const callbacks: Array<() => void> = []
    const cleared_handles: unknown[] = []
    const timer: ScannerPollTimer = {
      setTimeout: (callback) => {
        callbacks.push(callback)
        return callbacks.length
      },
      clearTimeout: (handle) => {
        cleared_handles.push(handle)
      },
    }
    const loop = startScannerPollLoop({
      source: createMemoryScannerMessageSource([]),
      worker: createScannerWorker({ idempotencyStore: createMemoryScannerIdempotencyStore() }),
      handoff: { gateway: createGateway([]) },
      intervalMs: 25,
      timer,
    })

    expect(callbacks).toHaveLength(1)
    await loop.runNow()
    loop.stop()

    expect(cleared_handles).toEqual([1])
  })
})

function createMessage(id: string): GmailScannerMessageRecord {
  return {
    id,
    threadId: 'thread-1',
    from: 'scanner@ricoh.local',
    subject: 'RICOH scan invoice',
    labels: ['scanner/intake'],
    receivedAt: '2026-06-17T00:00:00.000Z',
    scannerEmailBody: 'private body',
    attachments: [{ id: 'attach-1', filename: 'scan.txt', mimeType: 'text/plain', text: 'Invoice total $10 private text' }],
  }
}

function createGateway(requests: DelegationJobRequest[]): ScannerDelegationGateway {
  return {
    delegate: async (request) => {
      requests.push(request)
      return { accepted: true, job: createJob(request), queue: createQueue() }
    },
  }
}

function createJob(request: DelegationJobRequest): DelegationSubmitResult['job'] {
  return {
    id: `job-${requestsKey(request)}`,
    parentVoiceTurnId: request.parentVoiceTurnId,
    promptSummary: request.promptSummary,
    model: request.model,
    profile: 'standard',
    status: 'queued',
    createdAt: '2026-06-17T00:00:00.000Z',
    timeoutMs: request.timeoutMs ?? 1,
    costBudgetCents: request.costBudgetCents,
    cancellationCommand: { kind: 'process-signal', signal: 'SIGTERM', reason: 'test' },
    endpoint: 'http://127.0.0.1:4097',
  }
}

function createQueue(): DelegationSubmitResult['queue'] {
  return { jobs: [], activeCount: 0, queuedCount: 0, activePremiumCount: 0, maxTotalConcurrency: 1, maxPremiumConcurrency: 0, maxTotalJobs: 1, degraded: false, endpoint: 'http://127.0.0.1:4097' }
}

function requestsKey(request: DelegationJobRequest): string {
  return request.parentVoiceTurnId.replace(/[^a-z0-9]/gi, '-')
}
