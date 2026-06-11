import { AppState, createStatusSnapshot, type StatusSnapshot } from './state.js'

export type DegradedMode =
  | 'realtime_unavailable'
  | 'local_mic_denied'
  | 'openviking_unavailable'
  | 'opencode_unavailable'
  | 'read_only_service_failure'
  | 'face_bridge_unavailable'
  | 'cost_cap_reached'
  | 'network_drop'

export interface DegradedModeDescriptor {
  mode: DegradedMode
  menubarState: AppState.Degraded
  text: string
  spoken: string
}

export const DEGRADED_MODE_DESCRIPTORS: Record<DegradedMode, DegradedModeDescriptor> = {
  realtime_unavailable: {
    mode: 'realtime_unavailable',
    menubarState: AppState.Degraded,
    text: 'Realtime voice is unavailable. Epsilon is staying in local text/read-only mode.',
    spoken: 'Realtime voice is unavailable, so I am using local text mode.',
  },
  local_mic_denied: {
    mode: 'local_mic_denied',
    menubarState: AppState.Degraded,
    text: 'Microphone access is unavailable. Voice capture is paused until permission is restored.',
    spoken: 'Microphone access is unavailable.',
  },
  openviking_unavailable: {
    mode: 'openviking_unavailable',
    menubarState: AppState.Degraded,
    text: 'OpenViking memory is unavailable. Epsilon will use compact Church context only.',
    spoken: 'OpenViking is unavailable, so I am using Church context only.',
  },
  opencode_unavailable: {
    mode: 'opencode_unavailable',
    menubarState: AppState.Degraded,
    text: 'OpenCode delegation unavailable. No worker process was spawned.',
    spoken: 'OpenCode delegation is unavailable.',
  },
  read_only_service_failure: {
    mode: 'read_only_service_failure',
    menubarState: AppState.Degraded,
    text: 'A read-only service summary failed. Epsilon will continue without raw service responses.',
    spoken: 'A read-only service summary failed, so I am continuing without it.',
  },
  face_bridge_unavailable: {
    mode: 'face_bridge_unavailable',
    menubarState: AppState.Degraded,
    text: 'Epsilon Face bridge is offline. Voice status remains visible in the menubar.',
    spoken: 'The face bridge is offline, but the menubar still shows status.',
  },
  cost_cap_reached: {
    mode: 'cost_cap_reached',
    menubarState: AppState.Degraded,
    text: 'Cloud cost cap reached. Premium realtime and delegation are blocked; local/read-only mode remains available.',
    spoken: 'Cloud cost cap reached. I am staying local and read-only.',
  },
  network_drop: {
    mode: 'network_drop',
    menubarState: AppState.Degraded,
    text: 'Network dropped. Epsilon is using local/read-only behavior until connectivity returns.',
    spoken: 'The network dropped, so I am using local mode.',
  },
}

export function createDegradedStatus(mode: DegradedMode, detail?: string): StatusSnapshot {
  const descriptor = DEGRADED_MODE_DESCRIPTORS[mode]
  return createStatusSnapshot(descriptor.menubarState, descriptor.text, detail ?? descriptor.spoken)
}
