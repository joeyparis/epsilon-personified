import { DEFAULT_CACHE_TTLS, type ContextAdapter, type ContextAdapterRequest, type ContextItem } from './types.js'

export interface OpenVikingMemorySummary {
  label: string
  text: string
}

export interface OpenVikingSummaryClient {
  findCompactSummaries: (query: string, limit: number) => Promise<OpenVikingMemorySummary[]>
}

export interface OpenVikingContextAdapterOptions {
  client: OpenVikingSummaryClient
  defaultQuery?: string
  limit?: number
  cacheTtlMs?: number
}

export class OpenVikingContextAdapter implements ContextAdapter {
  readonly source = 'openviking' as const

  private readonly client: OpenVikingSummaryClient
  private readonly defaultQuery: string
  private readonly limit: number
  private readonly cacheTtlMs: number

  constructor(options: OpenVikingContextAdapterOptions) {
    this.client = options.client
    this.defaultQuery = options.defaultQuery ?? 'Epsilon Voice Interface relevant preferences and project memory summaries'
    this.limit = options.limit ?? 4
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTLS.openVikingMs
  }

  async collect(request: ContextAdapterRequest): Promise<ContextItem[]> {
    const requestedQuery = request.requestedSources?.find((source) => source.kind === 'openviking' && source.requested === true)?.query

    try {
      const summaries = await this.client.findCompactSummaries(requestedQuery ?? this.defaultQuery, this.limit)
      return summaries.map((summary) => ({
        kind: 'summary',
        source: this.source,
        label: `openviking:${summary.label}`,
        text: summary.text,
        cacheTtlMs: this.cacheTtlMs,
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OpenViking unavailable'
      return [
        {
          kind: 'source_unavailable',
          source: this.source,
          label: 'openviking:source_unavailable',
          text: 'OpenViking memory summaries are unavailable. Continue with Church context and explicit user input only.',
          cacheTtlMs: this.cacheTtlMs,
          unavailableReason: message,
        },
      ]
    }
  }
}
