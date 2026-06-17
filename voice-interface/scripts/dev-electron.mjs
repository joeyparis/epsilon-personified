import { spawn } from 'node:child_process'

const viteUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173'
const children = new Set()

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  })
  children.add(child)
  child.on('exit', () => children.delete(child))
  return child
}

function stopChildren() {
  for (const child of children) child.kill('SIGTERM')
}

process.on('SIGINT', () => {
  stopChildren()
  process.exit(130)
})

process.on('SIGTERM', () => {
  stopChildren()
  process.exit(143)
})

run('npm', ['run', 'dev', '--', '--host', '127.0.0.1'])

await waitForVite(viteUrl)
try {
  await runOnce('npm', ['run', 'build:electron'])
} catch (error) {
  stopChildren()
  throw error
}

const electron = run('electron', ['.'], {
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: viteUrl,
  },
})

electron.on('exit', (code) => {
  stopChildren()
  process.exit(code ?? 0)
})

async function waitForVite(url) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch (error) {
      await delay(250)
      continue
    }
    await delay(250)
  }
  stopChildren()
  throw new Error(`Timed out waiting for Vite dev server at ${url}`)
}

function runOnce(command, args) {
  return new Promise((resolve, reject) => {
    const child = run(command, args)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? 'unknown status'}`))
    })
  })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
