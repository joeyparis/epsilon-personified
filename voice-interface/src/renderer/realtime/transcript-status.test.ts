import { describe, expect, it } from 'vitest'
import { formatInputTranscriptStatus } from './transcript-status.js'

describe('formatInputTranscriptStatus', () => {
  it('formats partial and final input transcript feedback for transient display', () => {
    expect(formatInputTranscriptStatus({ text: ' turn   on ', final: false })).toBe('Hearing: turn on')
    expect(formatInputTranscriptStatus({ text: 'turn on the office lights', final: true })).toBe('Heard: turn on the office lights')
  })

  it('clips long transcript feedback before rendering it in the shell', () => {
    const formatted = formatInputTranscriptStatus({ text: 'word '.repeat(80), final: true })

    expect(formatted).toMatch(/^Heard: /)
    expect(formatted.length).toBeLessThanOrEqual(167)
    expect(formatted).toContain('...')
  })
})
