export const ANNUAL_DISCOUNT_RATE = 0.2

export const PLAN_DEFINITIONS = [
  {
    id: 'free',
    name: 'Gratis',
    audience: 'Probadores',
    monthlyPrice: 0,
    current: true,
    icon: 'FREE',
    cta: 'Plan actual',
    description: 'Plan de prueba sin suscripcion.',
    features: ['5 renders/mes', 'Catalogo basico', 'Descarga de imagenes'],
  },
  {
    id: 'basic',
    name: 'Basico',
    audience: 'Tapiceros autonomos',
    monthlyPrice: 19,
    icon: 'BASIC',
    cta: 'Suscribirse',
    description: 'Tapiceros autonomos.',
    features: [
      '50 renders/mes',
      'Catalogo completo',
      'Subir 5 telas propias',
      'Soporte por email',
    ],
  },
  {
    id: 'professional',
    name: 'Profesional',
    audience: 'Decoradores',
    monthlyPrice: 49,
    popular: true,
    icon: 'PRO',
    cta: 'Suscribirse',
    description: 'Decoradores y estudios de interiorismo.',
    features: [
      '200 renders/mes',
      'Subir muebles y telas',
      'Marcas favoritas',
      'Historial de proyectos',
      'Soporte prioritario',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    audience: 'Contract / Empresas',
    monthlyPrice: 99,
    icon: 'BIZ',
    cta: 'Suscribirse',
    description: 'Equipos contract y empresas.',
    features: [
      'Renders ilimitados',
      'API access',
      'Multi-usuario (5)',
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
    description: 'Grandes estudios con soporte dedicado.',
    features: [
      'Todo lo de Business',
      'SLA garantizado',
      'Integraciones custom',
      'Account manager',
      'Onboarding personalizado',
    ],
  },
]

export const PLAN_MAP = Object.fromEntries(
  PLAN_DEFINITIONS.map((plan) => [plan.id, plan]),
)
