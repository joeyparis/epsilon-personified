import { DEFAULT_CACHE_TTLS, type ContextAdapter, type ContextAdapterRequest, type ContextItem, type ReadOnlyServiceRequest } from './types.js'

export interface ReadOnlyServiceContextAdapterOptions {
  requests?: ReadOnlyServiceRequest[]
  cacheTtlMs?: number
}

const READ_ONLY_CONTRACT =
  'Delegated agent contract: read/search only. Do not write, send, create, update, delete, mutate, trigger workflows, call device actions, acknowledge alerts, archive messages, mark items read, or perform bulk actions. Return a compact summary with source labels only.'

export class ReadOnlyServiceContextAdapter implements ContextAdapter {
  readonly source = 'read_only_service' as const

  private readonly requests: ReadOnlyServiceRequest[]
  private readonly cacheTtlMs: number

  constructor(options: ReadOnlyServiceContextAdapterOptions = {}) {
    this.requests = options.requests ?? []
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTLS.readOnlyServicePromptMs
  }

  async collect(request: ContextAdapterRequest): Promise<ContextItem[]> {
    const descriptorRequests = (request.requestedSources ?? [])
      .filter((source) => source.kind === 'read_only_service' && source.requested === true && source.service && source.query)
      .map((source) => ({ service: source.service, query: source.query ?? '', label: source.label }) as ReadOnlyServiceRequest)

    return [...this.requests, ...descriptorRequests].map((serviceRequest) => ({
      kind: 'delegation_prompt',
      source: this.source,
      label: serviceRequest.label ?? `read_only_service:${serviceRequest.service}`,
      text: buildReadOnlyServicePrompt(serviceRequest),
      cacheTtlMs: this.cacheTtlMs,
    }))
  }
}

export function buildReadOnlyServicePrompt(request: ReadOnlyServiceRequest): string {
  return [
    READ_ONLY_CONTRACT,
    `Service: ${request.service}`,
    `Read/search request: ${request.query}`,
    'Do not include full inboxes, full calendars, full message threads, device state dumps, raw transcripts, secrets, or broad service responses. Summarize only the directly requested facts.',
  ].join('\n')
}

export { READ_ONLY_CONTRACT }
