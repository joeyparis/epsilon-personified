import { AppState } from './state.js'

export interface StatePresentation {
  label: string
  verb: string
  message: string
  tone: 'quiet' | 'active' | 'warn' | 'danger'
}

export const STATE_PRESENTATION: Record<AppState, StatePresentation> = {
  [AppState.Idle]: {
    label: 'Idle',
    verb: 'Standing by',
    message: 'Epsilon is ready from the menubar.',
    tone: 'quiet',
  },
  [AppState.Listening]: {
    label: 'Listening',
    verb: 'Listening',
    message: 'Voice capture is staged for a later task.',
    tone: 'active',
  },
  [AppState.Thinking]: {
    label: 'Thinking',
    verb: 'Reasoning',
    message: 'The shell can show thought state without delegation.',
    tone: 'active',
  },
  [AppState.Speaking]: {
    label: 'Speaking',
    verb: 'Speaking',
    message: 'Speech output is represented only as state.',
    tone: 'active',
  },
  [AppState.Confirming]: {
    label: 'Confirming',
    verb: 'Awaiting confirmation',
    message: 'A future action would pause here before writing.',
    tone: 'warn',
  },
  [AppState.Delegated]: {
    label: 'Delegated',
    verb: 'Handed off',
    message: 'Work has been delegated outside this shell.',
    tone: 'active',
  },
  [AppState.Degraded]: {
    label: 'Degraded',
    verb: 'Limited mode',
    message: 'One desktop integration is unavailable, but the app is still running.',
    tone: 'warn',
  },
  [AppState.Error]: {
    label: 'Error',
    verb: 'Needs attention',
    message: 'The shell hit a recoverable application error.',
    tone: 'danger',
  },
}
