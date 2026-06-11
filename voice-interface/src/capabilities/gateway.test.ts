import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import type { CapabilityManifest } from '../shared/capability-types.js'
import { CapabilityGateway, hashCapabilityManifest, isAllowedChurchTarget } from './gateway.js'

describe('CapabilityGateway', () => {
  it('prepares Church inbox capture without writing until confirmed and executed', async () => {
    const churchRoot = await createChurchFixture()
    const gateway = new CapabilityGateway({ churchRoot })
    const manifest = gateway.prepare({
      action_type: 'church_inbox_capture',
      text: 'Buy oat milk',
      source_context_labels: ['church:inbox.md:inbox.md'],
    })

    expect(manifest.action_type).toBe('church_inbox_capture')
    expect(manifest.target_path).toBe('inbox.md')
    expect(manifest.hash).toBe(hashCapabilityManifest(manifest))
    expect(await readFile(join(churchRoot, 'inbox.md'), 'utf8')).toBe('')

    const confirmation = gateway.confirm(manifest, { method: 'click', accepted: true })
    const result = await gateway.execute(manifest, confirmation)

    expect(result.ok).toBe(true)
    expect(await readFile(join(churchRoot, 'inbox.md'), 'utf8')).toBe('- [ ] Buy oat milk\n')
  })

  it('does not write for rejected, edited, ambiguous, expired, or hash-mismatched manifests', async () => {
    const churchRoot = await createChurchFixture()
    const clock = fixedClock(new Date('2026-06-10T12:00:00.000Z'))
    const gateway = new CapabilityGateway({ churchRoot, ttlMs: 1_000, now: clock.now })

    await attemptNoWrite(gateway, churchRoot, 'rejected', (manifest) => gateway.confirm(manifest, { method: 'click', accepted: false }))
    await attemptNoWrite(gateway, churchRoot, 'edited', (manifest) => gateway.confirm(manifest, { method: 'edit' }))
    await attemptNoWrite(gateway, churchRoot, 'ambiguous', (manifest) => gateway.confirm(manifest, { method: 'voice', transcript: 'sure do it' }))

    const expiredManifest = gateway.prepare({ action_type: 'church_inbox_capture', text: 'Expired item' })
    clock.advance(1_001)
    const expiredConfirmation = gateway.confirm(expiredManifest, { method: 'click', accepted: true })
    expect((await gateway.execute(expiredManifest, expiredConfirmation)).ok).toBe(false)

    clock.advance(-1_001)
    const hashManifest = gateway.prepare({ action_type: 'church_inbox_capture', text: 'Changed item' })
    const hashConfirmation = gateway.confirm(hashManifest, { method: 'click', accepted: true })
    const editedManifest: CapabilityManifest = { ...hashManifest, exact_diff_or_payload: `${hashManifest.exact_diff_or_payload}edited` }
    expect((await gateway.execute(editedManifest, hashConfirmation)).ok).toBe(false)
    expect(await readFile(join(churchRoot, 'inbox.md'), 'utf8')).toBe('')
  })

  it('rejects recomputed hashes when the prepared manifest binding changed', async () => {
    const churchRoot = await createChurchFixture()
    const gateway = new CapabilityGateway({ churchRoot })
    const manifest = gateway.prepare({ action_type: 'church_inbox_capture', text: 'Original item' })
    const edited = { ...manifest, target_path: 'tasks/today.md' }
    const editedWithHash = { ...edited, hash: hashCapabilityManifest(edited) }
    const confirmation = gateway.confirm(editedWithHash, { method: 'click', accepted: true })

    expect((await gateway.execute(editedWithHash, confirmation)).ok).toBe(false)
    expect(await readFile(join(churchRoot, 'tasks', 'today.md'), 'utf8')).toBe('')
  })

  it('keeps V1 action targets inside the Church allowlist', async () => {
    const churchRoot = await createChurchFixture()
    const gateway = new CapabilityGateway({ churchRoot })
    const today = gateway.prepare({ action_type: 'task_today_add', text: 'Review manifest gateway' })
    const upcoming = gateway.prepare({ action_type: 'task_upcoming_add', text: 'Run final smoke' })
    const notes = gateway.prepare({ action_type: 'voice_project_notes_update', note: 'Gateway supports manifest confirmation.' })
    const draft = gateway.prepare({ action_type: 'local_draft_upsert', title: 'Email Alex Draft', body: 'Hello Alex' })

    expect(isAllowedChurchTarget(today.target_path)).toBe(true)
    expect(isAllowedChurchTarget(upcoming.target_path)).toBe(true)
    expect(isAllowedChurchTarget(notes.target_path)).toBe(true)
    expect(isAllowedChurchTarget(draft.target_path)).toBe(true)
    expect(isAllowedChurchTarget('projects/epsilon-voice-interface/drafts/../secrets.md')).toBe(false)
    expect(isAllowedChurchTarget('projects/other/drafts/test.md')).toBe(false)
  })

  it('creates draft-only artifacts for external send intents and never reports a send', async () => {
    const churchRoot = await createChurchFixture()
    const gateway = new CapabilityGateway({ churchRoot })
    const manifest = gateway.prepare({
      action_type: 'local_draft_upsert',
      title: 'Email Alex Hello',
      body: 'hello',
      external_send_intent: 'email Alex hello',
      source_context_labels: ['read_only_service:gmail'],
    })
    const result = await gateway.execute(manifest, gateway.confirm(manifest, { method: 'voice', transcript: manifest.confirmation_phrase }))

    expect(result.ok).toBe(true)
    expect(result.not_sent).toBe(true)
    const draft = await readFile(join(churchRoot, manifest.target_path), 'utf8')
    expect(draft).toContain('Status: NOT SENT - local draft only.')
    expect(draft).toContain('Source intent: email Alex hello')
  })
})

async function attemptNoWrite(
  gateway: CapabilityGateway,
  churchRoot: string,
  text: string,
  confirm: (manifest: CapabilityManifest) => ReturnType<CapabilityGateway['confirm']>,
) {
  const manifest = gateway.prepare({ action_type: 'church_inbox_capture', text })
  expect((await gateway.execute(manifest, confirm(manifest))).ok).toBe(false)
  expect(await readFile(join(churchRoot, 'inbox.md'), 'utf8')).toBe('')
}

function fixedClock(initial: Date) {
  let current = initial.getTime()
  return {
    now: () => new Date(current),
    advance: (ms: number) => {
      current += ms
    },
  }
}

async function createChurchFixture(): Promise<string> {
  const churchRoot = await mkdtemp(join(tmpdir(), 'epsilon-voice-capability-'))
  await mkdir(join(churchRoot, 'tasks'), { recursive: true })
  await mkdir(join(churchRoot, 'projects', 'epsilon-voice-interface', 'drafts'), { recursive: true })
  await writeFile(join(churchRoot, 'inbox.md'), '')
  await writeFile(join(churchRoot, 'tasks', 'today.md'), '')
  await writeFile(join(churchRoot, 'tasks', 'upcoming.md'), '')
  await writeFile(join(churchRoot, 'projects', 'epsilon-voice-interface', 'notes.md'), '')
  return churchRoot
}
