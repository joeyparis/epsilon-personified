import './style.css'
import { REQUIRED_APP_STATES, type StatusSnapshot } from '../shared/state.js'
import { STATE_PRESENTATION } from '../shared/presentation.js'

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
    if (!state) return
    window.epsilonVoice.setState(state as Parameters<typeof window.epsilonVoice.setState>[0]).then(renderStatus)
  })
}

window.epsilonVoice.onStatusUpdate(renderStatus)
window.epsilonVoice.getStatus().then(renderStatus)
