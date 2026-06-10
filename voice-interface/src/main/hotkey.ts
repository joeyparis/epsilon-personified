import { AppState, type StatusSnapshot } from '../shared/state.js'
import type { StatusStore } from './status-store.js'

export interface GlobalShortcutLike {
  register: (accelerator: string, callback: () => void) => boolean
  unregisterAll: () => void
}

export interface HotkeyRegistrationResult {
  registered: boolean
  snapshot: StatusSnapshot
}

export const DEFAULT_HOTKEY = 'CommandOrControl+Shift+Space'

export function registerVoiceHotkey(
  globalShortcut: GlobalShortcutLike,
  statusStore: StatusStore,
  onPressed: () => void,
  accelerator = DEFAULT_HOTKEY,
): HotkeyRegistrationResult {
  try {
    const registered = globalShortcut.register(accelerator, onPressed)
    if (!registered) {
      return {
        registered: false,
        snapshot: statusStore.setState(
          AppState.Degraded,
          `Global hotkey ${accelerator} is unavailable. Release the conflicting shortcut or choose another accelerator.`,
        ),
      }
    }

    return {
      registered: true,
      snapshot: statusStore.setState(AppState.Idle, `Global hotkey ${accelerator} is ready.`),
    }
  } catch (error) {
    return {
      registered: false,
      snapshot: statusStore.setState(
        AppState.Error,
        `Global hotkey ${accelerator} could not be registered. Check desktop shortcut permissions and retry.`,
        error instanceof Error ? error.message : String(error),
      ),
    }
  }
}
