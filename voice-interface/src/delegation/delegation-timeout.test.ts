import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DelegationGateway } from './gateway.js'
import type { ProcessRunner, WorkerProcessResult } from './process-runner.js'

const TIMEOUT_EVIDENCE = '/Users/joey/Church/.omo/evidence/task-7-delegation-timeout.json'

class RecordingRunner implements ProcessRunner {
  starts = 0
  cancellations = 0
  readonly completedResults: Promise<WorkerProcessResult>[] = []

  constructor(private readonly mode: 'never' | 'success' = 'success') {}

  run() {
    this.starts += 1
    let resolveResult: (result: WorkerProcessResult) => void = () => undefined
    const completed = this.mode === 'never'
      ? new Promise<WorkerProcessResult>((resolve) => { resolveResult = resolve })
      : Promise.resolve({ exitCode: 0, stdout: 'Finished compact delegated work.', stderr: '' })
    this.completedResults.push(completed)

    return {
      completed,
      cancel: () => {
        this.cancellations += 1
        if (this.mode === 'never') resolveResult({ exitCode: null, stdout: '', stderr: 'cancelled' })
      },
    }
  }
}

async function writeEvidence(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${content.trimEnd()}\n`, 'utf8')
}

describe('delegation-timeout', () => {
  it('marks a long-running worker timed_out and invokes cancellation exactly once', async () => {
    const runner = new RecordingRunner('never')
    const events: string[] = []
    const gateway = new DelegationGateway({
      endpoint: 'http://localhost:4097',
      processRunner: runner,
      healthChecker: { isAvailable: async () => true },
      idFactory: () => 'timeout-test',
      setStatus: (state, message) => { events.push(`${state}:${message}`) },
      publishEvent: (event) => { events.push(`${event.type}:${event.payload.jobId}`) },
    })

    const result = await gateway.delegate({
      parentVoiceTurnId: 'turn-timeout',
      promptSummary: 'Read-only summary request that should time out in the deterministic test runner.',
      model: 'claude-opus-4-6',
      profile: 'premium',
      timeoutMs: 5,
      costBudgetCents: 50,
    })

    expect(result.accepted).toBe(true)
    expect(runner.starts).toBe(1)
    await new Promise((resolve) => setTimeout(resolve, 25))
    const job = gateway.getJob(result.job.id)

    expect(job?.status).toBe('timed_out')
    expect(job?.finalSummary).toContain('cancellation was invoked once')
    expect(runner.starts).toBe(1)
    expect(runner.cancellations).toBe(1)
    expect(gateway.getQueueSnapshot().activePremiumCount).toBe(0)

    await writeEvidence(TIMEOUT_EVIDENCE, JSON.stringify({
      task: 'task-7-delegation-timeout',
      job_id: result.job.id,
      status: job?.status,
      starts: runner.starts,
      cancellations: runner.cancellations,
      cancellation_command: job?.cancellationCommand,
      final_summary: job?.finalSummary,
      events,
      pass: job?.status === 'timed_out' && runner.starts === 1 && runner.cancellations === 1,
    }, null, 2))
  })

  it('caps total delegated jobs and keeps one premium job active', async () => {
    const runner = new RecordingRunner('never')
    const gateway = new DelegationGateway({
      processRunner: runner,
      healthChecker: { isAvailable: async () => true },
      idFactory: () => crypto.randomUUID(),
      totalConcurrency: 2,
      maxTotalJobs: 2,
    })

    const first = await gateway.delegate({ parentVoiceTurnId: 'turn-1', promptSummary: 'First premium summary.', model: 'claude-opus-4-6', profile: 'premium', timeoutMs: 10_000, costBudgetCents: 50 })
    const second = await gateway.delegate({ parentVoiceTurnId: 'turn-2', promptSummary: 'Second premium summary.', model: 'claude-opus-4-6', profile: 'premium', timeoutMs: 10_000, costBudgetCents: 50 })
    const third = await gateway.delegate({ parentVoiceTurnId: 'turn-3', promptSummary: 'Third standard summary.', model: 'opencode/glm-5.1', profile: 'standard', timeoutMs: 10_000, costBudgetCents: 50 })

    expect(first.job.status).toBe('running')
    expect(second.job.status).toBe('queued')
    expect(third.accepted).toBe(false)
    expect(third.job.status).toBe('blocked_by_cost_cap')
    expect(gateway.getQueueSnapshot().activePremiumCount).toBe(1)

    await gateway.cancel(first.job.id)
    await gateway.cancel(second.job.id)
  })
})
