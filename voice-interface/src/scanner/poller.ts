import { safeLogLine } from '../shared/log-redaction.js'
import type { ScannerOpenCodeHandoffResult } from './opencode-handoff.js'
import { handoffScannerResultToOpenCode, type ScannerOpenCodeHandoffOptions } from './opencode-handoff.js'
import { findScannerMessages, type ScannerAuditSink, type ScannerMessageFilterOptions, type ScannerMessageProcessResult, type ScannerMessageSource, type ScannerWorker } from './intake.js'

export interface ScannerPollerOptions {
  source: ScannerMessageSource
  worker: ScannerWorker
  handoff: ScannerOpenCodeHandoffOptions
  filters?: ScannerMessageFilterOptions
  auditSink?: ScannerAuditSink
  throwOnError?: boolean
}

export interface ScannerPollOnceResult {
  matchedCount: number
  processedCount: number
  handoffCount: number
  handoffs: ScannerOpenCodeHandoffResult[]
  errors: string[]
}

export interface ScannerPollLoopOptions extends ScannerPollerOptions {
  intervalMs: number
  timer?: ScannerPollTimer
}

export interface ScannerPollTimer {
  setTimeout: (callback: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
}

export interface ScannerPollLoopHandle {
  stop: () => void
  runNow: () => Promise<ScannerPollOnceResult>
}

export async function runScannerPollOnce(options: ScannerPollerOptions): Promise<ScannerPollOnceResult> {
  const handoffs: ScannerOpenCodeHandoffResult[] = []
  const errors: string[] = []
  let matched_count = 0
  let processed_count = 0

  try {
    const message_records = await findScannerMessages(options.source, options.filters)
    matched_count = message_records.length
    for (const message_record of message_records) {
      const process_result = await options.worker.processMessage(message_record)
      if (!hasProcessedAttachment(process_result)) continue
      processed_count += 1
      handoffs.push(await handoffScannerResultToOpenCode(process_result, options.handoff))
      await options.worker.commitMessage(process_result)
    }
  } catch (error) {
    const redacted_error = redactScannerError(error)
    errors.push(redacted_error)
    await options.auditSink?.append({
      event: 'scanner.attachment.skipped_duplicate',
      messageId: 'poller-error',
      attachmentId: 'poller-error',
      contentHash: redacted_error,
      extractorVersion: 'poller.v1',
    })
    if (options.throwOnError) throw error
  }

  return { matchedCount: matched_count, processedCount: processed_count, handoffCount: handoffs.length, handoffs, errors }
}

export function startScannerPollLoop(options: ScannerPollLoopOptions): ScannerPollLoopHandle {
  const timer = options.timer ?? real_timer
  let stopped = false
  let handle: unknown

  const run_now = async () => runScannerPollOnce(options)
  const schedule = () => {
    if (stopped) return
    handle = timer.setTimeout(() => {
      void run_now().finally(schedule)
    }, options.intervalMs)
  }
  schedule()

  return {
    stop: () => {
      stopped = true
      if (handle) timer.clearTimeout(handle)
    },
    runNow: run_now,
  }
}

export function redactScannerError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return safeLogLine('scanner-poller-error', { error: message })
}

function hasProcessedAttachment(process_result: ScannerMessageProcessResult): boolean {
  return process_result.attachments.some((attachment_result) => attachment_result.status === 'processed')
}

const real_timer: ScannerPollTimer = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}
