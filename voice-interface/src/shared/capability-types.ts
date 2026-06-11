export const CAPABILITY_MANIFEST_VERSION = 'capability-manifest.v1'

export type CapabilityActionType =
  | 'church_inbox_capture'
  | 'voice_project_notes_update'
  | 'task_today_add'
  | 'task_upcoming_add'
  | 'local_draft_upsert'

export type CapabilityRiskLevel = 'low' | 'medium'

export interface CapabilityManifest {
  id: string
  version: typeof CAPABILITY_MANIFEST_VERSION
  hash: string
  action_type: CapabilityActionType
  target_path: string
  human_summary: string
  exact_diff_or_payload: string
  source_context_labels: string[]
  risk_level: CapabilityRiskLevel
  expires_at: string
  confirmation_phrase: string
}

export type PrepareCapabilityRequest =
  | {
    action_type: 'church_inbox_capture'
    text: string
    source_context_labels?: string[]
  }
  | {
    action_type: 'voice_project_notes_update'
    note: string
    source_context_labels?: string[]
  }
  | {
    action_type: 'task_today_add' | 'task_upcoming_add'
    text: string
    source_context_labels?: string[]
  }
  | {
    action_type: 'local_draft_upsert'
    title: string
    body: string
    source_context_labels?: string[]
    draft_name?: string
    external_send_intent?: string
  }

export type ConfirmationInput =
  | { method: 'click'; accepted: boolean }
  | { method: 'voice'; transcript: string }
  | { method: 'edit'; reason?: string }
  | { method: 'timeout'; reason?: string }

export interface CapabilityConfirmation {
  manifest_id: string
  manifest_hash: string
  accepted: boolean
  reason: 'accepted' | 'rejected' | 'ambiguous' | 'edited' | 'expired'
  confirmed_at: string
}

export type CapabilityExecutionResult =
  | { ok: true; manifest_id: string; target_path: string; bytes_written: number; not_sent: boolean }
  | { ok: false; manifest_id?: string; reason: string; not_sent: true }
