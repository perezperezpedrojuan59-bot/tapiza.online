import { ANNUAL_DISCOUNT_RATE, PLAN_DEFINITIONS } from '../shared/plans.js'

export const PLAN_CATALOG = Object.fromEntries(
  PLAN_DEFINITIONS.map((plan) => [
    plan.id,
    {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      monthlyPriceCents: Math.round(plan.monthlyPrice * 100),
      monthlyRenderLimit: plan.monthlyRenderLimit,
      free: plan.monthlyPrice <= 0,
    },
  ]),
)

export const PLAN_IDS = Object.keys(PLAN_CATALOG)

export const resolveBillingCycle = (value) => (value === 'annual' ? 'annual' : 'monthly')

export const getPriceCents = (plan, billingCycle) => {
  if (!plan || plan.free) return 0

  if (billingCycle === 'annual') {
    const annualMonthlyEuros = Math.round(
      (plan.monthlyPriceCents / 100) * (1 - ANNUAL_DISCOUNT_RATE),
    )
    return annualMonthlyEuros * 100 * 12
  }

  return plan.monthlyPriceCents
}
