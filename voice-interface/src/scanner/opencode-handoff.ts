import type { DelegationJobRequest, DelegationSubmitResult } from '../shared/delegation-types.js'
import { redactForLog } from '../shared/log-redaction.js'
import type { ScannerMessageProcessResult } from './intake.js'

export interface ScannerDelegationGateway {
  delegate: (request: DelegationJobRequest) => Promise<DelegationSubmitResult>
}

export interface ScannerOpenCodeHandoffOptions {
  gateway: ScannerDelegationGateway
  model?: string
  timeoutMs?: number
  costBudgetCents?: number
  maxPromptChars?: number
}

export interface ScannerOpenCodeHandoffResult {
  submitted: boolean
  request?: DelegationJobRequest
  result?: DelegationSubmitResult
}

export const DEFAULT_SCANNER_HANDOFF_MODEL = 'opencode/glm-5.1'
const DEFAULT_SCANNER_HANDOFF_TIMEOUT_MS = 5 * 60 * 1000
const DEFAULT_SCANNER_HANDOFF_COST_CENTS = 25
const DEFAULT_MAX_PROMPT_CHARS = 1800
const RAW_UNAVAILABLE_SENTENCE = 'Raw document text is unavailable unless a later extractor policy allows it.'

export async function handoffScannerResultToOpenCode(
  process_result: ScannerMessageProcessResult,
  options: ScannerOpenCodeHandoffOptions,
): Promise<ScannerOpenCodeHandoffResult> {
  const prompt_summary = buildScannerOpenCodePrompt(process_result, options.maxPromptChars)
  const request: DelegationJobRequest = {
    parentVoiceTurnId: `scanner:${process_result.trigger.contextRefs[0] ?? process_result.trigger.receivedAt}`,
    promptSummary: prompt_summary,
    model: options.model ?? DEFAULT_SCANNER_HANDOFF_MODEL,
    profile: 'standard',
    timeoutMs: options.timeoutMs ?? DEFAULT_SCANNER_HANDOFF_TIMEOUT_MS,
    costBudgetCents: options.costBudgetCents ?? DEFAULT_SCANNER_HANDOFF_COST_CENTS,
  }
  const result = await options.gateway.delegate(request)
  return { submitted: true, request, result }
}

export function buildScannerOpenCodePrompt(process_result: ScannerMessageProcessResult, max_chars = DEFAULT_MAX_PROMPT_CHARS): string {
  const lines = [
    'MOI scanner intake event matched deterministic RICOH criteria.',
    RAW_UNAVAILABLE_SENTENCE,
    'Use only the safe metadata below. Do not ask for raw email bodies, attachment bodies, OCR text, base64 payloads, secrets, Gmail mutations, or remote model calls.',
    `Gmail context refs: ${safeJoin(process_result.trigger.contextRefs)}`,
    `Sender: ${safeField(process_result.trigger.actor)}`,
    `Subject: ${safeField(process_result.trigger.subject)}`,
  ]

  for (const attachment_result of process_result.attachments) {
    lines.push(`Attachment filename: ${safeField(attachment_result.attachment.filename)}`)
    lines.push(`Attachment MIME type: ${safeField(attachment_result.attachment.mimeType)}`)
    lines.push(`Attachment size bytes: ${attachment_result.attachment.sizeBytes}`)
    lines.push(`Attachment content hash: ${safeField(attachment_result.attachment.contentHash)}`)
    lines.push(`Extraction status: ${safeField(attachment_result.extraction?.status ?? 'duplicate_skip')}`)
    lines.push(`Classification: ${safeField(attachment_result.classification?.label ?? 'not_reprocessed')}`)
    lines.push(`Confidence: ${attachment_result.classification?.confidence ?? 'not_reprocessed'}`)
    lines.push(`Unresolved questions: ${safeJoin(attachment_result.classification?.unresolvedQuestions ?? [])}`)
  }

  const prompt = lines.join('\n')
  return prompt.length > max_chars ? `${prompt.slice(0, Math.max(0, max_chars - 3))}...` : prompt
}

function safeField(value: string): string {
  const redacted_value = redactForLog(value)
  const string_value = typeof redacted_value === 'string' ? redacted_value : String(redacted_value)
  return string_value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240)
}

function safeJoin(values: string[]): string {
  return values.map(safeField).filter(Boolean).join(', ') || 'none'
}
