/// <reference types="vite/client" />

import type { EpsilonVoiceApi } from '../shared/ipc.js'

declare global {
  interface Window {
    epsilonVoice: EpsilonVoiceApi
  }
}
