import { execFile } from 'node:child_process'
import { appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { createMarkdownAutomationHistorySink, type AutomationHistorySink } from '../church/automation-history.js'
import { DelegationGateway } from '../delegation/gateway.js'
import { safeLogLine } from '../shared/log-redaction.js'
import { createGmailRestScannerMessageSource, DEFAULT_GMAIL_SCANNER_QUERY, type GmailAccessTokenProvider } from './gmail-rest-source.js'
import { createJsonFileScannerIdempotencyStore, createMemoryScannerMessageSource, createScannerWorker, type ScannerAuditEntry, type ScannerAuditSink, type ScannerMessageSource, type ScannerWorker } from './intake.js'
import { DEFAULT_SCANNER_HANDOFF_MODEL, type ScannerDelegationGateway } from './opencode-handoff.js'
import { createIamSignJwtWorkspaceAccessTokenProvider, createWorkspaceServiceAccountAccessTokenProvider, DEFAULT_WORKSPACE_DELEGATED_USER, GMAIL_READONLY_SCOPE } from './workspace-service-account-auth.js'
import { runScannerPollOnce, startScannerPollLoop } from './poller.js'

export type ScannerSourceMode = 'gmail' | 'empty'
export type ScannerAuthMode = 'gcloud' | 'service-account' | 'iam-sign-jwt'

export interface ScannerIntakeServiceConfig {
  once: boolean
  intervalMs: number
  statePath: string
  logPath: string
  errorLogPath: string
  automationHistoryPath: string
  opencodeEndpoint: string
  opencodeModel: string
  sourceMode: ScannerSourceMode
  authMode: ScannerAuthMode
  serviceAccountKeyPath: string
  serviceAccountEmail: string
  delegatedUser: string
  gmailScope: string
  targetLabel: string
  gmailQuery: string
  attachmentDownloadDir: string
  gcloudCommand: string[]
}

export interface ScannerIntakeCliDependencies {
  accessTokenProvider?: GmailAccessTokenProvider
  source?: ScannerMessageSource
  worker?: ScannerWorker
  gateway?: ScannerDelegationGateway
  automationHistorySink?: AutomationHistorySink
  exit?: (code: number) => void
}

const exec_file = promisify(execFile)
const DEFAULT_STATE_PATH = join(homedir(), 'Library/Application Support/Epsilon/scanner-intake/state.json')
const DEFAULT_LOG_PATH = join(homedir(), 'Library/Logs/epsilon-scanner-intake.log')
const DEFAULT_ERROR_LOG_PATH = join(homedir(), 'Library/Logs/epsilon-scanner-intake-error.log')
const DEFAULT_AUTOMATION_HISTORY_PATH = join(homedir(), 'Church/notes/automation-history.md')
const DEFAULT_ATTACHMENT_DOWNLOAD_DIR = join(homedir(), 'Library/Application Support/Epsilon/scanner-intake/attachments')
const DEFAULT_OPENCODE_ENDPOINT = 'http://127.0.0.1:4097'
const DEFAULT_LAUNCHD_PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
const DEFAULT_TARGET_LABEL = ''
const DEFAULT_SERVICE_ACCOUNT_KEY_PATH = join(homedir(), '.config/Epsilon/scanner-intake/moi-gmail-scanner-service-account.json')
const DEFAULT_SCANNER_SERVICE_ACCOUNT_EMAIL = 'moi-gmail-scanner@epsilon-490315.iam.gserviceaccount.com'
const DEFAULT_GCLOUD_COMMAND = [
  '/usr/bin/env',
  'CLOUDSDK_CONFIG=/Users/joey/.config/gcloud-personal',
  'gcloud',
  '--configuration=personal',
  'auth',
  'print-access-token',
]

export function resolveScannerIntakeServiceConfig(argv: string[], env: NodeJS.ProcessEnv): ScannerIntakeServiceConfig {
  const once = argv.includes('--once')
  return {
    once,
    intervalMs: Number(env.SCANNER_POLL_INTERVAL_MS ?? 60_000),
    statePath: env.SCANNER_STATE_PATH ?? DEFAULT_STATE_PATH,
    logPath: env.SCANNER_LOG_PATH ?? DEFAULT_LOG_PATH,
    errorLogPath: env.SCANNER_ERROR_LOG_PATH ?? DEFAULT_ERROR_LOG_PATH,
    automationHistoryPath: env.SCANNER_AUTOMATION_HISTORY_PATH ?? DEFAULT_AUTOMATION_HISTORY_PATH,
    opencodeEndpoint: env.SCANNER_OPENCODE_ENDPOINT ?? DEFAULT_OPENCODE_ENDPOINT,
    opencodeModel: env.SCANNER_OPENCODE_MODEL ?? DEFAULT_SCANNER_HANDOFF_MODEL,
    sourceMode: resolveScannerSourceMode(env.SCANNER_SOURCE_MODE),
    authMode: resolveScannerAuthMode(env.SCANNER_AUTH_MODE),
    serviceAccountKeyPath: env.SCANNER_GOOGLE_APPLICATION_CREDENTIALS ?? DEFAULT_SERVICE_ACCOUNT_KEY_PATH,
    serviceAccountEmail: env.SCANNER_SERVICE_ACCOUNT_EMAIL ?? DEFAULT_SCANNER_SERVICE_ACCOUNT_EMAIL,
    delegatedUser: env.SCANNER_GOOGLE_DELEGATED_USER ?? DEFAULT_WORKSPACE_DELEGATED_USER,
    gmailScope: env.SCANNER_GMAIL_SCOPE ?? GMAIL_READONLY_SCOPE,
    targetLabel: env.SCANNER_TARGET_LABEL ?? DEFAULT_TARGET_LABEL,
    gmailQuery: env.SCANNER_GMAIL_QUERY ?? DEFAULT_GMAIL_SCANNER_QUERY,
    attachmentDownloadDir: env.SCANNER_ATTACHMENT_DOWNLOAD_DIR ?? DEFAULT_ATTACHMENT_DOWNLOAD_DIR,
    gcloudCommand: [
      DEFAULT_GCLOUD_COMMAND[0] ?? '/usr/bin/env',
      'PATH=' + (env.PATH ?? DEFAULT_LAUNCHD_PATH),
      ...DEFAULT_GCLOUD_COMMAND.slice(1),
    ],
  }
}

export async function runScannerIntakeCli(argv = process.argv.slice(2), env = process.env, dependencies: ScannerIntakeCliDependencies = {}): Promise<void> {
  const config = resolveScannerIntakeServiceConfig(argv, env)
  const set_exit_code = dependencies.exit ?? ((code: number) => { process.exitCode = code })
  const audit_sink = createFileScannerAuditSink(config.logPath)
  const source = dependencies.source ?? createScannerMessageSource(config, dependencies.accessTokenProvider)
  const worker = dependencies.worker ?? createScannerWorker({ idempotencyStore: createJsonFileScannerIdempotencyStore(config.statePath), auditSink: audit_sink })
  const gateway = dependencies.gateway ?? new DelegationGateway({ endpoint: config.opencodeEndpoint })
  const automation_history_sink = dependencies.automationHistorySink ?? createMarkdownAutomationHistorySink({ path: config.automationHistoryPath })
  const poll_options = {
    source,
    worker,
    handoff: { gateway, model: config.opencodeModel, costBudgetCents: 75, timeoutMs: 10 * 60 * 1000 },
    filters: { targetLabel: config.targetLabel, hasAttachment: true, subject: /\b(?:ricoh|scan(?:ned|ner)?|scanned documents)\b/i },
    auditSink: audit_sink,
    automationHistorySink: automation_history_sink,
  }

  try {
    if (config.once) {
      const result = await runScannerPollOnce(poll_options)
      await appendSafeLine(config.logPath, safeLogLine('scanner-intake-once', result))
      set_exit_code(result.errors.length > 0 ? 1 : 0)
      return
    }
    startScannerPollLoop({ ...poll_options, intervalMs: config.intervalMs })
    await appendSafeLine(config.logPath, safeLogLine('scanner-intake-loop-started', { intervalMs: config.intervalMs }))
  } catch (error) {
    await appendSafeLine(config.errorLogPath, safeLogLine('scanner-intake-error', { error: error instanceof Error ? error.message : String(error) }))
    set_exit_code(1)
  }
}

export function createScannerMessageSource(config: ScannerIntakeServiceConfig, accessTokenProvider?: GmailAccessTokenProvider): ScannerMessageSource {
  if (config.sourceMode === 'empty') return createMemoryScannerMessageSource([])
  return createGmailRestScannerMessageSource({
    accessTokenProvider: accessTokenProvider ?? createScannerAccessTokenProvider(config),
    defaultQuery: config.gmailQuery,
    attachmentDownloadDir: config.attachmentDownloadDir,
  })
}

export function createScannerAccessTokenProvider(config: ScannerIntakeServiceConfig): GmailAccessTokenProvider {
  if (config.authMode === 'service-account') {
    return createWorkspaceServiceAccountAccessTokenProvider({
      keyPath: config.serviceAccountKeyPath,
      subject: config.delegatedUser,
      scopes: [config.gmailScope],
    })
  }
  if (config.authMode === 'iam-sign-jwt') {
    return createIamSignJwtWorkspaceAccessTokenProvider({
      serviceAccountEmail: config.serviceAccountEmail,
      iamAccessTokenProvider: createGcloudAccessTokenProvider(config.gcloudCommand),
      subject: config.delegatedUser,
      scopes: [config.gmailScope],
    })
  }
  return createGcloudAccessTokenProvider(config.gcloudCommand)
}

function resolveScannerSourceMode(value: string | undefined): ScannerSourceMode {
  return value === 'empty' ? 'empty' : 'gmail'
}

function resolveScannerAuthMode(value: string | undefined): ScannerAuthMode {
  if (value === 'service-account') return 'service-account'
  if (value === 'iam-sign-jwt') return 'iam-sign-jwt'
  return 'gcloud'
}

export function createGcloudAccessTokenProvider(command: string[]): GmailAccessTokenProvider {
  return async () => {
    const [binary, ...args] = command
    if (!binary) throw new Error('Missing gcloud token command')
    const result = await exec_file(binary, args)
    return result.stdout.trim()
  }
}

function createFileScannerAuditSink(path: string): ScannerAuditSink {
  return {
    append: async (entry: ScannerAuditEntry) => appendSafeLine(path, safeLogLine('scanner', entry)),
  }
}

async function appendSafeLine(path: string, line: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await appendFile(path, `${line}\n`, 'utf8')
}

if (process.argv[1]?.endsWith('scanner-intake-service.js')) {
  void runScannerIntakeCli()
}
