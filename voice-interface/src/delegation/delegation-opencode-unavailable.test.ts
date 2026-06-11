import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DelegationGateway } from './gateway.js'
import type { ProcessRunner, WorkerProcessResult } from './process-runner.js'

const UNAVAILABLE_EVIDENCE = '/Users/joey/Church/.omo/evidence/task-7-opencode-unavailable.txt'

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

describe('delegation-opencode-unavailable', () => {
  it('reports degraded state without spawning an OpenCode process', async () => {
    const runner = new RecordingRunner()
    const states: string[] = []
    const gateway = new DelegationGateway({
      endpoint: 'http://localhost:4097',
      processRunner: runner,
      healthChecker: { isAvailable: async () => false },
      idFactory: () => 'unavailable-test',
      setStatus: (state, message, detail) => { states.push(`${state}:${message}:${detail ?? ''}`) },
    })

    const result = await gateway.delegate({
      parentVoiceTurnId: 'turn-unavailable',
      promptSummary: 'Summarize whether OpenCode delegation is available for a read-only research task.',
      model: 'opencode/glm-5.1',
      profile: 'standard',
      timeoutMs: 100,
      costBudgetCents: 25,
    })

    expect(result.accepted).toBe(false)
    expect(result.job.status).toBe('degraded_unavailable')
    expect(result.job.degradedReason).toContain('http://localhost:4097')
    expect(result.job.finalSummary).toContain('no worker process was spawned')
    expect(runner.starts).toBe(0)
    expect(states.some((state) => state.startsWith('degraded:OpenCode delegation unavailable.'))).toBe(true)

    await writeEvidence(UNAVAILABLE_EVIDENCE, [
      'task: task-7-opencode-unavailable',
      `job: ${result.job.id}`,
      `status: ${result.job.status}`,
      `endpoint: ${result.job.endpoint}`,
      `process_starts: ${runner.starts}`,
      `message: ${result.job.finalSummary}`,
    ].join('\n'))
  })
})
