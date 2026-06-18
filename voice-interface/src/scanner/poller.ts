import { safeLogLine } from '../shared/log-redaction.js'
import type { AutomationHistoryEntry, AutomationHistorySink } from '../church/automation-history.js'
import type { ScannerOpenCodeHandoffResult } from './opencode-handoff.js'
import { handoffScannerResultToOpenCode, type ScannerOpenCodeHandoffOptions } from './opencode-handoff.js'
import { findScannerMessages, type ScannerAuditSink, type ScannerMessageFilterOptions, type ScannerMessageProcessResult, type ScannerMessageSource, type ScannerWorker } from './intake.js'

export interface ScannerPollerOptions {
  source: ScannerMessageSource
  worker: ScannerWorker
  handoff: ScannerOpenCodeHandoffOptions
  filters?: ScannerMessageFilterOptions
  auditSink?: ScannerAuditSink
  automationHistorySink?: AutomationHistorySink
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
      const handoff_result = await handoffScannerResultToOpenCode(process_result, options.handoff)
      handoffs.push(handoff_result)
      await appendAutomationHistory(options.automationHistorySink, process_result, handoff_result, options.auditSink)
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

export function createScannerAutomationHistoryEntry(
  process_result: ScannerMessageProcessResult,
  handoff_result: ScannerOpenCodeHandoffResult,
): AutomationHistoryEntry {
  const processed_attachments = process_result.attachments.filter((attachment_result) => attachment_result.status === 'processed')
  const handoff_job = handoff_result.result?.job
  return {
    occurredAt: process_result.trigger.receivedAt,
    source: process_result.trigger.source,
    kind: process_result.trigger.kind,
    title: process_result.trigger.subject,
    actor: process_result.trigger.actor,
    contextRefs: process_result.trigger.contextRefs,
    status: handoff_job ? `opencode_${handoff_job.status}` : 'opencode_not_submitted',
    openCodeJobId: handoff_job?.id,
    openCodeSummary: handoff_job?.finalSummary ?? null,
    summary: summarizeAutomationHistory(process_result),
    attachments: processed_attachments.map((attachment_result) => ({
      filename: attachment_result.attachment.filename,
      mimeType: attachment_result.attachment.mimeType,
      sizeBytes: attachment_result.attachment.sizeBytes,
      extractionStatus: attachment_result.extraction?.status ?? 'unknown',
      classificationLabel: attachment_result.classification?.label ?? 'unknown',
      confidence: attachment_result.classification?.confidence,
      needsClarification: attachment_result.classification?.needsClarification,
    })),
    attentionItems: processed_attachments.flatMap((attachment_result) => attachment_result.classification?.unresolvedQuestions ?? []),
  }
}

async function appendAutomationHistory(
  automation_history_sink: AutomationHistorySink | undefined,
  process_result: ScannerMessageProcessResult,
  handoff_result: ScannerOpenCodeHandoffResult,
  audit_sink: ScannerAuditSink | undefined,
): Promise<void> {
  if (!automation_history_sink) return
  try {
    await automation_history_sink.append(createScannerAutomationHistoryEntry(process_result, handoff_result))
  } catch (error) {
    try {
      await audit_sink?.append({
        event: 'scanner.attachment.skipped_duplicate',
        messageId: process_result.trigger.contextRefs[0] ?? 'automation-history-error',
        attachmentId: 'automation-history-error',
        contentHash: redactScannerError(error),
        extractorVersion: 'automation-history.v1',
      })
    } catch (audit_error) {
      redactScannerError(audit_error)
    }
  }
}

function summarizeAutomationHistory(process_result: ScannerMessageProcessResult): string {
  const processed_attachments = process_result.attachments.filter((attachment_result) => attachment_result.status === 'processed')
  const filenames = processed_attachments.map((attachment_result) => attachment_result.attachment.filename).join(', ') || 'no processed attachments'
  const labels = [...new Set(processed_attachments.map((attachment_result) => attachment_result.classification?.label ?? 'unknown'))].join(', ')
  return `Processed ${processed_attachments.length} automated attachment(s): ${filenames}. Classification: ${labels || 'unknown'}.`
}

const real_timer: ScannerPollTimer = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}
