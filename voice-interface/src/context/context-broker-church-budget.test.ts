import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { ContextBroker } from './broker.js'
import { ChurchContextAdapter } from './church.js'
import { READ_ONLY_CONTRACT, ReadOnlyServiceContextAdapter, buildReadOnlyServicePrompt } from './read-only-services.js'

describe('context-broker-church-budget', () => {
  it('keeps Church context compact, labeled, and limited to default allowlisted sources', async () => {
    const churchRoot = await createChurchFixture()
    const broker = new ContextBroker({
      adapters: [new ChurchContextAdapter({ churchRoot })],
      defaultBudget: { maxBundleChars: 1400, maxItemChars: 140 },
    })

    const bundle = await broker.buildBundle({ now: new Date('2026-06-10T12:00:00.000Z') })

    expect(bundle.promptText.length).toBeLessThanOrEqual(1400)
    expect(bundle.source_context_labels).toContain('church:inbox.md:inbox.md')
    expect(bundle.source_context_labels).toContain('church:tasks/:tasks/today.md')
    expect(bundle.source_context_labels).toContain('church:projects/epsilon-voice-interface/:projects/epsilon-voice-interface/plan.md')
    expect(bundle.source_context_labels).toContain('church:lists/active-projects.md:lists/active-projects.md')
    expect(bundle.source_context_labels).toContain('church:notes/automation-history.md:notes/automation-history.md')
    expect(bundle.promptText).toContain('Recent automated scan summary')
    expect(bundle.promptText).not.toContain('private note should never appear by default')
    expect(bundle.promptText).not.toContain('other project should never appear by default')
    expect(bundle.promptText).not.toContain('full email inbox')
    expect(bundle.promptText).not.toContain('full calendar dump')
    expect(bundle.promptText).not.toContain('full message transcript')
  })

  it('includes an explicit Church note only when requested by descriptor path', async () => {
    const churchRoot = await createChurchFixture()
    const broker = new ContextBroker({
      adapters: [new ChurchContextAdapter({ churchRoot })],
      defaultBudget: { maxBundleChars: 2200, maxItemChars: 240 },
    })

    const bundle = await broker.buildBundle({
      requestedSources: [{ kind: 'church', label: 'requested-note', path: 'notes/voice-note.md', requested: true }],
    })

    expect(bundle.promptText).toContain('private note should never appear by default')
    expect(bundle.source_context_labels).toContain('church:requested:notes/voice-note.md:notes/voice-note.md')
  })
})

describe('read-only service context prompts', () => {
  it('creates delegated read-only prompts without performing service calls by default', async () => {
    const adapter = new ReadOnlyServiceContextAdapter()
    const defaultItems = await adapter.collect({ budget: { maxBundleChars: 1000, maxItemChars: 500 }, requestedSources: [] })

    expect(defaultItems).toEqual([])

    const prompt = buildReadOnlyServicePrompt({ service: 'gmail', query: 'Find unread messages from today and summarize senders only.' })

    expect(prompt).toContain(READ_ONLY_CONTRACT)
    expect(prompt).toContain('read/search only')
    expect(prompt).toContain('Do not write, send, create, update, delete, mutate')
    expect(prompt).toContain('Do not include full inboxes')
  })
})

async function createChurchFixture(): Promise<string> {
  const churchRoot = await mkdtemp(join(tmpdir(), 'epsilon-church-'))

  await mkdir(join(churchRoot, 'tasks'), { recursive: true })
  await mkdir(join(churchRoot, 'projects', 'epsilon-voice-interface'), { recursive: true })
  await mkdir(join(churchRoot, 'projects', 'other-project'), { recursive: true })
  await mkdir(join(churchRoot, 'lists'), { recursive: true })
  await mkdir(join(churchRoot, 'notes'), { recursive: true })

  await writeFile(join(churchRoot, 'inbox.md'), 'Inbox capture '.repeat(40))
  await writeFile(join(churchRoot, 'tasks', 'today.md'), '- [ ] Build compact context broker\n'.repeat(30))
  await writeFile(join(churchRoot, 'tasks', 'upcoming.md'), '- [ ] Wire manifest gateway later\n'.repeat(20))
  await writeFile(join(churchRoot, 'projects', 'epsilon-voice-interface', 'plan.md'), 'Voice interface control plane status '.repeat(30))
  await writeFile(join(churchRoot, 'projects', 'other-project', 'plan.md'), 'other project should never appear by default')
  await writeFile(join(churchRoot, 'lists', 'active-projects.md'), '- Epsilon Voice Interface active\n')
  await writeFile(join(churchRoot, 'notes', 'automation-history.md'), 'Recent automated scan summary\n')
  await writeFile(join(churchRoot, 'notes', 'voice-note.md'), 'private note should never appear by default unless requested')

  return churchRoot
}
