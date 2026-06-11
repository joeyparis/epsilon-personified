import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function collectFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolutePath = join(directory, entry)
    if (statSync(absolutePath).isDirectory()) return collectFiles(absolutePath)
    return absolutePath
  })
}

describe('renderer secret boundary', () => {
  it('keeps raw key environment access out of renderer source', () => {
    const rendererRoot = new URL('.', import.meta.url).pathname
    const sourceText = collectFiles(rendererRoot)
      .filter((filePath) => filePath.endsWith('.ts'))
      .map((filePath) => readFileSync(filePath, 'utf8'))
      .join('\n')

    expect(sourceText).not.toContain(['OPENAI', 'API', 'KEY'].join('_'))
    expect(sourceText).not.toContain(['s', 'k'].join('') + '-')
  })
})
