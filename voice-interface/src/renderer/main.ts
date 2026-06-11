import './style.css'
import type { CapabilityManifest } from '../shared/capability-types.js'
import { REQUIRED_APP_STATES, isAppState, type StatusSnapshot } from '../shared/state.js'
import { STATE_PRESENTATION } from '../shared/presentation.js'
import { MockRealtimeClient, createMockRealtimeSession } from '../realtime/mock-client.js'
import type { RealtimeSessionMintResult } from '../realtime/types.js'
import { createPushToTalkController } from './audio/push-to-talk.js'
import { getEpsilonVoiceApi } from './voice-api.js'

const epsilonVoice = getEpsilonVoiceApi(window)
const appRoot = document.querySelector<HTMLDivElement>('#app')
if (!appRoot) throw new Error('Missing #app root')

appRoot.innerHTML = `
  <section class="shell" aria-label="Epsilon voice status">
    <header class="shell__header">
      <div>
        <p class="eyebrow">Epsilon Voice</p>
        <h1 id="state_label">Idle</h1>
      </div>
      <div class="orb" aria-hidden="true"><span></span></div>
    </header>

    <div class="status-card" data-tone="quiet">
      <p class="status-card__verb" id="state_verb">Standing by</p>
      <p class="status-card__message" id="state_message">Epsilon is ready from the menubar.</p>
      <p class="status-card__detail" id="state_detail"></p>
    </div>

    <section class="ptt-panel" aria-label="Push to talk controls">
      <div>
        <p class="ptt-panel__label">Push to talk</p>
        <p class="ptt-panel__status" id="ptt_status">Hold or toggle to start a mocked realtime turn.</p>
      </div>
      <div class="ptt-panel__actions">
        <button type="button" id="ptt_hold">Hold to talk</button>
        <button type="button" id="ptt_toggle" aria-pressed="false">Toggle talk</button>
      </div>
    </section>

    <section class="manifest-panel" aria-label="Capability confirmation">
      <div>
        <p class="manifest-panel__label">Manifest gateway</p>
        <p class="manifest-panel__status" id="manifest_status">No pending manifest.</p>
      </div>
      <pre id="manifest_payload">Prepared writes appear here before confirmation.</pre>
      <div class="manifest-panel__actions">
        <button type="button" id="manifest_prepare">Prepare sample draft</button>
        <button type="button" id="manifest_confirm" disabled>Confirm manifest</button>
        <button type="button" id="manifest_reject" disabled>Reject</button>
      </div>
    </section>

    <nav class="state-grid" aria-label="Preview states">
      ${REQUIRED_APP_STATES.map((state) => `<button type="button" data-state="${state}">${STATE_PRESENTATION[state].label}</button>`).join('')}
    </nav>

    <footer class="meta">
      <span>Shortcut</span>
      <strong>⌘/Ctrl Shift Space</strong>
    </footer>
  </section>
`

const labelEl = document.querySelector<HTMLHeadingElement>('#state_label')
const verbEl = document.querySelector<HTMLParagraphElement>('#state_verb')
const messageEl = document.querySelector<HTMLParagraphElement>('#state_message')
const detailEl = document.querySelector<HTMLParagraphElement>('#state_detail')
const statusCard = document.querySelector<HTMLElement>('.status-card')
const stateButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-state]')]
const holdButton = document.querySelector<HTMLButtonElement>('#ptt_hold')
const toggleButton = document.querySelector<HTMLButtonElement>('#ptt_toggle')
const pttStatusEl = document.querySelector<HTMLParagraphElement>('#ptt_status')
const manifestStatusEl = document.querySelector<HTMLParagraphElement>('#manifest_status')
const manifestPayloadEl = document.querySelector<HTMLPreElement>('#manifest_payload')
const manifestPrepareButton = document.querySelector<HTMLButtonElement>('#manifest_prepare')
const manifestConfirmButton = document.querySelector<HTMLButtonElement>('#manifest_confirm')
const manifestRejectButton = document.querySelector<HTMLButtonElement>('#manifest_reject')
let pendingManifest: CapabilityManifest | null = null

function renderStatus(snapshot: StatusSnapshot) {
  const presentation = STATE_PRESENTATION[snapshot.state]
  if (!labelEl || !verbEl || !messageEl || !detailEl || !statusCard) return

  labelEl.textContent = presentation.label
  verbEl.textContent = presentation.verb
  messageEl.textContent = snapshot.message || presentation.message
  detailEl.textContent = snapshot.detail ?? `Updated ${new Date(snapshot.updatedAt).toLocaleTimeString()}`
  statusCard.dataset.tone = presentation.tone
  appRoot?.setAttribute('data-state', snapshot.state)

  for (const button of stateButtons) {
    button.toggleAttribute('aria-current', button.dataset.state === snapshot.state)
  }
}

for (const button of stateButtons) {
  button.addEventListener('click', () => {
    const state = button.dataset.state
    if (!isAppState(state)) return
    epsilonVoice.setState(state).then(renderStatus)
  })
}

epsilonVoice.onStatusUpdate(renderStatus)
epsilonVoice.getStatus().then(renderStatus)


async function requestMockableRealtimeSession(): Promise<RealtimeSessionMintResult> {
  const sessionResult = await epsilonVoice.requestRealtimeSession()
  if (sessionResult.ok) return sessionResult
  await epsilonVoice.publishEvent({
    type: 'realtime.error',
    payload: { code: sessionResult.code, message: sessionResult.message, recoverable: sessionResult.recoverable },
    meta: { id: crypto.randomUUID(), createdAt: new Date().toISOString(), source: 'renderer' },
  })
  return { ok: true, session: createMockRealtimeSession('renderer-mock-realtime-session') }
}

const pttController = createPushToTalkController({
  realtimeClient: new MockRealtimeClient(),
  requestSession: requestMockableRealtimeSession,
  publishEvent: (event) => epsilonVoice.publishEvent(event),
  setState: (state, message, detail) => epsilonVoice.setState(state, detail ? `${message} ${detail}` : message),
  onSnapshot: (snapshot) => {
    if (!pttStatusEl) return
    const ackText = snapshot.ackMs === undefined ? '' : ` Ack ${snapshot.ackMs}ms.`
    pttStatusEl.textContent = `${snapshot.phase}${ackText}`
    toggleButton?.setAttribute('aria-pressed', String(snapshot.phase === 'listening' && snapshot.inputMode === 'toggle'))
  },
})

holdButton?.addEventListener('pointerdown', (event) => {
  event.preventDefault()
  holdButton.setPointerCapture(event.pointerId)
  void pttController.pressStart()
})
holdButton?.addEventListener('pointerup', (event) => {
  event.preventDefault()
  if (holdButton.hasPointerCapture(event.pointerId)) holdButton.releasePointerCapture(event.pointerId)
  void pttController.pressEnd()
})
holdButton?.addEventListener('pointercancel', () => {
  void pttController.interrupt('pointer-cancelled')
})
toggleButton?.addEventListener('click', () => {
  void pttController.toggle()
})

function renderManifest(manifest: CapabilityManifest | null, status: string) {
  pendingManifest = manifest
  if (manifestStatusEl) manifestStatusEl.textContent = status
  if (manifestPayloadEl) {
    manifestPayloadEl.textContent = manifest
      ? `${manifest.human_summary}\nTarget: ${manifest.target_path}\nHash: ${manifest.hash}\nPhrase: ${manifest.confirmation_phrase}\n\n${manifest.exact_diff_or_payload}`
      : 'Prepared writes appear here before confirmation.'
  }
  if (manifestConfirmButton) manifestConfirmButton.disabled = !manifest
  if (manifestRejectButton) manifestRejectButton.disabled = !manifest
}

manifestPrepareButton?.addEventListener('click', async () => {
  const manifest = await epsilonVoice.prepareCapabilityAction({
    action_type: 'local_draft_upsert',
    title: 'Browser Preview Draft',
    body: 'Draft content prepared for confirmation preview.',
    source_context_labels: ['renderer:manual-preview'],
  })
  renderManifest(manifest, 'Prepared. Nothing has been written yet.')
})

manifestConfirmButton?.addEventListener('click', async () => {
  if (!pendingManifest) return
  const confirmation = await epsilonVoice.confirmCapabilityManifest(pendingManifest, { method: 'click', accepted: true })
  const result = await epsilonVoice.executeCapabilityManifest(pendingManifest, confirmation)
  renderManifest(null, result.ok ? `Confirmed and executed locally. NOT SENT. ${result.target_path}` : `Blocked: ${result.reason}`)
})

manifestRejectButton?.addEventListener('click', async () => {
  if (!pendingManifest) return
  await epsilonVoice.confirmCapabilityManifest(pendingManifest, { method: 'click', accepted: false })
  renderManifest(null, 'Rejected. No write performed.')
})
