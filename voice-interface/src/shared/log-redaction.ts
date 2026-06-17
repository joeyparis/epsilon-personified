const REDACTION = '[REDACTED]'
const SENSITIVE_KEY_RE = /(api[_-]?key|authorization|bearer|token|secret|password|emailbody|messagebody|body|exact_diff_or_payload|transcript|rawaudio|raw_audio|audio|audiobuffer|payload|read_only_service_response|servicerawresponse|rawresponse|serviceresponse|manifest|attachmenttext|extractedtext|ocrtext|rawattachment|documenttext|scanneremailbody)/i
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{12,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /xox[baprs]-[A-Za-z0-9-]{12,}/g,
  /gh[pousr]_[A-Za-z0-9_]{12,}/g,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
] as const

export function redactForLog(value: unknown): unknown {
  if (typeof value === 'string') return redactString(value)
  if (Array.isArray(value)) return value.map((entry) => redactForLog(entry))
  if (!isRecord(value)) return value

  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if (SENSITIVE_KEY_RE.test(key)) return [key, REDACTION]
    return [key, redactForLog(entry)]
  }))
}

export function safeLogLine(label: string, value: unknown): string {
  return `${label}: ${JSON.stringify(redactForLog(value))}`
}

function redactString(value: string) {
  return SECRET_PATTERNS.reduce((next, pattern) => next.replace(pattern, REDACTION), value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
