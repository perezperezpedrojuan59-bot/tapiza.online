export const PLAN_CATALOG = {
  free: {
    id: 'free',
    name: 'Gratis',
    description: 'Plan de prueba sin suscripcion.',
    monthlyPriceCents: 0,
    free: true,
  },
  basic: {
    id: 'basic',
    name: 'Basico',
    description: 'Tapiceros autonomos.',
    monthlyPriceCents: 1900,
  },
  professional: {
    id: 'professional',
    name: 'Profesional',
    description: 'Decoradores y estudios de interiorismo.',
    monthlyPriceCents: 4900,
  },
  business: {
    id: 'business',
    name: 'Business',
    description: 'Equipos contract y empresas.',
    monthlyPriceCents: 9900,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Grandes estudios con soporte dedicado.',
    monthlyPriceCents: 24900,
  },
}

export const PLAN_IDS = Object.keys(PLAN_CATALOG)
export const ANNUAL_DISCOUNT_RATE = 0.2

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
