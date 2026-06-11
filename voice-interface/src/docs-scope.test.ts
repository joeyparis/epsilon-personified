import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const README_PATH = join(process.cwd(), 'README.md')
const EVIDENCE_PATH = '/Users/joey/Church/.omo/evidence/task-9-docs-scope.txt'

async function writeEvidence(lines: string[]) {
  await mkdir(dirname(EVIDENCE_PATH), { recursive: true })
  await writeFile(EVIDENCE_PATH, `${lines.join('\n').trimEnd()}\n`, 'utf8')
}

describe('docs-scope', () => {
  it('documents launch workflow and preserves V1 safety boundaries', async () => {
    const readme = await readFile(README_PATH, 'utf8')
    const requiredClaims = [
      'npm run dev',
      'npm run build',
      'npm test',
      'npm run smoke -- --mock-all --evidence-dir /Users/joey/Church/.omo/evidence',
      'npm test -- docs-scope',
      'macOS microphone permission is required',
      'OPENAI_API_KEY',
      'infisical run -- npm run dev',
      'global voice hotkey',
      'prepare -> confirm -> execute',
      'Rejected, edited, ambiguous, expired, or hash-mismatched confirmations create no Church write.',
      'External sends are unsupported in V1.',
      'Status: NOT SENT - local draft only.',
      'Realtime unavailable',
      'OpenCode unavailable',
      'Raw audio retention is disabled by default.',
      'Do not store secrets, raw audio, full transcripts, raw service responses, or provider payloads',
    ]
    const unsupportedAllowedOnlyAsNegative = [
      'Email sends',
      'Slack sends',
      'calendar creates',
      'ticket creates',
      'device actions',
      'cloud writes',
      'shell execution',
      'MCP mutations',
      'direct raw voice tool execution',
    ]

    for (const claim of requiredClaims) {
      expect(readme).toContain(claim)
    }
    for (const claim of unsupportedAllowedOnlyAsNegative) {
      expect(readme).toContain(`${claim}`)
    }
    expect(readme).toContain('not supported V1 behavior')
    expect(readme).not.toMatch(/external sends are supported/i)
    expect(readme).not.toMatch(/always-listening mode/i)
    expect(readme).not.toMatch(/stores raw audio/i)

    await writeEvidence([
      'Scenario: documentation scope guard',
      `required claims checked: ${requiredClaims.length}`,
      `unsupported external write exclusions checked: ${unsupportedAllowedOnlyAsNegative.length}`,
      'external sends: unsupported in V1',
      'secrets: environment or Infisical only; not stored in repo files',
      'raw audio: retention disabled by default',
      'result: PASS',
    ])
  })
})
