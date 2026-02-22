import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = Number(process.env.STRIPE_SERVER_PORT || 8787)
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || ''
const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY || ''
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''
const stripeCurrency = (process.env.STRIPE_CURRENCY || 'eur').toLowerCase()
const defaultAppBaseUrl = process.env.APP_BASE_URL || 'http://localhost:5173'
const authDataDirectory = path.resolve(__dirname, './data')
const authUsersFilePath = path.resolve(authDataDirectory, 'users.json')

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null
let usersLock = Promise.resolve()

const normalizeOrigin = (value) => {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.origin
  } catch {
    return null
  }
}

const normalizeEmail = (value) => String(value || '').trim().toLowerCase()
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value))

const sanitizeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  createdAt: user.createdAt,
})

const withUsersLock = async (work) => {
  const previousLock = usersLock
  let releaseLock
  usersLock = new Promise((resolve) => {
    releaseLock = resolve
  })

  await previousLock
  try {
    return await work()
  } finally {
    releaseLock()
  }
}

const ensureUsersFile = async () => {
  await fs.mkdir(authDataDirectory, { recursive: true })
  try {
    await fs.access(authUsersFilePath)
  } catch {
    await fs.writeFile(authUsersFilePath, '[]', 'utf8')
  }
}

const readUsers = async () => {
  await ensureUsersFile()
  try {
    const raw = await fs.readFile(authUsersFilePath, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeUsers = async (users) => {
  await ensureUsersFile()
  await fs.writeFile(authUsersFilePath, JSON.stringify(users, null, 2), 'utf8')
}

const hashPassword = (password, salt = randomBytes(16).toString('hex')) => ({
  salt,
  hash: scryptSync(String(password || ''), salt, 64).toString('hex'),
})

const verifyPassword = (password, salt, storedHash) => {
  try {
    const derived = scryptSync(String(password || ''), String(salt || ''), 64)
    const stored = Buffer.from(String(storedHash || ''), 'hex')
    if (stored.length !== derived.length) return false
    return timingSafeEqual(derived, stored)
  } catch {
    return false
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

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body || {}
  const normalizedName = String(name || '').trim()
  const normalizedEmail = normalizeEmail(email)
  const normalizedPassword = String(password || '')

  if (normalizedName.length < 2) {
    return res.status(400).json({ error: 'El nombre debe tener al menos 2 caracteres.' })
  }
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Email no valido.' })
  }
  if (normalizedPassword.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' })
  }

  try {
    const createdUser = await withUsersLock(async () => {
      const users = await readUsers()
      if (users.some((user) => user.email === normalizedEmail)) {
        return null
      }

      const { hash, salt } = hashPassword(normalizedPassword)
      const user = {
        id: `usr_${randomUUID()}`,
        name: normalizedName,
        email: normalizedEmail,
        passwordHash: hash,
        passwordSalt: salt,
        createdAt: new Date().toISOString(),
      }

      users.push(user)
      await writeUsers(users)
      return user
    })

    if (!createdUser) {
      return res.status(409).json({ error: 'Ya existe una cuenta registrada con ese email.' })
    }

    return res.status(201).json({ user: sanitizeUser(createdUser) })
  } catch (error) {
    console.error('[Auth register] Error:', error.message)
    return res.status(500).json({ error: 'No se pudo completar el registro.' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {}
  const normalizedEmail = normalizeEmail(email)
  const normalizedPassword = String(password || '')

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Email no valido.' })
  }
  if (!normalizedPassword) {
    return res.status(400).json({ error: 'Contraseña requerida.' })
  }

  try {
    const users = await readUsers()
    const user = users.find((entry) => entry.email === normalizedEmail)

    if (!user || !verifyPassword(normalizedPassword, user.passwordSalt, user.passwordHash)) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' })
    }

    return res.json({ user: sanitizeUser(user) })
  } catch (error) {
    console.error('[Auth login] Error:', error.message)
    return res.status(500).json({ error: 'No se pudo iniciar sesion.' })
  }
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
