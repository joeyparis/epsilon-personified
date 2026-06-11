import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { CapabilityGateway } from '../capabilities/gateway.js'
import { DelegationGateway } from '../delegation/gateway.js'
import { MockRealtimeClient, createMockRealtimeSession } from '../realtime/mock-client.js'
import type { RealtimeSessionMintResult } from '../realtime/types.js'
import { createPushToTalkController, type PushToTalkClock } from '../renderer/audio/push-to-talk.js'
import { createSilentMicrophoneCaptureAdapter } from '../renderer/audio/microphone-capture.js'
import { REQUIRED_APP_STATES, type AppState } from '../shared/state.js'
import { STATE_PRESENTATION } from '../shared/presentation.js'

const PTT_LATENCY_EVIDENCE = '/Users/joey/Church/.omo/evidence/task-3-ptt-latency.json'
const CAPTURE_EVIDENCE = '/Users/joey/Church/.omo/evidence/task-6-confirmed-capture.diff'
const EXTERNAL_SEND_EVIDENCE = '/Users/joey/Church/.omo/evidence/task-6-external-send-draft.txt'
const DELEGATION_UNAVAILABLE_EVIDENCE = '/Users/joey/Church/.omo/evidence/task-7-opencode-unavailable.txt'

function runStateSmoke() {
  let failed = false

  for (const state of REQUIRED_APP_STATES) {
    const presentation = STATE_PRESENTATION[state]
    if (!presentation?.label || !presentation.message) {
      failed = true
      console.log(`${state}: FAIL`)
      continue
    }

    console.log(`${state}: PASS - ${presentation.label}`)
  }

  if (failed) {
    process.exitCode = 1
    return
  }

  console.log('PASS all required states rendered')
}

function createSmokeClock(): PushToTalkClock {
  let nowMs = 1_000
  return {
    now: () => {
      nowMs += 120
      return nowMs
    },
    date: () => new Date(nowMs),
  }
}

function mockSessionResult(): RealtimeSessionMintResult {
  return { ok: true, session: createMockRealtimeSession('smoke-mock-realtime-session') }
}

async function runPttLatencySmoke() {
  const states: AppState[] = []
  const eventTypes: string[] = []
  let ackMs = Number.POSITIVE_INFINITY
  const realtimeClient = new MockRealtimeClient({ responseText: 'Smoke mock realtime response.' })
  const controller = createPushToTalkController({
    realtimeClient,
    requestSession: async () => mockSessionResult(),
    microphoneCapture: createSilentMicrophoneCaptureAdapter(),
    clock: createSmokeClock(),
    setState: (state) => states.push(state),
    publishEvent: (event) => eventTypes.push(event.type),
    onAcknowledgement: (acknowledgement) => {
      ackMs = acknowledgement.ackMs
    },
  })

  await controller.pressStart()
  await controller.pressEnd()

  const result = {
    task: 'task-3-ptt-latency',
    mock_realtime: true,
    ack_ms: ackMs,
    pass: ackMs < 500,
    states,
    events: eventTypes,
    realtime_events: realtimeClient.events.map((event) => event.type),
  }

  await mkdir(dirname(PTT_LATENCY_EVIDENCE), { recursive: true })
  await writeFile(PTT_LATENCY_EVIDENCE, `${JSON.stringify(result, null, 2)}\n`)

  if (!result.pass) {
    process.exitCode = 1
    console.log(`FAIL ptt latency ack_ms=${ackMs}`)
    return
  }

  console.log(`PASS ptt latency ack_ms=${ackMs}`)
  console.log(`Evidence: ${PTT_LATENCY_EVIDENCE}`)
}

async function runManifestCaptureSmoke(text: string, confirm: boolean) {
  const churchRoot = await createChurchSmokeFixture()
  const gateway = new CapabilityGateway({ churchRoot })
  const before = await readFile(join(churchRoot, 'inbox.md'), 'utf8')
  const manifest = gateway.prepare({
    action_type: 'church_inbox_capture',
    text,
    source_context_labels: ['smoke:manifest-capture'],
  })

  const prepared = await readFile(join(churchRoot, 'inbox.md'), 'utf8')
  if (prepared !== before) {
    process.exitCode = 1
    console.log('FAIL manifest capture wrote before confirmation')
    return
  }

  if (!confirm) {
    console.log(`Prepared manifest ${manifest.id}; rerun with --confirm to execute.`)
    return
  }

  const result = await gateway.execute(manifest, gateway.confirm(manifest, { method: 'click', accepted: true }))
  const after = await readFile(join(churchRoot, 'inbox.md'), 'utf8')
  const expected = `- [ ] ${text}\n`
  const pass = result.ok && after === expected
  const diff = [
    'fixture: temporary Church fixture',
    `manifest: ${manifest.id}`,
    `hash: ${manifest.hash}`,
    `target: ${manifest.target_path}`,
    '--- before/inbox.md',
    before,
    '+++ after/inbox.md',
    after,
  ].join('\n')
  await writeEvidence(CAPTURE_EVIDENCE, diff)

  if (!pass) {
    process.exitCode = 1
    console.log('FAIL manifest capture confirmation')
    return
  }

  console.log(`PASS manifest capture wrote after confirmation only: ${manifest.target_path}`)
  console.log(`Evidence: ${CAPTURE_EVIDENCE}`)
}

async function runExternalSendDraftSmoke(intent: string, confirm: boolean) {
  const churchRoot = await createChurchSmokeFixture()
  const gateway = new CapabilityGateway({ churchRoot })
  const manifest = gateway.prepare({
    action_type: 'local_draft_upsert',
    title: 'External Send Draft',
    body: intent,
    external_send_intent: intent,
    source_context_labels: ['smoke:external-send'],
  })

  if (!confirm) {
    console.log(`Prepared local draft manifest ${manifest.id}; rerun with --confirm to write draft. NOT SENT.`)
    return
  }

  const result = await gateway.execute(manifest, gateway.confirm(manifest, { method: 'voice', transcript: manifest.confirmation_phrase }))
  const draft = await readFile(join(churchRoot, manifest.target_path), 'utf8')
  const pass = result.ok && result.not_sent && draft.includes('Status: NOT SENT - local draft only.') && draft.includes(intent)
  await writeEvidence(EXTERNAL_SEND_EVIDENCE, [
    'fixture: temporary Church fixture',
    `manifest: ${manifest.id}`,
    `target: ${manifest.target_path}`,
    'External action: NOT SENT',
    '',
    draft,
  ].join('\n'))

  if (!pass) {
    process.exitCode = 1
    console.log('FAIL external send draft-only smoke')
    return
  }

  console.log(`PASS external send converted to local draft only. NOT SENT. ${manifest.target_path}`)
  console.log(`Evidence: ${EXTERNAL_SEND_EVIDENCE}`)
}

async function runDelegationUnavailableSmoke() {
  let spawned = 0
  const gateway = new DelegationGateway({
    healthChecker: { isAvailable: async () => false },
    processRunner: { run: () => {
      spawned += 1
      return { completed: Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }), cancel: () => undefined }
    } },
    setStatus: () => undefined,
  })
  const result = await gateway.delegate({
    parentVoiceTurnId: 'smoke-turn',
    promptSummary: 'Bounded smoke summary only.',
    model: 'opencode/glm-5.1',
    profile: 'standard',
    costBudgetCents: 25,
  })
  const pass = !result.accepted && spawned === 0 && result.job.status === 'degraded_unavailable' && result.queue.degraded
  await writeEvidence(DELEGATION_UNAVAILABLE_EVIDENCE, [
    'Scenario: OpenCode unavailable smoke',
    `spawned: ${spawned}`,
    `accepted: ${result.accepted}`,
    `status: ${result.job.status}`,
    `degraded: ${result.queue.degraded}`,
    `summary: ${result.job.finalSummary}`,
  ].join('\n'))
  if (!pass) {
    process.exitCode = 1
    console.log('FAIL delegation unavailable smoke')
    return
  }
  console.log('PASS delegation unavailable smoke without spawning OpenCode')
  console.log(`Evidence: ${DELEGATION_UNAVAILABLE_EVIDENCE}`)
}

async function createChurchSmokeFixture(): Promise<string> {
  const churchRoot = await mkdtemp(join(tmpdir(), 'epsilon-voice-smoke-church-'))
  await mkdir(join(churchRoot, 'tasks'), { recursive: true })
  await mkdir(join(churchRoot, 'projects', 'epsilon-voice-interface', 'drafts'), { recursive: true })
  await writeFile(join(churchRoot, 'inbox.md'), '')
  await writeFile(join(churchRoot, 'tasks', 'today.md'), '')
  await writeFile(join(churchRoot, 'tasks', 'upcoming.md'), '')
  await writeFile(join(churchRoot, 'projects', 'epsilon-voice-interface', 'notes.md'), '')
  return churchRoot
}

async function writeEvidence(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${content.trimEnd()}\n`, 'utf8')
}

function readArgumentValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

if (process.argv.includes('--states')) {
  runStateSmoke()
} else if (process.argv.includes('--ptt-latency') && process.argv.includes('--mock-realtime')) {
  await runPttLatencySmoke()
} else if (process.argv.includes('--manifest-capture')) {
  await runManifestCaptureSmoke(readArgumentValue('--manifest-capture') ?? '', process.argv.includes('--confirm'))
} else if (process.argv.includes('--external-send')) {
  await runExternalSendDraftSmoke(readArgumentValue('--external-send') ?? '', process.argv.includes('--confirm'))
} else if (process.argv.includes('--delegation-unavailable')) {
  await runDelegationUnavailableSmoke()
} else {
  console.log('Usage: npm run smoke -- --states')
  console.log('Usage: npm run smoke -- --ptt-latency --mock-realtime')
  console.log('Usage: npm run smoke -- --manifest-capture "Buy oat milk" --confirm')
  console.log('Usage: npm run smoke -- --external-send "email Alex hello" --confirm')
  console.log('Usage: npm run smoke -- --delegation-unavailable')
}
