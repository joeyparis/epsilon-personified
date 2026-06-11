import { DEGRADED_MODE_DESCRIPTORS } from './degraded-mode.js'
import { DEFAULT_PRIVACY_COST_CONFIG, type PrivacyCostConfig } from './privacy-cost-config.js'

export interface EstimatedCloudSpend {
  todayCents: number
  monthCents: number
}

export interface CostGuardrailDecision {
  capReached: boolean
  localReadOnlyMode: boolean
  allowPremiumRealtime: boolean
  allowPremiumDelegation: boolean
  reason: string
}

export function evaluateCloudSpend(
  spend: EstimatedCloudSpend,
  config: Pick<PrivacyCostConfig, 'cost'> = DEFAULT_PRIVACY_COST_CONFIG,
): CostGuardrailDecision {
  const dailyReached = spend.todayCents >= config.cost.dailyCloudSpendCapCents
  const monthlyReached = spend.monthCents >= config.cost.monthlyCloudSpendCapCents
  const capReached = dailyReached || monthlyReached
  const reason = capReached
    ? `${DEGRADED_MODE_DESCRIPTORS.cost_cap_reached.text} Daily: ${spend.todayCents}/${config.cost.dailyCloudSpendCapCents} cents. Monthly: ${spend.monthCents}/${config.cost.monthlyCloudSpendCapCents} cents.`
    : 'Cloud cost caps have budget remaining.'

  return {
    capReached,
    localReadOnlyMode: capReached,
    allowPremiumRealtime: !capReached,
    allowPremiumDelegation: !capReached,
    reason,
  }
}
