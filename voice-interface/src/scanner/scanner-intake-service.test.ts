import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DelegationJobRequest, DelegationSubmitResult } from '../shared/delegation-types.js'
import { createMemoryScannerIdempotencyStore, createMemoryScannerMessageSource, createScannerWorker } from './intake.js'
import type { ScannerDelegationGateway } from './opencode-handoff.js'
import { resolveScannerIntakeServiceConfig, runScannerIntakeCli } from './scanner-intake-service.js'

describe('scanner intake service CLI', () => {
  it('resolves MOI-safe defaults without relying on global gcloud state', () => {
    const config = resolveScannerIntakeServiceConfig(['--once'], {})

    expect(config.once).toBe(true)
    expect(config.statePath).toContain('Library/Application Support/Epsilon/scanner-intake/state.json')
    expect(config.logPath).toContain('Library/Logs/epsilon-scanner-intake.log')
    expect(config.errorLogPath).toContain('Library/Logs/epsilon-scanner-intake-error.log')
    expect(config.opencodeEndpoint).toBe('http://127.0.0.1:4097')
    expect(config.targetLabel).toBe('scanner/intake')
    expect(config.opencodeModel).toBe('opencode/glm-5.1')
    expect(config.sourceMode).toBe('gmail')
    expect(config.authMode).toBe('gcloud')
    expect(config.delegatedUser).toBe('mail@joeyparis.me')
    expect(config.gmailScope).toBe('https://www.googleapis.com/auth/gmail.readonly')
    expect(config.gcloudCommand.join(' ')).toBe('/usr/bin/env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin CLOUDSDK_CONFIG=/Users/joey/.config/gcloud-personal gcloud --configuration=personal auth print-access-token')
  })


  it('resolves service-account auth config without broad Gmail scopes', () => {
    const config = resolveScannerIntakeServiceConfig(['--once'], {
      SCANNER_AUTH_MODE: 'service-account',
      SCANNER_GOOGLE_APPLICATION_CREDENTIALS: '/Users/joey/.config/Epsilon/scanner-intake/key.json',
      SCANNER_GOOGLE_DELEGATED_USER: 'mail@joeyparis.me',
    })

    expect(config.authMode).toBe('service-account')
    expect(config.serviceAccountKeyPath).toBe('/Users/joey/.config/Epsilon/scanner-intake/key.json')
    expect(config.serviceAccountEmail).toBe('moi-gmail-scanner@epsilon-490315.iam.gserviceaccount.com')
    expect(config.delegatedUser).toBe('mail@joeyparis.me')
    expect(config.gmailScope).toBe('https://www.googleapis.com/auth/gmail.readonly')
    expect(config.gmailScope).not.toContain('modify')
    expect(config.gmailScope).not.toBe('https://mail.google.com/')
  })

  it('resolves keyless IAM signJwt auth config for MOI', () => {
    const config = resolveScannerIntakeServiceConfig(['--once'], { SCANNER_AUTH_MODE: 'iam-sign-jwt' })

    expect(config.authMode).toBe('iam-sign-jwt')
    expect(config.serviceAccountEmail).toBe('moi-gmail-scanner@epsilon-490315.iam.gserviceaccount.com')
    expect(config.delegatedUser).toBe('mail@joeyparis.me')
    expect(config.gmailScope).toBe('https://www.googleapis.com/auth/gmail.readonly')
  })


  it('supports an empty source mode for launchd proof of concept without gcloud', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'epsilon-scanner-service-empty-'))
    const exit_codes: number[] = []

    await runScannerIntakeCli(['--once'], {
      SCANNER_SOURCE_MODE: 'empty',
      SCANNER_LOG_PATH: join(dir, 'scanner.log'),
      SCANNER_ERROR_LOG_PATH: join(dir, 'scanner-error.log'),
      SCANNER_STATE_PATH: join(dir, 'state.json'),
    }, { exit: (code) => exit_codes.push(code) })
    const log = await readFile(join(dir, 'scanner.log'), 'utf8')

    expect(exit_codes).toEqual([0])
    expect(log).toContain('scanner-intake-once')
    expect(log).toContain('"matchedCount":0')
  })


  it('runs --once with injected mock source and gateway without live Gmail gcloud or OpenCode', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'epsilon-scanner-service-'))
    const requests: DelegationJobRequest[] = []
    const exit_codes: number[] = []
    const source = createMemoryScannerMessageSource([{
      id: 'gmail-1',
      from: 'scanner@ricoh.local',
      subject: 'RICOH scan invoice',
      labels: ['scanner/intake'],
      receivedAt: '2026-06-17T00:00:00.000Z',
      scannerEmailBody: 'PRIVATE_EMAIL_BODY',
      attachments: [{ id: 'attach-1', filename: 'scan.txt', mimeType: 'text/plain', text: 'PRIVATE_ATTACHMENT_TEXT invoice total $10' }],
    }])
    const worker = createScannerWorker({ idempotencyStore: createMemoryScannerIdempotencyStore() })
    const gateway: ScannerDelegationGateway = {
      delegate: async (request) => {
        requests.push(request)
        return { accepted: true, job: createJob(request), queue: createQueue() }
      },
    }

    await runScannerIntakeCli(['--once'], {
      SCANNER_LOG_PATH: join(dir, 'scanner.log'),
      SCANNER_ERROR_LOG_PATH: join(dir, 'scanner-error.log'),
      SCANNER_STATE_PATH: join(dir, 'state.json'),
    }, { source, worker, gateway, exit: (code) => exit_codes.push(code) })

    const log = await readFile(join(dir, 'scanner.log'), 'utf8')
    expect(exit_codes).toEqual([0])
    expect(requests).toHaveLength(1)
    expect(log).toContain('scanner-intake-once')
    expect(log).not.toContain('PRIVATE_EMAIL_BODY')
    expect(log).not.toContain('PRIVATE_ATTACHMENT_TEXT')
    expect(requests[0]?.promptSummary).not.toContain('PRIVATE_ATTACHMENT_TEXT')
  })

  it('sets process exit code for real --once failures without injected exit callback', async () => {
    const previous_exit_code = process.exitCode
    const dir = await mkdtemp(join(tmpdir(), 'epsilon-scanner-service-error-'))
    const source = { searchScannerMessages: async () => { throw new Error('Bearer sk-live-secret-value failed') } }

    try {
      process.exitCode = undefined
      await runScannerIntakeCli(['--once'], {
        SCANNER_LOG_PATH: join(dir, 'scanner.log'),
        SCANNER_ERROR_LOG_PATH: join(dir, 'scanner-error.log'),
        SCANNER_STATE_PATH: join(dir, 'state.json'),
      }, { source, gateway: { delegate: async (request) => ({ accepted: true, job: createJob(request), queue: createQueue() }) } })
      const log = await readFile(join(dir, 'scanner.log'), 'utf8')

      expect(process.exitCode).toBe(1)
      expect(log).toContain('scanner-intake-once')
      expect(log).not.toContain('sk-live-secret-value')
    } finally {
      process.exitCode = previous_exit_code
    }
  })

})

function createJob(request: DelegationJobRequest): DelegationSubmitResult['job'] {
  return {
    id: 'job-1',
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
