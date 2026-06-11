import { describe, expect, it } from 'vitest'
import { DEGRADED_MODE_DESCRIPTORS, type DegradedMode } from './degraded-mode.js'
import { DEFAULT_PRIVACY_COST_CONFIG, resolvePrivacyCostConfig } from './privacy-cost-config.js'

const approval = {
  allowRaisedCaps: true,
  auditEntry: {
    approvedBy: 'Joey',
    approvedAt: '2026-06-10T00:00:00.000Z',
    reason: 'Explicit temporary cap raise for test only.',
  },
}

describe('privacy and cost guardrail config', () => {
  it('uses fixed conservative defaults for realtime, delegation, cost, and retention', () => {
    expect(DEFAULT_PRIVACY_COST_CONFIG).toMatchObject({
      realtime: { maxActiveSessions: 1, sessionRenewalMs: 30 * 60 * 1000 },
      delegation: { maxTotalJobs: 2, maxPremiumDelegatedJobs: 1, delegatedJobTimeoutMs: 20 * 60 * 1000 },
      cost: { dailyCloudSpendCapCents: 1000, monthlyCloudSpendCapCents: 10000 },
      retention: { retainRawAudio: false },
    })
  })

  it('allows lower caps while rejecting cap raises without approval audit metadata', () => {
    const lowered = resolvePrivacyCostConfig({
      realtime: { maxActiveSessions: 1, sessionRenewalMs: 10 * 60 * 1000 },
      delegation: { maxTotalJobs: 1, maxPremiumDelegatedJobs: 0, delegatedJobTimeoutMs: 5 * 60 * 1000 },
      cost: { dailyCloudSpendCapCents: 500, monthlyCloudSpendCapCents: 5000 },
    })

    expect(lowered.delegation.maxTotalJobs).toBe(1)
    expect(lowered.delegation.maxPremiumDelegatedJobs).toBe(0)
    expect(lowered.cost.dailyCloudSpendCapCents).toBe(500)

    expect(() => resolvePrivacyCostConfig({ delegation: { maxTotalJobs: 3 } })).toThrow(/cannot be raised/)
    expect(() => resolvePrivacyCostConfig({ cost: { dailyCloudSpendCapCents: 1001 } })).toThrow(/cannot be raised/)
    expect(() => resolvePrivacyCostConfig({ retention: { retainRawAudio: true } })).toThrow(/Raw audio retention/)
    expect(resolvePrivacyCostConfig({ delegation: { maxTotalJobs: 3 } }, approval).delegation.maxTotalJobs).toBe(3)
  })

  it('keeps raw audio retention disabled by default', () => {
    expect(DEFAULT_PRIVACY_COST_CONFIG.retention.retainRawAudio).toBe(false)
  })

  it('covers all required degraded-mode matrix entries with short spoken text', () => {
    const required: DegradedMode[] = [
      'realtime_unavailable',
      'local_mic_denied',
      'openviking_unavailable',
      'opencode_unavailable',
      'read_only_service_failure',
      'face_bridge_unavailable',
      'cost_cap_reached',
      'network_drop',
    ]

    for (const mode of required) {
      expect(DEGRADED_MODE_DESCRIPTORS[mode]).toMatchObject({ mode, menubarState: 'degraded' })
      expect(DEGRADED_MODE_DESCRIPTORS[mode].spoken.length).toBeLessThanOrEqual(120)
    }
  })
})
