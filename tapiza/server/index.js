import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import Stripe from 'stripe'

import {
  PLAN_CATALOG,
  PLAN_IDS,
  getPriceCents,
  resolveBillingCycle,
} from './planCatalog.js'

dotenv.config()

const app = express()
const port = Number(process.env.STRIPE_SERVER_PORT || 8787)
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || ''
const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY || ''
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''
const stripeCurrency = (process.env.STRIPE_CURRENCY || 'eur').toLowerCase()
const defaultAppBaseUrl = process.env.APP_BASE_URL || 'http://localhost:5173'

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null

const normalizeOrigin = (value) => {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.origin
  } catch {
    return null
  }
}

app.use(cors({ origin: true, credentials: true }))

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe server no configurado.' })
  }

  try {
    let event

    if (stripeWebhookSecret) {
      const signature = req.headers['stripe-signature']
      event = stripe.webhooks.constructEvent(req.body, signature, stripeWebhookSecret)
    } else {
      event = JSON.parse(req.body.toString('utf-8'))
    }

    switch (event.type) {
      case 'checkout.session.completed':
        console.log('[Stripe webhook] checkout.session.completed', event.data.object.id)
        break
      case 'invoice.paid':
        console.log('[Stripe webhook] invoice.paid', event.data.object.id)
        break
      case 'customer.subscription.deleted':
        console.log(
          '[Stripe webhook] customer.subscription.deleted',
          event.data.object.id,
        )
        break
      default:
        console.log('[Stripe webhook] event', event.type)
        break
    }

    return res.json({ received: true })
  } catch (error) {
    console.error('[Stripe webhook] Error:', error.message)
    return res.status(400).send(`Webhook error: ${error.message}`)
  }
})

app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, stripeConfigured: Boolean(stripe) })
})

app.get('/api/stripe/config', (_req, res) => {
  res.json({
    publishableKey: stripePublishableKey,
    stripeConfigured: Boolean(stripe),
    availablePlans: PLAN_IDS,
    currency: stripeCurrency,
  })
})

app.post('/api/stripe/checkout-session', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({
      error:
        'Stripe no esta configurado. Define STRIPE_SECRET_KEY en el servidor para monetizacion.',
    })
  }

  try {
    const { planId, billingCycle, origin, customerEmail, clientReferenceId } = req.body || {}
    const plan = PLAN_CATALOG[planId]

    if (!plan || plan.free) {
      return res.status(400).json({ error: 'Plan no valido para checkout.' })
    }

    const cycle = resolveBillingCycle(billingCycle)
    const appOrigin = normalizeOrigin(origin) || defaultAppBaseUrl
    const unitAmount = getPriceCents(plan, cycle)
    const interval = cycle === 'annual' ? 'year' : 'month'
    const intervalLabel = cycle === 'annual' ? 'Anual' : 'Mensual'

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      allow_promotion_codes: true,
      success_url: `${appOrigin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appOrigin}/?checkout=cancelled`,
      customer_email: customerEmail || undefined,
      client_reference_id: clientReferenceId || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: stripeCurrency,
            recurring: { interval },
            unit_amount: unitAmount,
            product_data: {
              name: `Tapiza.online ${plan.name} (${intervalLabel})`,
              description: plan.description,
            },
          },
        },
      ],
      metadata: {
        planId: plan.id,
        billingCycle: cycle,
      },
    })

    return res.json({ sessionId: session.id, url: session.url })
  } catch (error) {
    console.error('[Stripe checkout] Error:', error.message)
    return res.status(500).json({
      error: 'No se pudo crear la sesion de pago.',
      details: error.message,
    })
  }
})

app.listen(port, () => {
  console.log(`Stripe server escuchando en http://localhost:${port}`)
})
