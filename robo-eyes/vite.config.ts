import { defineConfig } from 'vite'
import type { ViteDevServer } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

/**
 * Vite plugin that adds a WebSocket relay endpoint at /ws on the dev server.
 *
 * Both the face display (browser) and the AI agent connect to ws://localhost:PORT/ws.
 * Messages from any client are broadcast to all *other* clients, so the agent can
 * send expression/gaze/talk commands and the face window receives them.
 *
 * Protocol (JSON):
 *   { "type": "expression", "value": "happy" }
 *   { "type": "gaze", "x": 0.7, "y": 0.5 }
 *   { "type": "talk", "active": true }
 *   { "type": "say", "text": "Hello world" }    — TTS relay converts to audio
 *   { "type": "say_started", "chunks": 2 }      — relay signals chunk count
 *   { "type": "say_done" }                       — relay signals completion
 *   { "type": "speak", "audio": "<base64>" }     — direct audio (no relay needed)
 *   { "type": "speak", "text": "Hello world" }   — browser SpeechSynthesis fallback
 *   { "type": "speak", "stop": true }
 *   { "type": "stop_speaking" }
 *   { "type": "idle", "active": true }
 *   { "type": "curiosity", "active": true }
 *   { "type": "reset" }
 *
 *   Binary WebSocket frames are treated as raw audio data to speak.
 */
function epsilonWsPlugin() {
  return {
    name: 'epsilon-ws-control',
    configureServer(server: ViteDevServer) {
      import('ws').then(({ WebSocketServer, WebSocket: WS }) => {
        const wss = new WebSocketServer({ noServer: true })

        server.httpServer?.on('upgrade', (req, socket, head) => {
          if (req.url === '/ws') {
            wss.handleUpgrade(req, socket, head, (ws) => {
              wss.emit('connection', ws, req)
            })
          }
        })

        wss.on('connection', (ws) => {
          console.log('[Epsilon WS] Client connected')

          ws.on('message', (data, isBinary) => {
            for (const client of wss.clients) {
              if (client !== ws && client.readyState === WS.OPEN) {
                client.send(data, { binary: isBinary })
              }
            }
          })

          ws.on('close', () => {
            console.log('[Epsilon WS] Client disconnected')
          })
        })
      }).catch(() => {
        console.warn('[Epsilon WS] ws module not available — WebSocket relay disabled')
      })
    },
  }
}

export default defineConfig({
  plugins: [basicSsl(), epsilonWsPlugin()],
  server: {
    port: 5174,
  },
})
