import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { MockRealtimeClient, createMockRealtimeSession } from '../realtime/mock-client.js'
import type { RealtimeSessionMintResult } from '../realtime/types.js'
import { createPushToTalkController, type PushToTalkClock } from '../renderer/audio/push-to-talk.js'
import { createSilentMicrophoneCaptureAdapter } from '../renderer/audio/microphone-capture.js'
import { REQUIRED_APP_STATES, type AppState } from '../shared/state.js'
import { STATE_PRESENTATION } from '../shared/presentation.js'

const PTT_LATENCY_EVIDENCE = '/Users/joey/Church/.omo/evidence/task-3-ptt-latency.json'

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

if (process.argv.includes('--states')) {
  runStateSmoke()
} else if (process.argv.includes('--ptt-latency') && process.argv.includes('--mock-realtime')) {
  await runPttLatencySmoke()
} else {
  console.log('Usage: npm run smoke -- --states')
  console.log('Usage: npm run smoke -- --ptt-latency --mock-realtime')
}
