import { CHECKOUT_PLAN_DEFINITIONS, PLAN_DEFINITIONS } from '../shared/plans.js'

export const PLAN_CATALOG = Object.fromEntries(
  PLAN_DEFINITIONS.map((plan) => [
    plan.id,
    {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      kind: plan.kind || 'subscription',
      monthlyPriceCents: Math.round((plan.monthlyPrice || 0) * 100),
      oneTimePriceCents: Math.round((plan.oneTimePrice || 0) * 100),
      monthlyRenderLimit: plan.monthlyRenderLimit,
      creditsAmount: Number(plan.creditsAmount || 0),
      free: (plan.monthlyPrice || 0) <= 0 && (plan.oneTimePrice || 0) <= 0,
    },
  ]),
)

export const PLAN_IDS = Object.keys(PLAN_CATALOG)
export const CHECKOUT_PLAN_IDS = CHECKOUT_PLAN_DEFINITIONS.map((plan) => plan.id)
export const ACTIVATABLE_PLAN_IDS = PLAN_DEFINITIONS.filter(
  (plan) => (plan.kind || 'subscription') === 'subscription' && (plan.monthlyPrice || 0) > 0,
).map((plan) => plan.id)

export const resolveBillingCycle = () => 'monthly'

export const getPriceCents = (plan) => {
  if (!plan || plan.free) return 0

  if (plan.kind === 'credits') {
    return Number(plan.oneTimePriceCents || 0)
  }

  return Number(plan.monthlyPriceCents || 0)
}
