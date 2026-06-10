export type ContextSourceKind = 'church' | 'openviking' | 'read_only_service'

export type ContextItemKind = 'summary' | 'source_unavailable' | 'delegation_prompt'

export interface ContextBudget {
  maxBundleChars: number
  maxItemChars: number
}

export interface ContextSourceDescriptor {
  kind: ContextSourceKind
  label: string
  path?: string
  query?: string
  service?: ReadOnlyServiceName
  requested?: boolean
}

export interface ContextItem {
  kind: ContextItemKind
  source: ContextSourceKind
  label: string
  text: string
  cacheTtlMs: number
  unavailableReason?: string
}

export interface ContextBundle {
  items: ContextItem[]
  source_context_labels: string[]
  promptText: string
  budget: ContextBudget
  truncated: boolean
  generatedAt: string
}

export interface ContextAdapterRequest {
  budget: ContextBudget
  requestedSources?: ContextSourceDescriptor[]
  now?: Date
}

export interface ContextAdapter {
  readonly source: ContextSourceKind
  collect(request: ContextAdapterRequest): Promise<ContextItem[]>
}

export type ReadOnlyServiceName =
  | 'gmail'
  | 'calendar'
  | 'imessage'
  | 'slack'
  | 'homeassistant'
  | 'tesla'
  | 'notion'
  | 'ms365'
  | 'holmat-workspace'

export interface ReadOnlyServiceRequest {
  service: ReadOnlyServiceName
  query: string
  label?: string
}

export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  maxBundleChars: 6000,
  maxItemChars: 1200,
} as const

export const DEFAULT_CACHE_TTLS = {
  churchMs: 30_000,
  openVikingMs: 120_000,
  readOnlyServicePromptMs: 15_000,
} as const
