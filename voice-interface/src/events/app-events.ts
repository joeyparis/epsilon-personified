import { AppState, isAppState, type StatusSnapshot } from '../shared/state.js'

export const APP_EVENT_TYPES = [
  'audio.level',
  'audio.capture-state',
  'state.changed',
  'manifest.updated',
  'confirmation.requested',
  'confirmation.resolved',
  'delegation.started',
  'delegation.updated',
  'delegation.completed',
  'cost.updated',
  'error.raised',
  'face.status',
] as const

export type AppEventType = typeof APP_EVENT_TYPES[number]

export type FaceExpression = 'idle' | 'listening' | 'thinking' | 'speaking' | 'confirming' | 'delegated' | 'degraded' | 'error'

export interface AppEventMeta {
  id: string
  createdAt: string
  source: 'main' | 'renderer' | 'preload' | 'system'
}

export interface AppEventBase<Type extends AppEventType, Payload> {
  type: Type
  payload: Payload
  meta: AppEventMeta
}

export type AudioEvent =
  | AppEventBase<'audio.level', { level: number; muted: boolean }>
  | AppEventBase<'audio.capture-state', { active: boolean; reason?: string }>

export type StateEvent = AppEventBase<'state.changed', { snapshot: StatusSnapshot }>

export type ManifestEvent = AppEventBase<'manifest.updated', { manifestId: string; status: 'loaded' | 'stale' | 'missing' }>

export type ConfirmationEvent =
  | AppEventBase<'confirmation.requested', { confirmationId: string; summary: string }>
  | AppEventBase<'confirmation.resolved', { confirmationId: string; accepted: boolean }>

export type DelegationEvent =
  | AppEventBase<'delegation.started', { taskId: string; summary: string }>
  | AppEventBase<'delegation.updated', { taskId: string; status: string }>
  | AppEventBase<'delegation.completed', { taskId: string; outcome: 'completed' | 'failed' | 'cancelled' }>

export type CostEvent = AppEventBase<'cost.updated', { cents: number; label: string }>

export type ErrorEvent = AppEventBase<'error.raised', { message: string; code?: string; recoverable: boolean }>

export interface FaceStatusPayload {
  status: string
  expression: FaceExpression
  detail?: string
  sourceState?: AppState
}

export type FaceStatusEvent = AppEventBase<'face.status', FaceStatusPayload>

export type AppEvent =
  | AudioEvent
  | StateEvent
  | ManifestEvent
  | ConfirmationEvent
  | DelegationEvent
  | CostEvent
  | ErrorEvent
  | FaceStatusEvent

export const FACE_STATUS_LIMITS = {
  status: 72,
  detail: 120,
} as const

const TRANSCRIPT_HINTS = ['transcript', 'user said', 'assistant said', 'speaker:', '\n'] as const

export function createEventMeta(source: AppEventMeta['source']): AppEventMeta {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source,
  }
}

function trimToLimit(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value
}

function normalizeShortText(value: unknown, limit: number, fallback: string) {
  if (typeof value !== 'string') return fallback
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return fallback
  const lower = normalized.toLowerCase()
  if (TRANSCRIPT_HINTS.some((hint) => lower.includes(hint))) {
    return 'Transcript redacted.'
  }
  if (normalized.length > limit) {
    return trimToLimit(normalized, limit)
  }
  return normalized
}

export function sanitizeFaceStatusPayload(payload: Partial<FaceStatusPayload> & Record<string, unknown>): FaceStatusPayload {
  const sourceState = isAppState(payload.sourceState) ? payload.sourceState : undefined
  const expression = isFaceExpression(payload.expression) ? payload.expression : expressionFromState(sourceState ?? AppState.Idle)
  const sanitized: FaceStatusPayload = {
    status: normalizeShortText(payload.status, FACE_STATUS_LIMITS.status, 'Epsilon status changed.'),
    expression,
  }

  const detail = normalizeShortText(payload.detail, FACE_STATUS_LIMITS.detail, '')
  if (detail) sanitized.detail = detail
  if (sourceState) sanitized.sourceState = sourceState
  return sanitized
}

export function createStateChangedEvent(snapshot: StatusSnapshot, source: AppEventMeta['source']): StateEvent {
  return {
    type: 'state.changed',
    payload: { snapshot },
    meta: createEventMeta(source),
  }
}

export function createFaceStatusEvent(snapshot: StatusSnapshot, source: AppEventMeta['source']): FaceStatusEvent {
  return {
    type: 'face.status',
    payload: sanitizeFaceStatusPayload({
      status: snapshot.message,
      detail: snapshot.detail,
      expression: expressionFromState(snapshot.state),
      sourceState: snapshot.state,
    }),
    meta: createEventMeta(source),
  }
}

export function normalizeAppEvent(event: unknown): AppEvent | null {
  if (!isEventRecord(event) || !APP_EVENT_TYPES.includes(event.type as AppEventType) || !isEventMeta(event.meta)) return null

  if (event.type === 'face.status') {
    if (!isEventRecord(event.payload)) return null
    return {
      type: 'face.status',
      payload: sanitizeFaceStatusPayload(event.payload),
      meta: event.meta,
    }
  }

  return event as unknown as AppEvent
}

export function expressionFromState(state: AppState): FaceExpression {
  return state
}

function isFaceExpression(value: unknown): value is FaceExpression {
  return typeof value === 'string' && [
    'idle',
    'listening',
    'thinking',
    'speaking',
    'confirming',
    'delegated',
    'degraded',
    'error',
  ].includes(value)
}

function isEventMeta(value: unknown): value is AppEventMeta {
  return isEventRecord(value)
    && typeof value.id === 'string'
    && typeof value.createdAt === 'string'
    && ['main', 'renderer', 'preload', 'system'].includes(String(value.source))
}

function isEventRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
