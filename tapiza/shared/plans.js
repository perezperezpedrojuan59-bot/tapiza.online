export const SUBSCRIPTION_POLICY = {
  guestRenderLimit: 1,
  freeMonthlyRenderLimit: 5,
  basicMonthlyRenderLimit: 30,
  basicMonthlyUploadActionsLimit: 15,
  creditPackSize: 20,
  creditPackPriceEuros: 19,
  emailVerificationCodeExpiryHours: 24,
  passwordRecoveryCodeExpiryMinutes: 30,
}

export const PLAN_DEFINITIONS = [
  {
    id: 'free',
    kind: 'subscription',
    name: 'Free',
    audience: 'Para empezar',
    monthlyPrice: 0,
    current: true,
    icon: 'FREE',
    cta: 'Plan actual',
    monthlyRenderLimit: SUBSCRIPTION_POLICY.freeMonthlyRenderLimit,
    monthlyFurnitureUploadActionsLimit: 0,
    monthlyFabricUploadActionsLimit: 0,
    description: 'Acceso gratuito con cuota mensual de tapizados.',
    features: [
      `${SUBSCRIPTION_POLICY.freeMonthlyRenderLimit} tapizados/mes`,
      'Catalogo completo de telas',
      'Descarga en PDF',
    ],
  },
  {
    id: 'basic',
    kind: 'subscription',
    name: 'Basic',
    audience: 'Uso profesional',
    monthlyPrice: 19,
    icon: 'BASIC',
    cta: 'Suscribirse',
    monthlyRenderLimit: SUBSCRIPTION_POLICY.basicMonthlyRenderLimit,
    monthlyFurnitureUploadActionsLimit: SUBSCRIPTION_POLICY.basicMonthlyUploadActionsLimit,
    monthlyFabricUploadActionsLimit: SUBSCRIPTION_POLICY.basicMonthlyUploadActionsLimit,
    description: 'Plan mensual para ritmo constante con cupos ampliados.',
    features: [
      `${SUBSCRIPTION_POLICY.basicMonthlyRenderLimit} tapizados/mes`,
      'Subir 15 telas propias',
      'Subir 15 muebles propios',
      'Catalogo completo de telas',
      'Descarga en PDF',
    ],
  },
  {
    id: 'credit-pack-20',
    kind: 'credits',
    name: 'Comprar creditos',
    audience: 'Pago por uso',
    oneTimePrice: SUBSCRIPTION_POLICY.creditPackPriceEuros,
    icon: 'CRED',
    cta: 'Comprar creditos',
    creditsAmount: SUBSCRIPTION_POLICY.creditPackSize,
    description: 'Recarga de creditos para ampliar acciones cuando lo necesites.',
    features: [
      `${SUBSCRIPTION_POLICY.creditPackPriceEuros} EUR = ${SUBSCRIPTION_POLICY.creditPackSize} creditos`,
      '1 tapizado = 1 credito',
      '1 mueble subido = 1 credito',
      '1 tela subida = 1 credito',
      'Catalogo completo de telas',
      'Descarga en PDF',
    ],
  },
]

export const SUBSCRIPTION_PLAN_DEFINITIONS = PLAN_DEFINITIONS.filter(
  (plan) => plan.kind === 'subscription',
)

export const CHECKOUT_PLAN_DEFINITIONS = PLAN_DEFINITIONS.filter(
  (plan) => plan.monthlyPrice > 0 || plan.oneTimePrice > 0,
)

export const PLAN_MAP = Object.fromEntries(
  PLAN_DEFINITIONS.map((plan) => [plan.id, plan]),
)

export const getPlanById = (planId) => PLAN_MAP[planId] || PLAN_MAP.free

export const getPlanRenderLimit = (planId) => {
  const plan = getPlanById(planId)
  if (plan.kind !== 'subscription') {
    return SUBSCRIPTION_POLICY.freeMonthlyRenderLimit
  }
  if (typeof plan.monthlyRenderLimit === 'number') return plan.monthlyRenderLimit
  return SUBSCRIPTION_POLICY.freeMonthlyRenderLimit
}

export const getPlanMonthlyUploadActionsLimit = (planId) => {
  const plan = getPlanById(planId)
  if (plan.kind !== 'subscription') return 0
  return Number(plan.monthlyFurnitureUploadActionsLimit || 0)
}

export const isPlanUnlimited = (_planId) => false
