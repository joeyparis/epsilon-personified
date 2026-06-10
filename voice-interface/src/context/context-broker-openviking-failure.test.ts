import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { ContextBroker } from './broker.js'
import { ChurchContextAdapter } from './church.js'
import { OpenVikingContextAdapter } from './openviking.js'

describe('context-broker-openviking-failure', () => {
  it('returns source_unavailable when OpenViking fails and still builds a usable bundle', async () => {
    const churchRoot = await createChurchFixture()
    const broker = new ContextBroker({
      adapters: [
        new ChurchContextAdapter({ churchRoot }),
        new OpenVikingContextAdapter({
          client: {
            findCompactSummaries: vi.fn(async () => {
              throw new Error('gpt-5.3-codex route unsupported')
            }),
          },
        }),
      ],
      defaultBudget: { maxBundleChars: 1400, maxItemChars: 300 },
    })

    const bundle = await broker.buildBundle()

    expect(bundle.items.some((item) => item.kind === 'source_unavailable')).toBe(true)
    expect(bundle.source_context_labels).toContain('openviking:source_unavailable')
    expect(bundle.promptText).toContain('OpenViking memory summaries are unavailable')
    expect(bundle.promptText).toContain('Inbox capture')
  })
})

async function createChurchFixture(): Promise<string> {
  const churchRoot = await mkdtemp(join(tmpdir(), 'epsilon-church-'))

  await mkdir(join(churchRoot, 'tasks'), { recursive: true })
  await mkdir(join(churchRoot, 'projects', 'epsilon-voice-interface'), { recursive: true })
  await mkdir(join(churchRoot, 'lists'), { recursive: true })

  await writeFile(join(churchRoot, 'inbox.md'), 'Inbox capture for fallback usability')
  await writeFile(join(churchRoot, 'tasks', 'today.md'), '- [ ] Keep the app usable without memories\n')
  await writeFile(join(churchRoot, 'projects', 'epsilon-voice-interface', 'plan.md'), 'Voice interface fallback plan')
  await writeFile(join(churchRoot, 'lists', 'active-projects.md'), '- Epsilon Voice Interface active\n')

  return churchRoot
}
