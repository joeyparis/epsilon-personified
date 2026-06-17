import { describe, expect, it } from 'vitest'
import { AppState } from '../shared/state.js'
import { createStatusStore } from './status-store.js'
import { registerVoiceHotkey, type GlobalShortcutLike } from './hotkey.js'

describe('registerVoiceHotkey', () => {
  it('registers the supplied press handler for the global voice shortcut', () => {
    const statusStore = createStatusStore()
    let registeredCallback: (() => void) | undefined
    let pressCount = 0
    const shortcut: GlobalShortcutLike = {
      register: (_accelerator, callback) => {
        registeredCallback = callback
        return true
      },
      unregisterAll: () => undefined,
    }

    const result = registerVoiceHotkey(shortcut, statusStore, () => {
      pressCount += 1
    })
    registeredCallback?.()

    expect(result.registered).toBe(true)
    expect(result.snapshot.state).toBe(AppState.Idle)
    expect(pressCount).toBe(1)
  })

  it('enters degraded state with an actionable message when registration returns false', () => {
    const statusStore = createStatusStore()
    const shortcut: GlobalShortcutLike = {
      register: () => false,
      unregisterAll: () => undefined,
    }

    const result = registerVoiceHotkey(shortcut, statusStore, () => undefined)

    expect(result.registered).toBe(false)
    expect(result.snapshot.state).toBe(AppState.Degraded)
    expect(result.snapshot.message).toContain('CommandOrControl+Shift+Space is unavailable')
    expect(result.snapshot.message).toContain('conflicting shortcut')
  })

  it('enters error state without throwing when registration throws', () => {
    const statusStore = createStatusStore()
    const shortcut: GlobalShortcutLike = {
      register: () => {
        throw new Error('desktop portal denied registration')
      },
      unregisterAll: () => undefined,
    }

    const result = registerVoiceHotkey(shortcut, statusStore, () => undefined)

    expect(result.registered).toBe(false)
    expect(result.snapshot.state).toBe(AppState.Error)
    expect(result.snapshot.detail).toBe('desktop portal denied registration')
  })
})
