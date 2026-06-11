export interface LocalAcknowledgement {
  kind: 'local'
  turnId: string
  ackMs: number
  acknowledgedAtMs: number
}

export interface LocalAcknowledgementInput {
  turnId: string
  startedAtMs: number
  nowMs: number
}

export function createLocalAcknowledgement(input: LocalAcknowledgementInput): LocalAcknowledgement {
  return {
    kind: 'local',
    turnId: input.turnId,
    ackMs: Math.max(0, Math.round(input.nowMs - input.startedAtMs)),
    acknowledgedAtMs: input.nowMs,
  }
}
