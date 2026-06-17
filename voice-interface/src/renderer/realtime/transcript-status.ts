const MAX_TRANSCRIPT_STATUS_LENGTH = 160

export interface TranscriptStatusInput {
  text: string
  final: boolean
}

export function formatInputTranscriptStatus(input: TranscriptStatusInput) {
  const text = input.text.replace(/\s+/g, ' ').trim()
  if (!text) return ''

  const clipped = text.length > MAX_TRANSCRIPT_STATUS_LENGTH
    ? `${text.slice(0, MAX_TRANSCRIPT_STATUS_LENGTH - 3)}...`
    : text
  return `${input.final ? 'Heard' : 'Hearing'}: ${clipped}`
}
