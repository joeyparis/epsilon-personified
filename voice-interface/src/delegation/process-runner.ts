import { spawn } from 'node:child_process'

export interface WorkerProcessResult {
  exitCode: number | null
  stdout: string
  stderr: string
}

export interface ManagedWorkerProcess {
  completed: Promise<WorkerProcessResult>
  cancel: () => Promise<void> | void
}

export interface ProcessRunner {
  run: (command: string, args: string[]) => ManagedWorkerProcess
}

export const nodeProcessRunner: ProcessRunner = {
  run(command, args) {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => { stdout += chunk })
    child.stderr?.on('data', (chunk: string) => { stderr += chunk })

    const completed = new Promise<WorkerProcessResult>((resolve) => {
      child.on('error', (error) => resolve({ exitCode: 1, stdout, stderr: `${stderr}${error.message}` }))
      child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }))
    })

    return {
      completed,
      cancel: () => {
        if (!child.killed) child.kill('SIGTERM')
      },
    }
  },
}
