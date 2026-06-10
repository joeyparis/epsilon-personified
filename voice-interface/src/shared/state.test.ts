import { describe, expect, it } from 'vitest'
import { AppState, REQUIRED_APP_STATES, isAppState } from './state.js'

describe('AppState', () => {
  it('includes exactly the required application shell states', () => {
    expect(REQUIRED_APP_STATES).toEqual([
      'idle',
      'listening',
      'thinking',
      'speaking',
      'confirming',
      'delegated',
      'degraded',
      'error',
    ])
    expect(new Set(Object.values(AppState))).toEqual(new Set(REQUIRED_APP_STATES))
  })

  it('rejects states outside the shell contract', () => {
    expect(isAppState('idle')).toBe(true)
    expect(isAppState('recording')).toBe(false)
    expect(isAppState(undefined)).toBe(false)
  })
})
