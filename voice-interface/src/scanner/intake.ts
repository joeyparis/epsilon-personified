import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { CapabilityGateway } from '../capabilities/gateway.js'
import type { CapabilityExecutionResult, CapabilityManifest } from '../shared/capability-types.js'
import { safeLogLine } from '../shared/log-redaction.js'

export type EpsilonTriggerSource = 'gmail' | 'webhook' | 'schedule'
export type ScannerExtractionStatus = 'extracted' | 'needs_ocr' | 'unsupported'
export type ScannerProcessStatus = 'processed' | 'skipped_duplicate'

export interface EpsilonTriggerAttachment {
  id: string
  filename: string
  mimeType: string
  contentHash: string
  sizeBytes: number
}

export interface EpsilonTrigger {
  source: EpsilonTriggerSource
  kind: string
  receivedAt: string
  actor: string
  subject: string
  attachments: EpsilonTriggerAttachment[]
  contextRefs: string[]
}

export interface GmailScannerAttachmentRecord {
  id: string
  filename: string
  mimeType: string
  text?: string
  contentBase64?: string
  sizeBytes?: number
}

export interface GmailScannerMessageRecord {
  id: string
  threadId?: string
  from: string
  subject: string
  receivedAt: string
  labels?: string[]
  scannerEmailBody?: string
  attachments: GmailScannerAttachmentRecord[]
}

export type ScannerTextFilter = string | RegExp

export interface ScannerMessageFilterOptions {
  targetLabel?: string
  sender?: ScannerTextFilter
  subject?: ScannerTextFilter
  hasAttachment?: boolean
  maxResults?: number
}

export interface ScannerMessageSource {
  searchScannerMessages: (options?: ScannerMessageFilterOptions) => Promise<GmailScannerMessageRecord[]>
}

export interface ScannerExtractionResult {
  status: ScannerExtractionStatus
  text: string
  extractorVersion: string
  reason?: 'no_text' | 'needs_ocr' | 'unsupported_mime'
}

export interface ScannerAttachmentExtractor {
  version: string
  canExtract: (attachment: GmailScannerAttachmentRecord) => boolean
  extract: (attachment: GmailScannerAttachmentRecord) => Promise<ScannerExtractionResult>
}

export interface ScannerClassification {
  label: 'scan_document' | 'financial_document' | 'unknown_scan'
  confidence: number
  summary: string
  unresolvedQuestions: string[]
  needsClarification: boolean
}

export interface ScannerIdempotencyRecord {
  key: string
  messageId: string
  attachmentId: string
  extractorVersion: string
  contentHash: string
  processedAt: string
  status: ScannerExtractionStatus
  classificationLabel: ScannerClassification['label']
  confidence: number
  summary: string
}

export interface ScannerIdempotencyStore {
  has: (key: string) => Promise<boolean>
  record: (record: ScannerIdempotencyRecord) => Promise<void>
  list: () => Promise<ScannerIdempotencyRecord[]>
}

export interface ScannerAuditSink {
  append: (entry: ScannerAuditEntry) => Promise<void>
}

export interface ScannerAuditEntry {
  event: 'scanner.attachment.processed' | 'scanner.attachment.skipped_duplicate'
  messageId: string
  attachmentId: string
  contentHash: string
  extractorVersion: string
  extractionStatus?: ScannerExtractionStatus
  classificationLabel?: ScannerClassification['label']
  confidence?: number
  needsClarification?: boolean
}

export interface ScannerClarificationRequest {
  trigger: EpsilonTrigger
  attachment: EpsilonTriggerAttachment
  classification: ScannerClassification
}

export interface ScannerClarificationResult {
  prepared: boolean
  manifest?: CapabilityManifest
  execution?: CapabilityExecutionResult
}

export interface ScannerChurchWriter {
  writeClarification: (request: ScannerClarificationRequest) => Promise<ScannerClarificationResult>
}

export interface ScannerWorkerOptions {
  idempotencyStore: ScannerIdempotencyStore
  churchWriter?: ScannerChurchWriter
  auditSink?: ScannerAuditSink
  extractors?: ScannerAttachmentExtractor[]
  confidenceThreshold?: number
  now?: () => Date
}

export interface ScannerAttachmentProcessResult {
  status: ScannerProcessStatus
  idempotencyKey: string
  attachment: EpsilonTriggerAttachment
  extraction?: ScannerExtractionResult
  classification?: ScannerClassification
  clarification?: ScannerClarificationResult
  idempotencyRecord?: ScannerIdempotencyRecord
}

export interface ScannerMessageProcessResult {
  trigger: EpsilonTrigger
  attachments: ScannerAttachmentProcessResult[]
}

export interface ScannerWorker {
  processMessage: (message_record: GmailScannerMessageRecord) => Promise<ScannerMessageProcessResult>
  commitMessage: (process_result: ScannerMessageProcessResult) => Promise<void>
}

const DEFAULT_TEXT_EXTRACTOR_VERSION = 'text-plain.v1'
const DEFAULT_CONFIDENCE_THRESHOLD = 0.72
const OCR_MIME_PREFIXES = ['image/'] as const
const OCR_MIME_TYPES = ['application/pdf'] as const

export function normalizeScannerTrigger(message_record: GmailScannerMessageRecord): EpsilonTrigger {
  return {
    source: 'gmail',
    kind: 'ricoh_scan_message',
    receivedAt: new Date(message_record.receivedAt).toISOString(),
    actor: normalizeSingleLine(message_record.from),
    subject: normalizeSingleLine(message_record.subject),
    attachments: message_record.attachments.map((attachment_record) => normalizeTriggerAttachment(attachment_record)),
    contextRefs: [`gmail:message:${message_record.id}`, message_record.threadId ? `gmail:thread:${message_record.threadId}` : undefined]
      .filter((context_ref): context_ref is string => typeof context_ref === 'string'),
  }
}

export function createMemoryScannerMessageSource(message_records: GmailScannerMessageRecord[]): ScannerMessageSource {
  return {
    searchScannerMessages: async (options) => findScannerMessagesInRecords(message_records, options),
  }
}

export async function findScannerMessages(
  source: ScannerMessageSource,
  options: ScannerMessageFilterOptions = {},
): Promise<GmailScannerMessageRecord[]> {
  return findScannerMessagesInRecords(await source.searchScannerMessages(options), options)
}

export async function processFoundScannerMessages(input: {
  source: ScannerMessageSource
  worker: ScannerWorker
  options?: ScannerMessageFilterOptions
}): Promise<ScannerMessageProcessResult[]> {
  const message_records = await findScannerMessages(input.source, input.options)
  const results: ScannerMessageProcessResult[] = []
  for (const message_record of message_records) {
    const result = await input.worker.processMessage(message_record)
    await input.worker.commitMessage(result)
    results.push(result)
  }
  return results
}

export function findScannerMessagesInRecords(
  message_records: GmailScannerMessageRecord[],
  options: ScannerMessageFilterOptions = {},
): GmailScannerMessageRecord[] {
  const matches = message_records.filter((message_record) => matchesScannerMessage(message_record, options))
  return typeof options.maxResults === 'number' ? matches.slice(0, Math.max(0, options.maxResults)) : matches
}

export function createScannerWorker(options: ScannerWorkerOptions): ScannerWorker {
  const confidence_threshold = options.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD
  const now = options.now ?? (() => new Date())
  const extractors = options.extractors ?? []
  const audit_sink = options.auditSink ?? createNoopScannerAuditSink()

  return {
    processMessage: async (message_record: GmailScannerMessageRecord): Promise<ScannerMessageProcessResult> => {
      const trigger = normalizeScannerTrigger(message_record)
      const attachments: ScannerAttachmentProcessResult[] = []

      for (const attachment_record of message_record.attachments) {
        const attachment = normalizeTriggerAttachment(attachment_record)
        const extraction = await extractAttachmentText(attachment_record, extractors)
        const idempotency_key = createScannerIdempotencyKey({
          messageId: message_record.id,
          attachmentId: attachment_record.id,
          extractorVersion: extraction.extractorVersion,
          contentHash: attachment.contentHash,
        })

        if (await options.idempotencyStore.has(idempotency_key)) {
          await audit_sink.append({
            event: 'scanner.attachment.skipped_duplicate',
            messageId: message_record.id,
            attachmentId: attachment_record.id,
            contentHash: attachment.contentHash,
            extractorVersion: extraction.extractorVersion,
          })
          attachments.push({ status: 'skipped_duplicate', idempotencyKey: idempotency_key, attachment })
          continue
        }

        const classification = classifyScannerExtraction({
          trigger,
          attachment,
          extraction,
          confidenceThreshold: confidence_threshold,
        })
        const clarification = classification.needsClarification && options.churchWriter
          ? await options.churchWriter.writeClarification({ trigger, attachment, classification })
          : undefined

        const idempotency_record: ScannerIdempotencyRecord = {
          key: idempotency_key,
          messageId: message_record.id,
          attachmentId: attachment_record.id,
          extractorVersion: extraction.extractorVersion,
          contentHash: attachment.contentHash,
          processedAt: now().toISOString(),
          status: extraction.status,
          classificationLabel: classification.label,
          confidence: classification.confidence,
          summary: classification.summary,
        }
        attachments.push({ status: 'processed', idempotencyKey: idempotency_key, attachment, extraction, classification, clarification, idempotencyRecord: idempotency_record })
      }

      return { trigger, attachments }
    },
    commitMessage: async (process_result: ScannerMessageProcessResult): Promise<void> => {
      for (const attachment_result of process_result.attachments) {
        if (attachment_result.status !== 'processed' || !attachment_result.idempotencyRecord || !attachment_result.extraction || !attachment_result.classification) continue
        await options.idempotencyStore.record(attachment_result.idempotencyRecord)
        await audit_sink.append({
          event: 'scanner.attachment.processed',
          messageId: attachment_result.idempotencyRecord.messageId,
          attachmentId: attachment_result.idempotencyRecord.attachmentId,
          contentHash: attachment_result.attachment.contentHash,
          extractorVersion: attachment_result.extraction.extractorVersion,
          extractionStatus: attachment_result.extraction.status,
          classificationLabel: attachment_result.classification.label,
          confidence: attachment_result.classification.confidence,
          needsClarification: attachment_result.classification.needsClarification,
        })
      }
    },
  }
}

function matchesScannerMessage(message_record: GmailScannerMessageRecord, options: ScannerMessageFilterOptions): boolean {
  if (options.targetLabel && !(message_record.labels ?? []).includes(options.targetLabel)) return false
  if (options.sender && !matchesTextFilter(message_record.from, options.sender)) return false
  if (options.subject && !matchesTextFilter(message_record.subject, options.subject)) return false
  if (typeof options.hasAttachment === 'boolean' && (message_record.attachments.length > 0) !== options.hasAttachment) return false
  return true
}

function matchesTextFilter(value: string, filter: ScannerTextFilter): boolean {
  if (typeof filter === 'string') return value.toLowerCase().includes(filter.toLowerCase())
  filter.lastIndex = 0
  return filter.test(value)
}

export async function extractAttachmentText(
  attachment_record: GmailScannerAttachmentRecord,
  extractors: ScannerAttachmentExtractor[] = [],
): Promise<ScannerExtractionResult> {
  const matching_extractor = extractors.find((extractor) => extractor.canExtract(attachment_record))
  if (matching_extractor) return matching_extractor.extract(attachment_record)

  if (attachment_record.mimeType === 'text/plain') {
    const text = attachment_record.text ?? decodeBase64Utf8(attachment_record.contentBase64 ?? '')
    if (!text.trim()) {
      return { status: 'unsupported', text: '', extractorVersion: DEFAULT_TEXT_EXTRACTOR_VERSION, reason: 'no_text' }
    }
    return { status: 'extracted', text, extractorVersion: DEFAULT_TEXT_EXTRACTOR_VERSION }
  }

  if (needsOcr(attachment_record.mimeType)) {
    return { status: 'needs_ocr', text: '', extractorVersion: 'builtin-needs-ocr.v1', reason: 'needs_ocr' }
  }

  return { status: 'unsupported', text: '', extractorVersion: 'builtin-unsupported.v1', reason: 'unsupported_mime' }
}

export function classifyScannerExtraction(input: {
  trigger: EpsilonTrigger
  attachment: EpsilonTriggerAttachment
  extraction: ScannerExtractionResult
  confidenceThreshold?: number
}): ScannerClassification {
  const confidence_threshold = input.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD
  const normalized_subject = input.trigger.subject.toLowerCase()
  const normalized_filename = input.attachment.filename.toLowerCase()
  const normalized_text = input.extraction.text.toLowerCase()
  const has_financial_terms = ['invoice', 'receipt', 'total', 'amount due', 'payment'].some((term) => normalized_text.includes(term))
  const has_scanner_context = ['ricoh', 'scan', 'scanner'].some((term) => normalized_subject.includes(term) || normalized_filename.includes(term))
  const label: ScannerClassification['label'] = has_financial_terms ? 'financial_document' : has_scanner_context ? 'scan_document' : 'unknown_scan'
  const extraction_confidence = input.extraction.status === 'extracted' ? 0.46 : input.extraction.status === 'needs_ocr' ? 0.2 : 0.1
  const confidence = clampConfidence(extraction_confidence + (has_financial_terms ? 0.36 : 0) + (has_scanner_context ? 0.22 : 0))
  const unresolved_questions = buildUnresolvedQuestions(input.extraction.status, confidence, confidence_threshold, label)

  return {
    label,
    confidence,
    summary: summarizeScan(input.trigger, input.attachment, label, input.extraction.status),
    unresolvedQuestions: unresolved_questions,
    needsClarification: unresolved_questions.length > 0,
  }
}

export function createScannerIdempotencyKey(input: {
  messageId: string
  attachmentId: string
  extractorVersion: string
  contentHash: string
}): string {
  return hashText([input.messageId, input.attachmentId, input.extractorVersion, input.contentHash].join('\n'))
}

export function createMemoryScannerIdempotencyStore(initial_records: ScannerIdempotencyRecord[] = []): ScannerIdempotencyStore {
  const records_by_key = new Map(initial_records.map((record) => [record.key, record]))
  return {
    has: async (key) => records_by_key.has(key),
    record: async (record) => {
      records_by_key.set(record.key, record)
    },
    list: async () => [...records_by_key.values()],
  }
}

export function createJsonFileScannerIdempotencyStore(path: string): ScannerIdempotencyStore {
  return {
    has: async (key) => (await readScannerState(path)).some((record) => record.key === key),
    record: async (record) => {
      const existing_records = await readScannerState(path)
      const next_records = [...existing_records.filter((existing_record) => existing_record.key !== record.key), record]
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, `${JSON.stringify(next_records, null, 2)}\n`, 'utf8')
    },
    list: async () => readScannerState(path),
  }
}

export function createMemoryScannerAuditSink(): ScannerAuditSink & { lines: string[] } {
  const lines: string[] = []
  return {
    lines,
    append: async (entry) => {
      lines.push(safeLogLine('scanner', entry))
    },
  }
}

export function createNoopScannerAuditSink(): ScannerAuditSink {
  return { append: async () => undefined }
}

export class ChurchScannerClarificationWriter implements ScannerChurchWriter {
  private readonly gateway: CapabilityGateway

  constructor(gateway: CapabilityGateway) {
    this.gateway = gateway
  }

  async writeClarification(request: ScannerClarificationRequest): Promise<ScannerClarificationResult> {
    const manifest = this.gateway.prepare({
      action_type: 'church_inbox_capture',
      text: createClarificationInboxText(request),
      source_context_labels: ['scanner:intake', ...request.trigger.contextRefs],
    })
    return { prepared: true, manifest }
  }
}

export class ConfirmedChurchScannerClarificationWriter implements ScannerChurchWriter {
  private readonly gateway: CapabilityGateway

  constructor(gateway: CapabilityGateway) {
    this.gateway = gateway
  }

  async writeClarification(request: ScannerClarificationRequest): Promise<ScannerClarificationResult> {
    const manifest = this.gateway.prepare({
      action_type: 'church_inbox_capture',
      text: createClarificationInboxText(request),
      source_context_labels: ['scanner:intake:test', ...request.trigger.contextRefs],
    })
    const confirmation = this.gateway.confirm(manifest, { method: 'click', accepted: true })
    const execution = await this.gateway.execute(manifest, confirmation)
    return { prepared: true, manifest, execution }
  }
}

function normalizeTriggerAttachment(attachment_record: GmailScannerAttachmentRecord): EpsilonTriggerAttachment {
  return {
    id: normalizeSingleLine(attachment_record.id),
    filename: normalizeSingleLine(attachment_record.filename),
    mimeType: normalizeSingleLine(attachment_record.mimeType),
    contentHash: hashAttachmentContent(attachment_record),
    sizeBytes: attachment_record.sizeBytes ?? Buffer.byteLength(attachment_record.text ?? attachment_record.contentBase64 ?? '', 'utf8'),
  }
}

function hashAttachmentContent(attachment_record: GmailScannerAttachmentRecord): string {
  return hashText([attachment_record.mimeType, attachment_record.text ?? '', attachment_record.contentBase64 ?? ''].join('\n'))
}

function needsOcr(mime_type: string): boolean {
  return (OCR_MIME_TYPES as readonly string[]).includes(mime_type) || OCR_MIME_PREFIXES.some((prefix) => mime_type.startsWith(prefix))
}

function decodeBase64Utf8(value: string): string {
  if (!value) return ''
  return Buffer.from(value, 'base64').toString('utf8')
}

function summarizeScan(
  trigger: EpsilonTrigger,
  attachment: EpsilonTriggerAttachment,
  label: ScannerClassification['label'],
  extraction_status: ScannerExtractionStatus,
): string {
  const readable_label = label.replace(/_/g, ' ')
  return `Scanner intake saw ${readable_label} from ${trigger.actor || 'unknown sender'} with attachment ${attachment.filename} (${extraction_status}).`
}

function buildUnresolvedQuestions(
  extraction_status: ScannerExtractionStatus,
  confidence: number,
  confidence_threshold: number,
  label: ScannerClassification['label'],
): string[] {
  const questions: string[] = []
  if (extraction_status === 'needs_ocr') questions.push('OCR is needed before Epsilon can read this scan. What should be done with the document?')
  if (extraction_status === 'unsupported') questions.push('This attachment type is unsupported by the local scanner MVP. Should it be reviewed manually?')
  if (confidence < confidence_threshold) questions.push(`Scanner classification is low confidence (${label}). What category or next action should be used?`)
  return questions
}

function createClarificationInboxText(request: ScannerClarificationRequest): string {
  return [
    `Scanner clarification needed: ${request.classification.summary}`,
    `Questions: ${request.classification.unresolvedQuestions.join(' ')}`,
    `Context: ${request.trigger.contextRefs.join(', ')}`,
  ].join(' ')
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(0.99, Number(value.toFixed(2))))
}

function normalizeSingleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

async function readScannerState(path: string): Promise<ScannerIdempotencyRecord[]> {
  try {
    const content = await readFile(path, 'utf8')
    const parsed: unknown = JSON.parse(content)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isScannerIdempotencyRecord)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

function isScannerIdempotencyRecord(value: unknown): value is ScannerIdempotencyRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.key === 'string'
    && typeof record.messageId === 'string'
    && typeof record.attachmentId === 'string'
    && typeof record.extractorVersion === 'string'
    && typeof record.contentHash === 'string'
    && typeof record.processedAt === 'string'
    && typeof record.summary === 'string'
    && typeof record.confidence === 'number'
    && ['extracted', 'needs_ocr', 'unsupported'].includes(String(record.status))
    && ['scan_document', 'financial_document', 'unknown_scan'].includes(String(record.classificationLabel))
}
