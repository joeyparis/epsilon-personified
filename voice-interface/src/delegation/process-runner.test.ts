import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveWorkerEnv } from './process-runner.js'

describe('process runner environment', () => {
  it('loads the local OpenCode server password for opencode workers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'epsilon-opencode-password-'))
    const password_path = join(dir, 'server-password')
    await writeFile(password_path, 'local-secret\n', 'utf8')

    const env = resolveWorkerEnv('opencode', { OPENCODE_SERVER_PASSWORD_FILE: password_path })

    expect(env.OPENCODE_SERVER_PASSWORD).toBe('local-secret')
  })

  it('does not load the OpenCode password for unrelated workers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'epsilon-opencode-password-'))
    const password_path = join(dir, 'server-password')
    await writeFile(password_path, 'local-secret\n', 'utf8')

    const env = resolveWorkerEnv('node', { OPENCODE_SERVER_PASSWORD_FILE: password_path })

    expect(env.OPENCODE_SERVER_PASSWORD).toBeUndefined()
  })
})
