import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS } from '../shared/ipc.js'
import { triggerPushToTalkHotkey, type PushToTalkHotkeyWindow } from './ptt-hotkey.js'

function createWindow(visible: boolean) {
  const sentChannels: string[] = []
  let focused = false
  let shown = false
  const window: PushToTalkHotkeyWindow = {
    isVisible: () => visible,
    show: () => {
      shown = true
      visible = true
    },
    focus: () => {
      focused = true
    },
    webContents: {
      send: (channel) => {
        sentChannels.push(channel)
      },
    },
  }
  return {
    window,
    get focused() {
      return focused
    },
    get shown() {
      return shown
    },
    sentChannels,
  }
}

describe('triggerPushToTalkHotkey', () => {
  it('reveals the status window and sends the renderer PTT hotkey event', () => {
    const fake = createWindow(false)

    triggerPushToTalkHotkey(fake.window, (window) => window.show())

    expect(fake.shown).toBe(true)
    expect(fake.focused).toBe(true)
    expect(fake.sentChannels).toEqual([IPC_CHANNELS.PUSH_TO_TALK_HOTKEY])
  })

  it('does nothing when the status window has not been created', () => {
    expect(() => triggerPushToTalkHotkey(null, () => undefined)).not.toThrow()
  })
})
