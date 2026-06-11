import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, normalize, relative, resolve, sep } from 'node:path'
import {
  CAPABILITY_MANIFEST_VERSION,
  type CapabilityActionType,
  type CapabilityConfirmation,
  type CapabilityExecutionResult,
  type CapabilityManifest,
  type CapabilityRiskLevel,
  type ConfirmationInput,
  type PrepareCapabilityRequest,
} from '../shared/capability-types.js'

export interface CapabilityGatewayOptions {
  churchRoot: string
  ttlMs?: number
  now?: () => Date
  readFileText?: (path: string) => Promise<string>
  writeFileText?: (path: string, content: string) => Promise<void>
}

interface PreparedCapabilityRecord {
  manifest: CapabilityManifest
  operation: CapabilityWriteOperation
}

type CapabilityWriteOperation =
  | { kind: 'append'; line: string }
  | { kind: 'upsert'; content: string }

const DEFAULT_TTL_MS = 5 * 60 * 1000

const TASK_TARGETS = {
  task_today_add: 'tasks/today.md',
  task_upcoming_add: 'tasks/upcoming.md',
} as const

export class CapabilityGateway {
  private readonly churchRoot: string
  private readonly ttlMs: number
  private readonly now: () => Date
  private readonly readFileText: (path: string) => Promise<string>
  private readonly writeFileText: (path: string, content: string) => Promise<void>
  private readonly prepared = new Map<string, PreparedCapabilityRecord>()

  constructor(options: CapabilityGatewayOptions) {
    this.churchRoot = resolve(options.churchRoot)
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
    this.now = options.now ?? (() => new Date())
    this.readFileText = options.readFileText ?? readUtf8IfPresent
    this.writeFileText = options.writeFileText ?? writeUtf8CreatingParents
  }

  prepare(request: PrepareCapabilityRequest): CapabilityManifest {
    const record = this.createRecord(request)
    this.prepared.set(record.manifest.id, record)
    return record.manifest
  }

  confirm(manifest: CapabilityManifest, input: ConfirmationInput): CapabilityConfirmation {
    const expired = this.isExpired(manifest)
    if (expired) return this.confirmation(manifest, false, 'expired')
    if (input.method === 'click') return this.confirmation(manifest, input.accepted, input.accepted ? 'accepted' : 'rejected')
    if (input.method === 'edit') return this.confirmation(manifest, false, 'edited')
    if (input.method === 'timeout') return this.confirmation(manifest, false, 'expired')

    const transcript = input.transcript.trim()
    if (transcript === manifest.confirmation_phrase) return this.confirmation(manifest, true, 'accepted')
    return this.confirmation(manifest, false, 'ambiguous')
  }

  async execute(manifest: CapabilityManifest, confirmation: CapabilityConfirmation): Promise<CapabilityExecutionResult> {
    const verification = this.verifyForExecution(manifest, confirmation)
    if (!verification.ok) return { ok: false, manifest_id: manifest.id, reason: verification.reason, not_sent: true }

    const target = this.resolveAllowedTarget(manifest.target_path)
    if (!target.ok) return { ok: false, manifest_id: manifest.id, reason: target.reason, not_sent: true }

    const record = verification.record
    let nextContent: string
    if (record.operation.kind === 'append') {
      const current = await this.readFileText(target.path)
      nextContent = appendMarkdownLine(current, record.operation.line)
    } else {
      nextContent = record.operation.content
    }

    await this.writeFileText(target.path, nextContent)
    this.prepared.delete(manifest.id)
    return {
      ok: true,
      manifest_id: manifest.id,
      target_path: manifest.target_path,
      bytes_written: Buffer.byteLength(nextContent, 'utf8'),
      not_sent: true,
    }
  }

  private createRecord(request: PrepareCapabilityRequest): PreparedCapabilityRecord {
    switch (request.action_type) {
      case 'church_inbox_capture':
        return this.buildAppendRecord({
          actionType: request.action_type,
          targetPath: 'inbox.md',
          line: checkboxLine(request.text),
          humanSummary: `Capture in Church inbox: ${normalizeSingleLine(request.text)}`,
          sourceContextLabels: request.source_context_labels,
          riskLevel: 'low',
        })
      case 'voice_project_notes_update':
        return this.buildAppendRecord({
          actionType: request.action_type,
          targetPath: 'projects/epsilon-voice-interface/notes.md',
          line: `- ${normalizeSingleLine(request.note)}`,
          humanSummary: 'Append a note to the Epsilon voice-interface project notes.',
          sourceContextLabels: request.source_context_labels,
          riskLevel: 'low',
        })
      case 'task_today_add':
      case 'task_upcoming_add':
        return this.buildAppendRecord({
          actionType: request.action_type,
          targetPath: TASK_TARGETS[request.action_type],
          line: checkboxLine(request.text),
          humanSummary: `Add ${request.action_type === 'task_today_add' ? 'today' : 'upcoming'} task: ${normalizeSingleLine(request.text)}`,
          sourceContextLabels: request.source_context_labels,
          riskLevel: 'low',
        })
      case 'local_draft_upsert':
        return this.buildDraftRecord(request)
    }
  }

  private buildAppendRecord(input: {
    actionType: CapabilityActionType
    targetPath: string
    line: string
    humanSummary: string
    sourceContextLabels?: string[]
    riskLevel: CapabilityRiskLevel
  }): PreparedCapabilityRecord {
    const payload = `Target: ${input.targetPath}\nAppend exactly:\n+ ${input.line}\n`
    const manifest = this.createManifest({
      actionType: input.actionType,
      targetPath: input.targetPath,
      humanSummary: input.humanSummary,
      exactDiffOrPayload: payload,
      sourceContextLabels: input.sourceContextLabels,
      riskLevel: input.riskLevel,
    })
    return { manifest, operation: { kind: 'append', line: input.line } }
  }

  private buildDraftRecord(request: Extract<PrepareCapabilityRequest, { action_type: 'local_draft_upsert' }>): PreparedCapabilityRecord {
    const draftName = safeMarkdownFilename(request.draft_name ?? request.title)
    const targetPath = `projects/epsilon-voice-interface/drafts/${draftName}`
    const notSentLine = request.external_send_intent ? 'Status: NOT SENT - local draft only.' : 'Status: Local draft only.'
    const content = [
      `# ${normalizeHeading(request.title)}`,
      '',
      notSentLine,
      request.external_send_intent ? `Source intent: ${normalizeSingleLine(request.external_send_intent)}` : undefined,
      '',
      request.body.trim(),
      '',
    ].filter((line): line is string => line !== undefined).join('\n')
    const manifest = this.createManifest({
      actionType: request.action_type,
      targetPath,
      humanSummary: request.external_send_intent
        ? `Create local draft only for external send intent. NOT SENT: ${normalizeSingleLine(request.external_send_intent)}`
        : `Create or update local draft: ${normalizeSingleLine(request.title)}`,
      exactDiffOrPayload: `Target: ${targetPath}\nWrite local draft payload only.\n${content}`,
      sourceContextLabels: request.source_context_labels,
      riskLevel: request.external_send_intent ? 'medium' : 'low',
    })
    return { manifest, operation: { kind: 'upsert', content } }
  }

  private createManifest(input: {
    actionType: CapabilityActionType
    targetPath: string
    humanSummary: string
    exactDiffOrPayload: string
    sourceContextLabels?: string[]
    riskLevel: CapabilityRiskLevel
  }): CapabilityManifest {
    const id = randomUUID()
    const manifestWithoutHash: Omit<CapabilityManifest, 'hash'> = {
      id,
      version: CAPABILITY_MANIFEST_VERSION,
      action_type: input.actionType,
      target_path: input.targetPath,
      human_summary: input.humanSummary,
      exact_diff_or_payload: input.exactDiffOrPayload,
      source_context_labels: sanitizeLabels(input.sourceContextLabels ?? []),
      risk_level: input.riskLevel,
      expires_at: new Date(this.now().getTime() + this.ttlMs).toISOString(),
      confirmation_phrase: `confirm ${id.slice(0, 8)}`,
    }
    return {
      ...manifestWithoutHash,
      hash: hashManifestFields(manifestWithoutHash),
    }
  }

  private confirmation(manifest: CapabilityManifest, accepted: boolean, reason: CapabilityConfirmation['reason']): CapabilityConfirmation {
    return {
      manifest_id: manifest.id,
      manifest_hash: manifest.hash,
      accepted,
      reason,
      confirmed_at: this.now().toISOString(),
    }
  }

  private verifyForExecution(manifest: CapabilityManifest, confirmation: CapabilityConfirmation): { ok: true; record: PreparedCapabilityRecord } | { ok: false; reason: string } {
    if (manifest.version !== CAPABILITY_MANIFEST_VERSION) return { ok: false, reason: 'manifest_version_mismatch' }
    if (this.isExpired(manifest)) return { ok: false, reason: 'manifest_expired' }
    if (hashCapabilityManifest(manifest) !== manifest.hash) return { ok: false, reason: 'manifest_hash_mismatch' }
    if (!confirmation.accepted) return { ok: false, reason: `confirmation_${confirmation.reason}` }
    if (confirmation.manifest_id !== manifest.id || confirmation.manifest_hash !== manifest.hash) return { ok: false, reason: 'confirmation_manifest_mismatch' }

    const record = this.prepared.get(manifest.id)
    if (!record) return { ok: false, reason: 'manifest_not_prepared' }
    if (record.manifest.hash !== manifest.hash || hashCapabilityManifest(record.manifest) !== manifest.hash) return { ok: false, reason: 'prepared_manifest_mismatch' }
    return { ok: true, record }
  }

  private isExpired(manifest: CapabilityManifest) {
    return Date.parse(manifest.expires_at) <= this.now().getTime()
  }

  private resolveAllowedTarget(targetPath: string): { ok: true; path: string } | { ok: false; reason: string } {
    const normalizedTarget = normalizeChurchRelativePath(targetPath)
    if (!isAllowedChurchTarget(normalizedTarget)) return { ok: false, reason: 'target_not_allowlisted' }

    const fullPath = resolve(this.churchRoot, normalizedTarget)
    const relativeFromRoot = relative(this.churchRoot, fullPath)
    if (relativeFromRoot.startsWith('..') || relativeFromRoot === '' || relativeFromRoot.split(sep).includes('..')) {
      return { ok: false, reason: 'target_escapes_church_root' }
    }
    return { ok: true, path: fullPath }
  }
}

export function hashCapabilityManifest(manifest: CapabilityManifest): string {
  const { hash: _hash, ...manifestWithoutHash } = manifest
  return hashManifestFields(manifestWithoutHash)
}

export function isAllowedChurchTarget(targetPath: string): boolean {
  const normalizedTarget = normalizeChurchRelativePath(targetPath)
  if (normalizedTarget === 'inbox.md') return true
  if (normalizedTarget === 'tasks/today.md') return true
  if (normalizedTarget === 'tasks/upcoming.md') return true
  if (normalizedTarget === 'projects/epsilon-voice-interface/notes.md') return true
  if (!normalizedTarget.startsWith('projects/epsilon-voice-interface/drafts/')) return false
  const draftName = normalizedTarget.slice('projects/epsilon-voice-interface/drafts/'.length)
  return /^[a-z0-9][a-z0-9-]*\.md$/.test(draftName)
}

function hashManifestFields(fields: Omit<CapabilityManifest, 'hash'>): string {
  return createHash('sha256').update(stableJson(fields)).digest('hex')
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function sanitizeLabels(labels: string[]): string[] {
  return labels.map((label) => normalizeSingleLine(label).slice(0, 120)).filter(Boolean).slice(0, 12)
}

function checkboxLine(text: string): string {
  return `- [ ] ${normalizeSingleLine(text)}`
}

function normalizeSingleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function normalizeHeading(text: string): string {
  const normalized = normalizeSingleLine(text).replace(/^#+\s*/, '')
  return normalized || 'Local Draft'
}

function safeMarkdownFilename(value: string): string {
  const stem = normalizeSingleLine(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'draft'
  return stem.endsWith('.md') ? stem : `${stem}.md`
}

function normalizeChurchRelativePath(targetPath: string): string {
  return normalize(targetPath).replace(/^\/+/, '').split(sep).join('/')
}

function appendMarkdownLine(current: string, line: string): string {
  const trimmedLine = line.trimEnd()
  if (!current) return `${trimmedLine}\n`
  const separator = current.endsWith('\n') ? '' : '\n'
  return `${current}${separator}${trimmedLine}\n`
}

async function readUtf8IfPresent(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw error
  }
}

async function writeUtf8CreatingParents(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
}
