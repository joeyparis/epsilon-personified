import { buildContextBundle } from './budget.js'
import { DEFAULT_CONTEXT_BUDGET, type ContextAdapter, type ContextAdapterRequest, type ContextBundle, type ContextBudget, type ContextSourceDescriptor } from './types.js'

export interface ContextBrokerOptions {
  adapters: ContextAdapter[]
  defaultBudget?: ContextBudget
}

export interface ContextBrokerRequest {
  budget?: Partial<ContextBudget>
  requestedSources?: ContextSourceDescriptor[]
  now?: Date
}

export class ContextBroker {
  private readonly adapters: ContextAdapter[]
  private readonly defaultBudget: ContextBudget

  constructor(options: ContextBrokerOptions) {
    this.adapters = options.adapters
    this.defaultBudget = options.defaultBudget ?? DEFAULT_CONTEXT_BUDGET
  }

  async buildBundle(request: ContextBrokerRequest = {}): Promise<ContextBundle> {
    const budget = { ...this.defaultBudget, ...request.budget }
    const adapterRequest: ContextAdapterRequest = {
      budget,
      requestedSources: request.requestedSources ?? [],
      now: request.now,
    }
    const itemGroups = await Promise.all(this.adapters.map((adapter) => adapter.collect(adapterRequest)))

    return buildContextBundle(itemGroups.flat(), budget, request.now)
  }
}
