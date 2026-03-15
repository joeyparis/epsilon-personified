import './style.css'

interface EyeParams {
  w: number
  h: number
  radius: number
  tired: number
  angry: number
  happy: number
}

interface MoodDef {
  left: EyeParams
  right: EyeParams
}

function sym(p: EyeParams): MoodDef {
  return { left: p, right: p }
}

const MOODS: Record<string, MoodDef> = {
  default:  sym({ w: 1,    h: 1,    radius: 0.25, tired: 0,   angry: 0,   happy: 0 }),
  happy:    sym({ w: 1,    h: 1,    radius: 0.25, tired: 0,   angry: 0,   happy: 1 }),
  excited:  sym({ w: 1.15, h: 1.2,  radius: 0.25, tired: 0,   angry: 0,   happy: 0 }),
  angry: {
    left:  { w: 1,    h: 0.85, radius: 0.25, tired: 0,   angry: 1,   happy: 0 },
    right: { w: 1,    h: 0.85, radius: 0.25, tired: 0,   angry: 1,   happy: 0 },
  },
  tired:    sym({ w: 1,    h: 0.8,  radius: 0.25, tired: 1,   angry: 0,   happy: 0 }),
  sad: {
    left:  { w: 1,    h: 0.85, radius: 0.25, tired: 0.5, angry: 0,   happy: 0 },
    right: { w: 1,    h: 0.85, radius: 0.25, tired: 0.5, angry: 0,   happy: 0 },
  },
  shocked:  sym({ w: 0.75, h: 1.4,  radius: 0.35, tired: 0,   angry: 0,   happy: 0 }),
  thinking: {
    left:  { w: 0.9,  h: 0.85, radius: 0.25, tired: 0.3, angry: 0,   happy: 0 },
    right: { w: 1.05, h: 1.1,  radius: 0.25, tired: 0,   angry: 0,   happy: 0 },
  },
  curious: {
    left:  { w: 0.85, h: 0.85, radius: 0.25, tired: 0,   angry: 0,   happy: 0 },
    right: { w: 1.15, h: 1.15, radius: 0.25, tired: 0,   angry: 0,   happy: 0 },
  },
  blink:    sym({ w: 1.05, h: 0.008, radius: 0.5,  tired: 0,   angry: 0,   happy: 0 }),
}

type Mood = keyof typeof MOODS

const MOOD_NAMES = Object.keys(MOODS) as Mood[]

interface AnimatedEye {
  w: number
  h: number
  radius: number
  tired: number
  angry: number
  happy: number
  gaze_x: number
  gaze_y: number
}

function default_eye(): AnimatedEye {
  return { w: 1, h: 1, radius: 0.25, tired: 0, angry: 0, happy: 0, gaze_x: 0, gaze_y: 0 }
}

const EYE_COLOR = '#4FD8FF'
const GLOW_COLOR = 'rgba(80, 220, 255, 0.6)'
const BG_COLOR = '#000000'
const BASE_EYE_W = 80
const BASE_EYE_H = 80
const EYE_GAP = 20
const GAZE_RANGE = 55
const LERP_SPEED = 8

const canvas = document.getElementById('eyes') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const status_el = document.getElementById('status-bar')

let current_mood: Mood = 'default'
let left = default_eye()
let right = default_eye()

let target_gaze_x = 0
let target_gaze_y = 0

let is_talking = false
let talk_phase = 0

let blink_active = false
let blink_timer = 0
let blink_cooldown = rand_range(3500, 7000)

let idle_gaze_active = true
let idle_gaze_timer = 0
let idle_gaze_cooldown = rand_range(3000, 6000)

let curiosity_mode = false
let ws: WebSocket | null = null
;(window as unknown as Record<string, unknown>).epsilon = {
  say: (text: string, voice?: string) => ws?.send(JSON.stringify({ type: 'say', text, voice })),
  speak: (text: string) => handle_command({ type: 'speak', text }),
  speakAudio: (base64: string) => handle_command({ type: 'speak', audio: base64 }),
  stop: () => { stop_speaking(); ws?.send(JSON.stringify({ type: 'stop_speaking' })) },
  mood: (value: string) => handle_command({ type: 'expression', value }),
  gaze: (x: number, y: number) => handle_command({ type: 'gaze', x, y }),
  talk: (active: boolean) => handle_command({ type: 'talk', active }),
  reset: () => handle_command({ type: 'reset' }),
  get ws() { return ws },
}
let last_time = performance.now()

let mic_active = false
let audio_ctx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let mic_stream: MediaStream | null = null
let smoothed_amplitude = 0

let tts_playing = false
let tts_source_node: AudioBufferSourceNode | null = null
const audio_queue: ArrayBuffer[] = []
let queue_playing = false
const TTS_PLAYBACK_RATE = 1.25
const NOISE_GATE = 0.012
const ATTACK = 0.55
const RELEASE = 0.12
const TALK_GAIN = 2.5
const TALK_CURVE = 0.7
const MIC_TALK_THRESHOLD = 0.05

function rand_range(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function set_status(text: string) {
  if (status_el) status_el.textContent = text
}

const analyser_buffer = new Uint8Array(2048)

function compute_amplitude(): number {
  if (!analyser) return 0
  analyser.getByteTimeDomainData(analyser_buffer)
  let sum = 0
  for (let i = 0; i < analyser_buffer.length; i++) {
    const sample = (analyser_buffer[i]! - 128) / 128
    sum += sample * sample
  }
  const rms = Math.sqrt(sum / analyser_buffer.length)
  const gated = rms < NOISE_GATE ? 0 : rms
  const shaped = Math.pow(gated * TALK_GAIN, TALK_CURVE)
  return Math.min(shaped, 1)
}

function smooth_amplitude(raw: number, dt_s: number) {
  const lambda = raw > smoothed_amplitude ? ATTACK : RELEASE
  smoothed_amplitude += (raw - smoothed_amplitude) * (1 - Math.exp(-lambda / dt_s))
}

async function ensure_audio() {
  if (!audio_ctx) {
    audio_ctx = new AudioContext()
    analyser = audio_ctx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0
  }
  if (audio_ctx.state === 'suspended') {
    await audio_ctx.resume()
  }
}

function base64_to_buffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

async function toggle_mic() {
  if (mic_active) {
    mic_active = false
    mic_stream?.getTracks().forEach(t => t.stop())
    mic_stream = null
    is_talking = false
    smoothed_amplitude = 0
    return
  }

  try {
    await ensure_audio()
    mic_stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const source = audio_ctx!.createMediaStreamSource(mic_stream)
    source.connect(analyser!)
    mic_active = true
  } catch {
    set_status('[mic] access denied or unavailable')
    mic_active = false
  }
}

function queue_audio(data: ArrayBuffer) {
  audio_queue.push(data)
  if (!queue_playing) play_next()
}

async function play_next() {
  if (audio_queue.length === 0) {
    queue_playing = false
    tts_playing = false
    tts_source_node = null
    is_talking = false
    smoothed_amplitude = 0
    return
  }

  queue_playing = true
  tts_playing = true
  is_talking = true

  await ensure_audio()
  const data = audio_queue.shift()!
  const buffer = await audio_ctx!.decodeAudioData(data)
  tts_source_node = audio_ctx!.createBufferSource()
  tts_source_node.buffer = buffer
  tts_source_node.playbackRate.value = TTS_PLAYBACK_RATE
  tts_source_node.connect(analyser!)              // amplitude analysis
  tts_source_node.connect(audio_ctx!.destination)  // play through speakers
  tts_source_node.onended = () => play_next()
  tts_source_node.start()
}

async function speak_audio(data: ArrayBuffer) {
  stop_speaking()
  queue_audio(data)
}

function speak_text(text: string) {
  stop_speaking()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.onstart = () => { is_talking = true }
  utterance.onend = () => { is_talking = false }
  speechSynthesis.speak(utterance)
}

function stop_speaking() {
  audio_queue.length = 0
  queue_playing = false
  if (tts_source_node) {
    try { tts_source_node.stop() } catch { /* already stopped */ }
    tts_source_node.disconnect()
    tts_source_node = null
  }
  speechSynthesis.cancel()
  tts_playing = false
  if (!mic_active) {
    is_talking = false
    smoothed_amplitude = 0
  }
}

function resize() {
  canvas.width = window.innerWidth * devicePixelRatio
  canvas.height = window.innerHeight * devicePixelRatio
  canvas.style.width = `${window.innerWidth}px`
  canvas.style.height = `${window.innerHeight}px`
}

window.addEventListener('resize', resize)
resize()

function fill_rounded_rect(x: number, y: number, w: number, h: number, r: number) {
  if (h < 1) h = 1
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
  ctx.fill()
}

function fill_triangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.lineTo(x3, y3)
  ctx.closePath()
  ctx.fill()
}

function draw_eye(cx: number, cy: number, eye: AnimatedEye, mirror: boolean, scale: number) {
  const w = BASE_EYE_W * eye.w * scale
  const h = Math.max(BASE_EYE_H * eye.h * scale, 1)
  const r = Math.min(w / 2, h / 2) * eye.radius

  const gx = eye.gaze_x * GAZE_RANGE * scale
  const gy = eye.gaze_y * GAZE_RANGE * scale

  ctx.save()
  ctx.translate(cx + gx, cy + gy)

  ctx.shadowColor = GLOW_COLOR
  ctx.shadowBlur = 4 * scale
  ctx.fillStyle = EYE_COLOR
  fill_rounded_rect(-w / 2, -h / 2, w, h, r)
  ctx.shadowBlur = 0

  const pad = 2 * scale

  if (eye.tired > 0.005) {
    const lid_h = h / 2 * eye.tired
    ctx.fillStyle = BG_COLOR
    const droop_x = mirror ? w / 2 + pad : -w / 2 - pad
    fill_triangle(-w / 2 - pad, -h / 2 - pad, w / 2 + pad, -h / 2 - pad, droop_x, -h / 2 + lid_h)
  }

  if (eye.angry > 0.005) {
    const lid_h = h / 2 * eye.angry
    ctx.fillStyle = BG_COLOR
    const droop_x = mirror ? -w / 2 - pad : w / 2 + pad
    fill_triangle(-w / 2 - pad, -h / 2 - pad, w / 2 + pad, -h / 2 - pad, droop_x, -h / 2 + lid_h)
  }

  if (eye.happy > 0.005) {
    const offset = (h / 2 + 3 * scale) * eye.happy
    ctx.fillStyle = BG_COLOR
    fill_rounded_rect(-w / 2 - pad, h / 2 - offset + pad, w + pad * 2, h, r)
  }

  ctx.restore()
}

function render() {
  const dpr = devicePixelRatio
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const vw = canvas.width / dpr
  const vh = canvas.height / dpr
  const scale = Math.min(vw, vh) / 400 * dpr

  const center_x = canvas.width / 2
  const center_y = canvas.height / 2

  const half_gap = (EYE_GAP / 2) * scale
  const eye_w_scaled = BASE_EYE_W * scale

  draw_eye(center_x - half_gap - eye_w_scaled * 0.5, center_y, left, false, scale)
  draw_eye(center_x + half_gap + eye_w_scaled * 0.5, center_y, right, true, scale)

  const buf = 12 * scale
  const gaze_px = GAZE_RANGE * scale
  const eye_h_scaled = BASE_EYE_H * scale
  const bounds_l = center_x - half_gap - eye_w_scaled - gaze_px - buf
  const bounds_r = center_x + half_gap + eye_w_scaled + gaze_px + buf
  const bounds_t = center_y - eye_h_scaled / 2 - gaze_px - buf
  const bounds_b = center_y + eye_h_scaled / 2 + gaze_px + buf
  ctx.strokeStyle = 'rgba(80, 220, 255, 0.30)'
  ctx.lineWidth = 1
  ctx.strokeRect(bounds_l, bounds_t, bounds_r - bounds_l, bounds_b - bounds_t)
}

function update() {
  const now = performance.now()
  const dt_s = Math.min((now - last_time) / 1000, 0.1)
  last_time = now

  const speed = blink_active ? LERP_SPEED * 4 : LERP_SPEED
  const t = 1 - Math.exp(-speed * dt_s)

  const mood_def = blink_active ? MOODS['blink']! : MOODS[current_mood]!
  const tl = mood_def.left
  const tr = mood_def.right

  left.w = lerp(left.w, tl.w, t)
  left.h = lerp(left.h, tl.h, t)
  left.radius = lerp(left.radius, tl.radius, t)
  left.tired = lerp(left.tired, tl.tired, t)
  left.angry = lerp(left.angry, tl.angry, t)
  left.happy = lerp(left.happy, tl.happy, t)

  right.w = lerp(right.w, tr.w, t)
  right.h = lerp(right.h, tr.h, t)
  right.radius = lerp(right.radius, tr.radius, t)
  right.tired = lerp(right.tired, tr.tired, t)
  right.angry = lerp(right.angry, tr.angry, t)
  right.happy = lerp(right.happy, tr.happy, t)

  left.gaze_x = lerp(left.gaze_x, target_gaze_x, t * 0.7)
  left.gaze_y = lerp(left.gaze_y, target_gaze_y, t * 0.7)
  right.gaze_x = lerp(right.gaze_x, target_gaze_x, t * 0.7)
  right.gaze_y = lerp(right.gaze_y, target_gaze_y, t * 0.7)

  if (curiosity_mode) {
    const diff = Math.abs(target_gaze_x)
    const grow = 1 + diff * 0.15
    const shrink = 1 - diff * 0.08
    if (target_gaze_x > 0.1) {
      right.w = lerp(right.w, right.w * grow, t)
      right.h = lerp(right.h, right.h * grow, t)
      left.w = lerp(left.w, left.w * shrink, t)
    } else if (target_gaze_x < -0.1) {
      left.w = lerp(left.w, left.w * grow, t)
      left.h = lerp(left.h, left.h * grow, t)
      right.w = lerp(right.w, right.w * shrink, t)
    }
  }

  blink_timer += dt_s * 1000
  if (!blink_active && blink_timer >= blink_cooldown) {
    blink_active = true
    blink_timer = 0
    blink_cooldown = rand_range(3500, 7000)
    setTimeout(() => { blink_active = false }, 140)
  }

  if (idle_gaze_active && !is_talking) {
    idle_gaze_timer += dt_s * 1000
    if (idle_gaze_timer >= idle_gaze_cooldown) {
      idle_gaze_timer = 0
      idle_gaze_cooldown = rand_range(3000, 6000)
      if (Math.random() < 0.75) {
        target_gaze_x = rand_range(-1, 1)
        target_gaze_y = rand_range(-0.6, 0.6)
        setTimeout(() => {
          if (idle_gaze_active && !is_talking) {
            target_gaze_x = rand_range(-0.15, 0.15)
            target_gaze_y = rand_range(-0.1, 0.1)
          }
        }, rand_range(800, 2500))
      }
    }
  }

  if (mic_active || tts_playing) {
    const raw = compute_amplitude()
    smooth_amplitude(raw, dt_s)
    if (mic_active) {
      is_talking = smoothed_amplitude > MIC_TALK_THRESHOLD
    }
    if (is_talking) {
      const talk_scale = 1 + smoothed_amplitude * 0.05
      left.h *= talk_scale
      right.h *= talk_scale
      left.w *= 1 + smoothed_amplitude * 0.015
      right.w *= 1 + smoothed_amplitude * 0.015
    }
  } else if (is_talking) {
    talk_phase += dt_s * 9
    const pulse = 0.5 + 0.5 * Math.sin(talk_phase * 2.3) * Math.sin(talk_phase * 1.1)
    const talk_scale = 1 + pulse * 0.08
    left.h = Math.min(left.h * talk_scale, 1.35)
    right.h = Math.min(right.h * talk_scale, 1.35)
  }

  if (mic_active || tts_playing) sync_controls()

  render()
  requestAnimationFrame(update)
}

function start_talking() { is_talking = true; talk_phase = 0 }
function stop_talking() { is_talking = false }

const ws_proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
const ws_url = new URLSearchParams(window.location.search).get('ws')
  || `${ws_proto}://${window.location.hostname}:${window.location.port}/ws`

function send_status() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({ type: 'status', mood: current_mood, talking: is_talking, tts: tts_playing, idle_gaze: idle_gaze_active, curiosity: curiosity_mode }))
}

function handle_command(cmd: Record<string, unknown>) {
  switch (cmd['type']) {
    case 'expression':
    case 'mood':
      if (typeof cmd['value'] === 'string' && cmd['value'] in MOODS) {
        current_mood = cmd['value'] as Mood
      }
      break
    case 'gaze':
      if (typeof cmd['x'] === 'number' && typeof cmd['y'] === 'number') {
        target_gaze_x = cmd['x'] * 2 - 1
        target_gaze_y = cmd['y'] * 2 - 1
      }
      break
    case 'mic':
      if (Boolean(cmd['active']) !== mic_active) toggle_mic()
      break
    case 'talk':
      if (!mic_active) { if (cmd['active']) start_talking(); else stop_talking() }
      break
    case 'speak':
      if (cmd['stop']) {
        stop_speaking()
      } else if (typeof cmd['audio'] === 'string') {
        speak_audio(base64_to_buffer(cmd['audio'] as string))
      } else if (typeof cmd['text'] === 'string') {
        speak_text(cmd['text'] as string)
      }
      break
    case 'stop_speaking':
      stop_speaking()
      break
    case 'say_started':
      stop_speaking()
      break
    case 'say_done':
      break
    case 'idle':
      idle_gaze_active = Boolean(cmd['active'])
      break
    case 'curiosity':
      curiosity_mode = Boolean(cmd['active'])
      break
    case 'reset':
      if (mic_active) toggle_mic()
      stop_talking()
      current_mood = 'default'
      target_gaze_x = 0
      target_gaze_y = 0
      idle_gaze_active = true
      break
  }
  send_status()
}

function connect_ws() {
  try {
    ws = new WebSocket(ws_url)
    ws.binaryType = 'arraybuffer'
    ws.addEventListener('open', () => { set_status(`[ws] connected`); send_status() })
    ws.addEventListener('message', (e) => {
      if (e.data instanceof ArrayBuffer) {
        queue_audio(e.data)
        return
      }
      try { handle_command(JSON.parse(String(e.data)) as Record<string, unknown>) }
      catch { }
    })
    ws.addEventListener('close', () => { set_status('[ws] reconnecting...'); setTimeout(connect_ws, 3000) })
    ws.addEventListener('error', () => { ws?.close() })
  } catch { setTimeout(connect_ws, 3000) }
}

const VISIBLE_MOODS = MOOD_NAMES.filter(m => m !== 'blink')

const KEY_MAP: Record<string, Mood> = {
  '1': 'default', '2': 'happy', '3': 'excited', '4': 'thinking',
  '5': 'tired', '6': 'angry', '7': 'sad', '8': 'shocked', '9': 'curious',
}

function build_controls() {
  const bar = document.createElement('div')
  bar.id = 'controls'

  const zone = document.createElement('div')
  zone.id = 'hover-zone'
  zone.addEventListener('mouseenter', () => { bar.classList.add('visible') })
  zone.addEventListener('mouseleave', () => { bar.classList.remove('visible') })
  bar.addEventListener('mouseenter', () => { bar.classList.add('visible') })
  bar.addEventListener('mouseleave', () => { bar.classList.remove('visible') })

  const mood_buttons: Record<string, HTMLButtonElement> = {}

  for (const mood of VISIBLE_MOODS) {
    const btn = document.createElement('button')
    btn.textContent = mood
    btn.dataset['mood'] = mood
    btn.addEventListener('click', () => {
      current_mood = mood
      sync_controls()
    })
    mood_buttons[mood] = btn
    bar.appendChild(btn)
  }

  bar.appendChild(make_separator())

  const mic_btn = document.createElement('button')
  mic_btn.textContent = 'mic'
  mic_btn.addEventListener('click', async () => {
    await toggle_mic()
    sync_controls()
  })
  bar.appendChild(mic_btn)

  const talk_btn = document.createElement('button')
  talk_btn.textContent = 'talk'
  talk_btn.addEventListener('click', () => {
    if (mic_active) return
    is_talking ? stop_talking() : start_talking()
    sync_controls()
  })
  bar.appendChild(talk_btn)

  const gaze_btn = document.createElement('button')
  gaze_btn.textContent = 'gaze'
  gaze_btn.addEventListener('click', () => {
    idle_gaze_active = !idle_gaze_active
    sync_controls()
  })
  bar.appendChild(gaze_btn)

  bar.appendChild(make_separator())

  const reset_btn = document.createElement('button')
  reset_btn.textContent = 'reset'
  reset_btn.addEventListener('click', () => {
    handle_command({ type: 'reset' })
    sync_controls()
  })
  bar.appendChild(reset_btn)

  document.body.appendChild(zone)
  document.body.appendChild(bar)

  function sync() {
    for (const [mood, btn] of Object.entries(mood_buttons)) {
      btn.classList.toggle('active', mood === current_mood)
    }
    mic_btn.classList.toggle('active', mic_active)
    mic_btn.textContent = mic_active ? 'mic ●' : 'mic'
    talk_btn.classList.toggle('active', is_talking)
    talk_btn.textContent = tts_playing ? 'speaking ●' : (is_talking && !mic_active ? 'talk ●' : 'talk')
    talk_btn.disabled = mic_active || tts_playing
    gaze_btn.classList.toggle('active', idle_gaze_active)
    gaze_btn.textContent = idle_gaze_active ? 'gaze ●' : 'gaze'
  }

  return sync
}

function make_separator(): HTMLDivElement {
  const sep = document.createElement('div')
  sep.className = 'separator'
  return sep
}

const sync_controls = build_controls()

document.addEventListener('keydown', (e) => {
  const mapped = KEY_MAP[e.key]
  if (mapped) { current_mood = mapped; sync_controls(); return }
  if (e.key === 'm') { toggle_mic().then(sync_controls) }
  if (e.key === 't' && !mic_active) { is_talking ? stop_talking() : start_talking(); sync_controls() }
  if (e.key === 'g') { idle_gaze_active = !idle_gaze_active; sync_controls() }
  if (e.key === 'r') { handle_command({ type: 'reset' }); sync_controls() }
})

sync_controls()
connect_ws()
requestAnimationFrame(update)
