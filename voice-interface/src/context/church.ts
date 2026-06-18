import { readdir, readFile, stat } from 'node:fs/promises'
import { join, normalize, relative, resolve, sep } from 'node:path'
import { compactText } from './budget.js'
import { DEFAULT_CACHE_TTLS, type ContextAdapter, type ContextAdapterRequest, type ContextItem, type ContextSourceDescriptor } from './types.js'

export interface ChurchContextAdapterOptions {
  churchRoot: string
  cacheTtlMs?: number
  readFileText?: (path: string) => Promise<string>
  listDir?: (path: string) => Promise<string[]>
  statPath?: (path: string) => Promise<{ isDirectory: () => boolean; isFile: () => boolean }>
}

interface ChurchSource {
  label: string
  relativePath: string
  recursive: boolean
}

const DEFAULT_CHURCH_SOURCES: ChurchSource[] = [
  { label: 'church:inbox.md', relativePath: 'inbox.md', recursive: false },
  { label: 'church:tasks/', relativePath: 'tasks', recursive: true },
  { label: 'church:projects/epsilon-voice-interface/', relativePath: 'projects/epsilon-voice-interface', recursive: true },
  { label: 'church:lists/active-projects.md', relativePath: 'lists/active-projects.md', recursive: false },
  { label: 'church:notes/automation-history.md', relativePath: 'notes/automation-history.md', recursive: false },
]

const EXPLICIT_CHURCH_PREFIXES = ['notes/', 'projects/']

export class ChurchContextAdapter implements ContextAdapter {
  readonly source = 'church' as const

  private readonly churchRoot: string
  private readonly cacheTtlMs: number
  private readonly readFileText: (path: string) => Promise<string>
  private readonly listDir: (path: string) => Promise<string[]>
  private readonly statPath: (path: string) => Promise<{ isDirectory: () => boolean; isFile: () => boolean }>

  constructor(options: ChurchContextAdapterOptions) {
    this.churchRoot = resolve(options.churchRoot)
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTLS.churchMs
    this.readFileText = options.readFileText ?? readFileUtf8
    this.listDir = options.listDir ?? listDirectoryNames
    this.statPath = options.statPath ?? stat
  }

  async collect(request: ContextAdapterRequest): Promise<ContextItem[]> {
    const sources = [...DEFAULT_CHURCH_SOURCES, ...this.explicitSources(request.requestedSources ?? [])]
    const items: ContextItem[] = []

    for (const source of sources) {
      const filePaths = await this.resolveFiles(source)
      for (const filePath of filePaths) {
        const text = await this.readFileText(filePath)
        const relativePath = this.toChurchRelativePath(filePath)
        const compacted = compactText(text, request.budget.maxItemChars)
        items.push({
          kind: 'summary',
          source: this.source,
          label: `${source.label}:${relativePath}`,
          text: compacted.text,
          cacheTtlMs: this.cacheTtlMs,
        })
      }
    }

    return items
  }

  private explicitSources(descriptors: ContextSourceDescriptor[]): ChurchSource[] {
    return descriptors
      .filter((descriptor) => descriptor.kind === 'church' && descriptor.requested === true && typeof descriptor.path === 'string')
      .map((descriptor) => normalizeChurchPath(descriptor.path ?? ''))
      .filter((relativePath) => EXPLICIT_CHURCH_PREFIXES.some((prefix) => relativePath.startsWith(prefix)))
      .map((relativePath) => ({
        label: `church:requested:${relativePath}`,
        relativePath,
        recursive: false,
      }))
  }

  private async resolveFiles(source: ChurchSource): Promise<string[]> {
    const sourcePath = this.resolveInsideChurch(source.relativePath)
    const sourceStat = await this.safeStat(sourcePath)
    if (!sourceStat) {
      return []
    }

    if (sourceStat.isFile()) {
      return sourcePath.endsWith('.md') ? [sourcePath] : []
    }

    if (!sourceStat.isDirectory()) {
      return []
    }

    if (!source.recursive) {
      return []
    }

    return this.listMarkdownFiles(sourcePath)
  }

  private async listMarkdownFiles(directory: string): Promise<string[]> {
    const entries = await this.listDir(directory)
    const files: string[] = []

    for (const entry of [...entries].sort()) {
      const entryPath = join(directory, entry)
      const entryStat = await this.safeStat(entryPath)
      if (!entryStat) {
        continue
      }

      if (entryStat.isDirectory()) {
        files.push(...(await this.listMarkdownFiles(entryPath)))
      } else if (entryStat.isFile() && entryPath.endsWith('.md')) {
        files.push(entryPath)
      }
    }

    return files
  }

  private resolveInsideChurch(relativePath: string): string {
    const fullPath = resolve(this.churchRoot, relativePath)
    const relativeFromRoot = relative(this.churchRoot, fullPath)
    if (relativeFromRoot.startsWith('..') || relativeFromRoot === '' || relativeFromRoot.split(sep).includes('..')) {
      throw new Error(`Church context path escapes root: ${relativePath}`)
    }
    return fullPath
  }

  private toChurchRelativePath(filePath: string): string {
    return relative(this.churchRoot, filePath).split(sep).join('/')
  }

  private async safeStat(path: string): Promise<{ isDirectory: () => boolean; isFile: () => boolean } | undefined> {
    try {
      return await this.statPath(path)
    } catch {
      return undefined
    }
  }
}

function normalizeChurchPath(path: string): string {
  return normalize(path).replace(/^\/+/, '').split(sep).join('/')
}

async function readFileUtf8(path: string): Promise<string> {
  return readFile(path, 'utf8')
}

async function listDirectoryNames(path: string): Promise<string[]> {
  return readdir(path)
}
