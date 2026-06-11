import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DelegationGateway } from '../delegation/gateway.js'
import { mintRealtimeSessionFromEnv } from '../main/realtime-session.js'
import { evaluateCloudSpend } from './cost-guardrails.js'
import { DEFAULT_PRIVACY_COST_CONFIG } from './privacy-cost-config.js'
import { AppState } from './state.js'

const EVIDENCE_PATH = '/Users/joey/Church/.omo/evidence/task-8-cost-cap.txt'

async function writeEvidence(content: string) {
  await mkdir(dirname(EVIDENCE_PATH), { recursive: true })
  await writeFile(EVIDENCE_PATH, `${content.trimEnd()}\n`, 'utf8')
}

describe('cost-cap-reached', () => {
  it('blocks premium realtime and delegation and reports local read-only degraded mode', async () => {
    const spend = {
      todayCents: DEFAULT_PRIVACY_COST_CONFIG.cost.dailyCloudSpendCapCents,
      monthCents: DEFAULT_PRIVACY_COST_CONFIG.cost.monthlyCloudSpendCapCents,
    }
    const fetchImpl = vi.fn<(input: string, init: RequestInit) => Promise<Response>>()
    const realtime = await mintRealtimeSessionFromEnv({
      env: { OPENAI_API_KEY: 'sk-fake-task8-cost-cap-key' },
      estimatedSpend: spend,
      fetchImpl,
    })

    let spawned = 0
    const statuses: string[] = []
    const gateway = new DelegationGateway({
      estimatedSpend: spend,
      healthChecker: { isAvailable: async () => true },
      processRunner: {
        run: () => {
          spawned += 1
          return { completed: Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }), cancel: () => undefined }
        },
      },
      setStatus: (state, message, detail) => { statuses.push(`${state}:${message}:${detail ?? ''}`) },
    })

    const delegation = await gateway.delegate({
      parentVoiceTurnId: 'turn-cost-cap',
      promptSummary: 'Safe summary only.',
      model: 'claude-opus-4-6',
      profile: 'premium',
      costBudgetCents: 25,
    })
    const decision = evaluateCloudSpend(spend)

    expect(decision).toMatchObject({
      capReached: true,
      localReadOnlyMode: true,
      allowPremiumRealtime: false,
      allowPremiumDelegation: false,
    })
    expect(realtime).toMatchObject({ ok: false, code: 'cost_cap_reached', recoverable: true })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(delegation.accepted).toBe(false)
    expect(delegation.job.status).toBe('blocked_by_cost_cap')
    expect(delegation.queue.degraded).toBe(true)
    expect(spawned).toBe(0)
    expect(statuses.some((status) => status.startsWith(`${AppState.Degraded}:Cloud cost cap reached.`))).toBe(true)

    await writeEvidence([
      'Scenario: cost-cap-reached',
      `daily: ${spend.todayCents}/${DEFAULT_PRIVACY_COST_CONFIG.cost.dailyCloudSpendCapCents} cents`,
      `monthly: ${spend.monthCents}/${DEFAULT_PRIVACY_COST_CONFIG.cost.monthlyCloudSpendCapCents} cents`,
      `premium realtime allowed: ${decision.allowPremiumRealtime}`,
      `premium delegation allowed: ${decision.allowPremiumDelegation}`,
      `local read-only mode: ${decision.localReadOnlyMode}`,
      `realtime status: ${realtime.ok ? 'ok' : realtime.code}`,
      `delegation status: ${delegation.job.status}`,
      `spawned workers: ${spawned}`,
      `degraded status: ${statuses[0] ?? 'none'}`,
    ].join('\n'))
  })
})
