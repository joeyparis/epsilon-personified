import type { ContextBudget, ContextBundle, ContextItem } from './types.js'

const ELLIPSIS = '...'

export function compactText(text: string, maxChars: number): { text: string; truncated: boolean } {
  const normalized = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim()
  if (normalized.length <= maxChars) {
    return { text: normalized, truncated: false }
  }

  return {
    text: `${normalized.slice(0, Math.max(0, maxChars - ELLIPSIS.length)).trimEnd()}${ELLIPSIS}`,
    truncated: true,
  }
}

export function applyItemBudget(items: ContextItem[], budget: ContextBudget): { items: ContextItem[]; truncated: boolean } {
  let truncated = false
  const compacted = items.map((item) => {
    const result = compactText(item.text, budget.maxItemChars)
    truncated ||= result.truncated
    return { ...item, text: result.text }
  })

  return { items: compacted, truncated }
}

export function buildContextBundle(items: ContextItem[], budget: ContextBudget, now = new Date()): ContextBundle {
  const compacted = applyItemBudget(items, budget)
  const selected: ContextItem[] = []
  let remaining = budget.maxBundleChars
  let truncated = compacted.truncated

  for (const item of compacted.items) {
    const rendered = renderContextItem(item)
    if (rendered.length > remaining) {
      truncated = true
      continue
    }

    selected.push(item)
    remaining -= rendered.length
  }

  return {
    items: selected,
    source_context_labels: selected.map((item) => item.label),
    promptText: selected.map(renderContextItem).join('\n\n'),
    budget,
    truncated,
    generatedAt: now.toISOString(),
  }
}

export function renderContextItem(item: ContextItem): string {
  const unavailable = item.unavailableReason ? ` unavailable_reason=${item.unavailableReason}` : ''
  return `[source:${item.label} kind:${item.kind}${unavailable}]\n${item.text}`
}
