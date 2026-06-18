import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { redactForLog } from '../shared/log-redaction.js'

export interface AutomationHistoryAttachment {
  filename: string
  mimeType: string
  sizeBytes: number
  extractionStatus: string
  classificationLabel: string
  confidence?: number
  needsClarification?: boolean
}

export interface AutomationHistoryEntry {
  occurredAt: string
  createdAt?: string
  source: string
  kind: string
  title: string
  actor?: string
  contextRefs: string[]
  status: string
  summary: string
  openCodeJobId?: string
  openCodeSummary?: string | null
  attachments: AutomationHistoryAttachment[]
  attentionItems?: string[]
}

export interface AutomationHistorySink {
  append: (entry: AutomationHistoryEntry) => Promise<void>
}

export interface MarkdownAutomationHistorySinkOptions {
  path: string
  readFileText?: (path: string) => Promise<string>
  appendFileText?: (path: string, content: string) => Promise<void>
}

const HISTORY_HEADING = '# Automation History'
const MAX_TEXT_CHARS = 900
const TAX_ID_RE = /\b\d{2}-\d{7}\b/g
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g
const LONG_NUMBER_RE = /\b\d{10,}\b/g
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

export function createMarkdownAutomationHistorySink(options: MarkdownAutomationHistorySinkOptions): AutomationHistorySink {
  const read_file_text = options.readFileText ?? readUtf8IfPresent
  const append_file_text = options.appendFileText ?? appendUtf8CreatingParents

  return {
    append: async (entry) => {
      const existing_text = await read_file_text(options.path)
      const header = existing_text.trim() ? '' : `${HISTORY_HEADING}\n\nHigh-level notes from automated Epsilon/Church processing. Sensitive values are redacted; source systems remain the record of truth. Entries use Created: for startup recency checks. Add Reviewed: only when Joey explicitly asks Church to stop surfacing an entry.\n`
      await append_file_text(options.path, `${header}${formatAutomationHistoryEntry(entry)}\n`)
    },
  }
}

export function formatAutomationHistoryEntry(entry: AutomationHistoryEntry): string {
  const title = safeHistoryText(entry.title, 160) || 'Untitled automation event'
  const open_code_summary = entry.openCodeSummary ? extractAutomationSummary(entry.openCodeSummary) : undefined
  const created_at = normalizeCreatedAt(entry.createdAt)
  const lines = [
    `\n## ${safeHistoryText(entry.occurredAt, 80)} - ${safeHistoryText(entry.source, 80)} - ${title}`,
    `- Created: ${created_at}`,
    `- Kind: ${safeHistoryText(entry.kind, 120)}`,
    `- Status: ${safeHistoryText(entry.status, 120)}`,
    entry.actor ? `- Actor: ${safeHistoryText(entry.actor, 180)}` : undefined,
    entry.contextRefs.length > 0 ? `- Context: ${entry.contextRefs.map((context_ref) => `\`${safeHistoryText(context_ref, 160)}\``).join(', ')}` : undefined,
    entry.openCodeJobId ? `- OpenCode job: \`${safeHistoryText(entry.openCodeJobId, 160)}\`` : undefined,
    `- Summary: ${safeHistoryText(entry.summary, MAX_TEXT_CHARS)}`,
    open_code_summary ? `- OpenCode result: ${safeHistoryText(open_code_summary, MAX_TEXT_CHARS)}` : undefined,
    ...entry.attachments.map(formatAttachmentLine),
    ...(entry.attentionItems ?? []).map((item) => `- Attention: ${safeHistoryText(item, 360)}`),
  ].filter((line): line is string => typeof line === 'string')

  return `${lines.join('\n')}\n`
}

export function createNoopAutomationHistorySink(): AutomationHistorySink {
  return { append: async () => undefined }
}

function normalizeCreatedAt(value: string | undefined): string {
  return value && ISO_TIMESTAMP_RE.test(value) ? value : new Date().toISOString()
}

function formatAttachmentLine(attachment: AutomationHistoryAttachment): string {
  const confidence = typeof attachment.confidence === 'number' ? `, confidence ${attachment.confidence}` : ''
  const clarification = attachment.needsClarification ? ', needs clarification' : ''
  return `- Attachment: ${safeHistoryText(attachment.filename, 180)} (${safeHistoryText(attachment.mimeType, 120)}, ${attachment.sizeBytes} bytes, ${safeHistoryText(attachment.extractionStatus, 80)}, ${safeHistoryText(attachment.classificationLabel, 80)}${confidence}${clarification})`
}

function extractAutomationSummary(value: string): string | undefined {
  const marker = 'automation history summary:'
  const marker_index = value.toLowerCase().indexOf(marker)
  if (marker_index === -1) return undefined
  const summary = value.slice(marker_index + marker.length).trim()
  return summary || undefined
}

function safeHistoryText(value: string, max_chars: number): string {
  const redacted_value = redactForLog(value)
  const string_value = typeof redacted_value === 'string' ? redacted_value : String(redacted_value)
  const normalized = string_value
    .replace(TAX_ID_RE, '[REDACTED_TAX_ID]')
    .replace(SSN_RE, '[REDACTED_TAX_ID]')
    .replace(LONG_NUMBER_RE, '[REDACTED_NUMBER]')
    .replace(/[\r\t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return normalized.length > max_chars ? `${normalized.slice(0, Math.max(0, max_chars - 3)).trimEnd()}...` : normalized
}

async function readUtf8IfPresent(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw error
  }
}

async function appendUtf8CreatingParents(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await appendFile(path, content, 'utf8')
}
