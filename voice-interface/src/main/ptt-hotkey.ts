import { IPC_CHANNELS } from '../shared/ipc.js'

export interface PushToTalkHotkeyWindow {
  isVisible: () => boolean
  show: () => void
  focus: () => void
  webContents: {
    send: (channel: string) => void
  }
}

export function triggerPushToTalkHotkey<WindowType extends PushToTalkHotkeyWindow>(statusWindow: WindowType | null, revealWindow: (window: WindowType) => void) {
  if (!statusWindow) return
  if (!statusWindow.isVisible()) revealWindow(statusWindow)

  statusWindow.focus()
  statusWindow.webContents.send(IPC_CHANNELS.PUSH_TO_TALK_HOTKEY)
}
