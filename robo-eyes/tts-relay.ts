import WebSocket from 'ws'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
if (!OPENAI_API_KEY) {
  console.error('[tts-relay] OPENAI_API_KEY is required')
  process.exit(1)
}

const WS_URL = process.env.WS_URL || 'wss://localhost:5174/ws'
const VOICE = process.env.TTS_VOICE || 'onyx'
const MODEL = process.env.TTS_MODEL || 'gpt-4o-mini-tts'

const VOICE_INSTRUCTIONS = process.env.TTS_INSTRUCTIONS ||
  'Speak fast and clipped — rapid-fire delivery, no pauses, no lingering. ' +
  'Voice is robotic, crackly, and distorted like a cheap radio with static. ' +
  'Dripping with sarcasm and dry wit. Deadpan, never earnest. ' +
  'Every sentence sounds like you can\'t believe you have to explain this.'

let ws: WebSocket | null = null
let job_id = 0

function split_sentences(text: string): string[] {
  const chunks = text.match(/[^.!?\n]+[.!?\n]+/g)
  if (!chunks) return [text]
  const joined = chunks.join('')
  const leftover = text.slice(joined.length).trim()
  if (leftover) chunks.push(leftover)
  return chunks.map(s => s.trim()).filter(Boolean)
}

async function tts_chunk(text: string, voice: string): Promise<Buffer> {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, input: text, voice, instructions: VOICE_INSTRUCTIONS, response_format: 'mp3' }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`OpenAI TTS ${res.status}: ${body}`)
  }

  return Buffer.from(await res.arrayBuffer())
}

async function handle_say(text: string, voice?: string) {
  const current_job = ++job_id
  const sentences = split_sentences(text)

  console.log(`[tts-relay] say (${sentences.length} chunks): ${text.slice(0, 80)}${text.length > 80 ? '...' : ''}`)
  send_json({ type: 'say_started', chunks: sentences.length })

  const promises = sentences.map(s => tts_chunk(s, voice || VOICE))

  for (const promise of promises) {
    if (job_id !== current_job) return
    try {
      const audio = await promise
      if (job_id !== current_job) return
      ws?.send(audio)
    } catch (err) {
      console.error(`[tts-relay] chunk failed:`, err)
    }
  }

  if (job_id === current_job) {
    send_json({ type: 'say_done' })
  }
}

function send_json(msg: Record<string, unknown>) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

function connect() {
  console.log(`[tts-relay] connecting to ${WS_URL}`)
  ws = new WebSocket(WS_URL, { rejectUnauthorized: false })

  ws.on('open', () => {
    console.log(`[tts-relay] connected (voice=${VOICE}, model=${MODEL})`)
  })

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString())
      if (msg.type === 'say' && typeof msg.text === 'string') {
        handle_say(msg.text, msg.voice)
      }
    } catch { }
  })

  ws.on('close', () => {
    console.log('[tts-relay] disconnected, reconnecting in 3s...')
    setTimeout(connect, 3000)
  })

  ws.on('error', (err) => {
    console.error('[tts-relay] ws error:', err.message)
  })
}

connect()
