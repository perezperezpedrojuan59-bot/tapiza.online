export const ANNUAL_DISCOUNT_RATE = 0.2

export const SUBSCRIPTION_POLICY = {
  guestRenderLimit: 1,
  trialDurationDays: 14,
  trialRenderLimit: 60,
  freeMonthlyRenderLimit: 5,
  emailVerificationCodeExpiryHours: 24,
  passwordRecoveryCodeExpiryMinutes: 30,
}

export const PLAN_DEFINITIONS = [
  {
    id: 'free',
    name: 'Free',
    audience: 'Inicio',
    monthlyPrice: 0,
    current: true,
    icon: 'FREE',
    cta: 'Plan actual',
    monthlyRenderLimit: SUBSCRIPTION_POLICY.freeMonthlyRenderLimit,
    description: 'Para probar la plataforma con un ritmo mensual controlado.',
    features: [
      `${SUBSCRIPTION_POLICY.freeMonthlyRenderLimit} renders/mes`,
      'Catalogo basico',
      '1 usuario',
      'Exportacion estandar',
    ],
  },
  {
    id: 'basic',
    name: 'Starter',
    audience: 'Tapiceros autonomos',
    monthlyPrice: 19,
    icon: 'BASIC',
    cta: 'Suscribirse',
    monthlyRenderLimit: 120,
    description: 'Ideal para profesionales individuales que quieren velocidad y control.',
    features: [
      '120 renders/mes',
      'Catalogo completo',
      'Subir 15 telas propias',
      'Soporte por email',
    ],
  },
  {
    id: 'professional',
    name: 'Pro',
    audience: 'Decoradores',
    monthlyPrice: 49,
    popular: true,
    icon: 'PRO',
    cta: 'Suscribirse',
    monthlyRenderLimit: 400,
    description: 'Pensado para interioristas que gestionan multiples proyectos al mes.',
    features: [
      '400 renders/mes',
      'Subir muebles y telas',
      'Marcas favoritas',
      'Historial de proyectos',
      'Soporte prioritario',
    ],
  },
  {
    id: 'business',
    name: 'Studio',
    audience: 'Contract / Empresas',
    monthlyPrice: 99,
    icon: 'BIZ',
    cta: 'Suscribirse',
    monthlyRenderLimit: 1500,
    description: 'Para estudios y equipos comerciales con carga intensiva.',
    features: [
      '1.500 renders/mes',
      'API access',
      'Multi-usuario (10)',
      'Brand customization',
      'Soporte dedicado',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    audience: 'Grandes estudios',
    monthlyPrice: 249,
    icon: 'ENT',
    cta: 'Suscribirse',
    monthlyRenderLimit: null,
    description: 'Grandes estudios con soporte dedicado y SLA empresarial.',
    features: [
      'Todo lo de Studio',
      'Renders ilimitados',
      'SLA garantizado',
      'Integraciones custom',
      'Account manager',
    ],
  },
]

export const PLAN_MAP = Object.fromEntries(
  PLAN_DEFINITIONS.map((plan) => [plan.id, plan]),
)

export const getPlanById = (planId) => PLAN_MAP[planId] || PLAN_MAP.free

export const getPlanRenderLimit = (planId) => {
  const plan = getPlanById(planId)
  if (typeof plan.monthlyRenderLimit === 'number') return plan.monthlyRenderLimit
  if (plan.monthlyRenderLimit === null) return null
  return SUBSCRIPTION_POLICY.freeMonthlyRenderLimit
}

export const isPlanUnlimited = (planId) => getPlanRenderLimit(planId) === null
