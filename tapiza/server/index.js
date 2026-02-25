import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import Stripe from 'stripe'

import {
  ACTIVATABLE_PLAN_IDS,
  CHECKOUT_PLAN_IDS,
  PLAN_CATALOG,
  getPriceCents,
  resolveBillingCycle,
} from './planCatalog.js'
import {
  PLAN_MAP,
  SUBSCRIPTION_POLICY,
  getPlanRenderLimit,
} from '../shared/plans.js'

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
const authExposeCodes = process.env.AUTH_EXPOSE_CODES !== 'false'

const FREE_MONTHLY_RENDER_LIMIT = SUBSCRIPTION_POLICY.freeMonthlyRenderLimit
const DEFAULT_CREDIT_PACK_SIZE = SUBSCRIPTION_POLICY.creditPackSize
const VERIFICATION_CODE_EXPIRY_HOURS = SUBSCRIPTION_POLICY.emailVerificationCodeExpiryHours
const PASSWORD_RESET_EXPIRY_MINUTES = SUBSCRIPTION_POLICY.passwordRecoveryCodeExpiryMinutes

const monthPeriod = () => new Date().toISOString().slice(0, 7)
const futureIsoByHours = (hours) => {
  const date = new Date()
  date.setHours(date.getHours() + Number(hours || 0))
  return date.toISOString()
}
const futureIsoByMinutes = (minutes) => {
  const date = new Date()
  date.setMinutes(date.getMinutes() + Number(minutes || 0))
  return date.toISOString()
}
const generateNumericCode = () => `${Math.floor(100000 + Math.random() * 900000)}`
const getPlanName = (planId) => PLAN_MAP[planId]?.name || String(planId || 'Plan').toUpperCase()
const finitePlanMonthlyLimit = (planId) => {
  const limit = getPlanRenderLimit(planId)
  return Number.isFinite(limit) ? Number(limit) : null
}

const normalizeUserRecord = (user) => {
  const requestedPlanId = String(user.planId || 'free').trim()
  const normalizedPlanId =
    PLAN_MAP[requestedPlanId]?.kind === 'subscription' ? requestedPlanId : 'free'
  const monthlyLimitByPlan = finitePlanMonthlyLimit(normalizedPlanId)
  const normalized = {
    ...user,
    id: user.id,
    name: String(user.name || '').trim(),
    email: normalizeEmail(user.email),
    createdAt: user.createdAt || new Date().toISOString(),
    emailVerified: Boolean(user.emailVerified),
    verificationCode: String(user.verificationCode || ''),
    verificationExpiresAt: user.verificationExpiresAt || null,
    resetCode: String(user.resetCode || ''),
    resetExpiresAt: user.resetExpiresAt || null,
    planId: normalizedPlanId,
    freeMonthlyRendersLimit: Number(
      monthlyLimitByPlan ?? user.freeMonthlyRendersLimit ?? FREE_MONTHLY_RENDER_LIMIT,
    ),
    freeMonthlyRendersUsed: Number(user.freeMonthlyRendersUsed || 0),
    freeMonthlyPeriod: user.freeMonthlyPeriod || monthPeriod(),
    creditBalance: Math.max(0, Number(user.creditBalance || 0)),
    processedCreditPurchaseIds: Array.isArray(user.processedCreditPurchaseIds)
      ? user.processedCreditPurchaseIds.map((entry) => String(entry)).filter(Boolean).slice(-200)
      : [],
  }

  const period = monthPeriod()
  if (normalized.freeMonthlyPeriod !== period) {
    normalized.freeMonthlyPeriod = period
    normalized.freeMonthlyRendersUsed = 0
  }

  if (
    monthlyLimitByPlan !== null &&
    Number(normalized.freeMonthlyRendersLimit || 0) !== Number(monthlyLimitByPlan)
  ) {
    normalized.freeMonthlyRendersLimit = Number(monthlyLimitByPlan)
  }

  return normalized
}

const prepareActiveUser = (user) => normalizeUserRecord(user)

const quotaSnapshot = (user) => {
  const normalized = normalizeUserRecord(user)
  if (!normalized.emailVerified) {
    return {
      state: 'verify',
      blocked: true,
      message: 'Verifica tu email para activar tus cupos y creditos.',
    }
  }

  const planMonthlyLimit = Number(
    normalized.freeMonthlyRendersLimit || finitePlanMonthlyLimit(normalized.planId) || 0,
  )
  const remainingMonthly = Math.max(
    0,
    planMonthlyLimit - Number(normalized.freeMonthlyRendersUsed || 0),
  )
  const creditBalance = Math.max(0, Number(normalized.creditBalance || 0))
  const remaining = remainingMonthly + creditBalance
  const planName = getPlanName(normalized.planId)

  let message = ''
  if (remainingMonthly > 0 && creditBalance > 0) {
    message = `Plan ${planName}: te quedan ${remainingMonthly} tapizados este mes y ${creditBalance} creditos en saldo.`
  } else if (remainingMonthly > 0) {
    message =
      normalized.planId === 'free'
        ? `Plan gratis: te quedan ${remainingMonthly} tapizados este mes.`
        : `Plan ${planName}: te quedan ${remainingMonthly} tapizados este mes.`
  } else if (creditBalance > 0) {
    message = `Has agotado el cupo mensual. Te quedan ${creditBalance} creditos para seguir tapizando.`
  } else {
    message =
      normalized.planId === 'free'
        ? 'Has alcanzado el limite mensual del plan gratis. Compra creditos o pasa a Basic.'
        : `Has alcanzado el limite mensual de tu plan ${planName}. Compra creditos para continuar.`
  }

  return {
    state: normalized.planId === 'free' ? 'free' : 'paid_limited',
    blocked: remaining <= 0,
    remaining,
    monthlyRemaining: remainingMonthly,
    creditBalance,
    limit: planMonthlyLimit,
    used: normalized.freeMonthlyRendersUsed,
    period: normalized.freeMonthlyPeriod,
    message,
  }
}

const consumeUserRender = (user) => {
  let normalized = prepareActiveUser(user)
  normalized = normalizeUserRecord(normalized)
  const before = quotaSnapshot(normalized)
  if (before.blocked) {
    return { allowed: false, user: normalized, quota: before, message: before.message }
  }

  if (before.monthlyRemaining > 0) {
    normalized.freeMonthlyRendersUsed = Number(normalized.freeMonthlyRendersUsed || 0) + 1
  } else {
    normalized.creditBalance = Math.max(0, Number(normalized.creditBalance || 0) - 1)
  }

  const after = quotaSnapshot(normalized)
  return { allowed: true, user: normalized, quota: after, message: after.message }
}

const addUserCredits = (user, creditsToAdd, purchaseId = '') => {
  const normalized = normalizeUserRecord(user)
  const normalizedPurchaseId = String(purchaseId || '').trim()
  if (
    normalizedPurchaseId &&
    Array.isArray(normalized.processedCreditPurchaseIds) &&
    normalized.processedCreditPurchaseIds.includes(normalizedPurchaseId)
  ) {
    return { user: normalized, added: false }
  }

  const safeCredits = Math.max(0, Number.parseInt(creditsToAdd, 10) || 0)
  normalized.creditBalance = Math.max(0, Number(normalized.creditBalance || 0) + safeCredits)
  if (normalizedPurchaseId) {
    normalized.processedCreditPurchaseIds = [
      ...normalized.processedCreditPurchaseIds,
      normalizedPurchaseId,
    ].slice(-200)
  }
  return { user: normalizeUserRecord(normalized), added: safeCredits > 0 }
}

const sanitizeUser = (user) => {
  const normalized = normalizeUserRecord(user)
  return {
    id: normalized.id,
    name: normalized.name,
    email: normalized.email,
    createdAt: normalized.createdAt,
    emailVerified: normalized.emailVerified,
    planId: normalized.planId,
    freeMonthlyRendersLimit: normalized.freeMonthlyRendersLimit,
    freeMonthlyRendersUsed: normalized.freeMonthlyRendersUsed,
    freeMonthlyPeriod: normalized.freeMonthlyPeriod,
    creditBalance: normalized.creditBalance,
  }
}

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
    if (!Array.isArray(parsed)) return []
    return parsed.map((entry) => normalizeUserRecord(entry))
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

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
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
        try {
          const checkoutSession = event.data.object
          const customerEmail = normalizeEmail(
            checkoutSession.customer_details?.email || checkoutSession.customer_email,
          )
          const planId = String(checkoutSession.metadata?.planId || '').trim()
          const productKind = String(checkoutSession.metadata?.productKind || '').trim()
          const selectedPlan = PLAN_CATALOG[planId]
          if (isValidEmail(customerEmail) && selectedPlan) {
            await withUsersLock(async () => {
              const users = await readUsers()
              const index = users.findIndex((entry) => entry.email === customerEmail)
              if (index < 0) return

              if (productKind === 'credits' || selectedPlan.kind === 'credits') {
                const creditsFromMetadata = Number.parseInt(
                  String(checkoutSession.metadata?.creditsAmount || ''),
                  10,
                )
                const creditsToAdd =
                  creditsFromMetadata > 0 ? creditsFromMetadata : Number(selectedPlan.creditsAmount || 0)
                const { user: userWithCredits } = addUserCredits(
                  users[index],
                  creditsToAdd,
                  checkoutSession.id,
                )
                users[index] = userWithCredits
              } else if (ACTIVATABLE_PLAN_IDS.includes(planId)) {
                const user = prepareActiveUser(users[index])
                user.planId = planId
                user.freeMonthlyPeriod = monthPeriod()
                user.freeMonthlyRendersUsed = 0
                const planLimit = finitePlanMonthlyLimit(planId)
                if (planLimit !== null) {
                  user.freeMonthlyRendersLimit = planLimit
                }
                users[index] = user
              }

              await writeUsers(users)
            })
          }
        } catch (error) {
          console.error('[Stripe webhook] Error syncing user plan:', error.message)
        }
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
    availablePlans: CHECKOUT_PLAN_IDS,
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
        emailVerified: false,
        verificationCode: generateNumericCode(),
        verificationExpiresAt: futureIsoByHours(VERIFICATION_CODE_EXPIRY_HOURS),
        resetCode: '',
        resetExpiresAt: null,
        planId: 'free',
        freeMonthlyRendersLimit: FREE_MONTHLY_RENDER_LIMIT,
        freeMonthlyRendersUsed: 0,
        freeMonthlyPeriod: monthPeriod(),
        creditBalance: 0,
      }

      users.push(user)
      await writeUsers(users)
      return user
    })

    if (!createdUser) {
      return res.status(409).json({ error: 'Ya existe una cuenta registrada con ese email.' })
    }

    return res.status(201).json({
      user: sanitizeUser(createdUser),
      verification: {
        required: true,
        ...(authExposeCodes ? { code: createdUser.verificationCode } : {}),
      },
      message: 'Cuenta creada. Verifica tu email para activar tu plan.',
    })
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
    const loginResult = await withUsersLock(async () => {
      const users = await readUsers()
      const index = users.findIndex((entry) => entry.email === normalizedEmail)
      if (index < 0) {
        return { type: 'not_found' }
      }

      const user = users[index]
      if (!verifyPassword(normalizedPassword, user.passwordSalt, user.passwordHash)) {
        return { type: 'invalid_password' }
      }

      const normalizedUser = normalizeUserRecord(user)
      if (!normalizedUser.emailVerified) {
        return {
          type: 'verification_required',
          user: normalizedUser,
        }
      }

      const activatedUser = prepareActiveUser(normalizedUser)
      users[index] = activatedUser
      await writeUsers(users)
      return {
        type: 'ok',
        user: activatedUser,
      }
    })

    if (loginResult.type === 'not_found' || loginResult.type === 'invalid_password') {
      return res.status(401).json({ error: 'Credenciales incorrectas.' })
    }

    if (loginResult.type === 'verification_required') {
      return res.status(403).json({
        error: 'Debes verificar tu email antes de continuar.',
        verificationRequired: true,
      })
    }

    return res.json({
      user: sanitizeUser(loginResult.user),
      quota: quotaSnapshot(loginResult.user),
    })
  } catch (error) {
    console.error('[Auth login] Error:', error.message)
    return res.status(500).json({ error: 'No se pudo iniciar sesion.' })
  }
})

app.post('/api/auth/verify-email', async (req, res) => {
  const { email, code } = req.body || {}
  const normalizedEmail = normalizeEmail(email)
  const normalizedCode = String(code || '').trim()

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Email no valido.' })
  }
  if (!normalizedCode) {
    return res.status(400).json({ error: 'Codigo de verificacion requerido.' })
  }

  try {
    const result = await withUsersLock(async () => {
      const users = await readUsers()
      const index = users.findIndex((entry) => entry.email === normalizedEmail)
      if (index < 0) {
        return { type: 'not_found' }
      }

      const user = normalizeUserRecord(users[index])
      if (user.emailVerified) {
        const activated = prepareActiveUser(user)
        users[index] = activated
        await writeUsers(users)
        return { type: 'already_verified', user: activated }
      }

      const isExpired =
        user.verificationExpiresAt && new Date(user.verificationExpiresAt).getTime() < Date.now()
      if (isExpired) {
        return { type: 'expired' }
      }
      if (user.verificationCode !== normalizedCode) {
        return { type: 'invalid_code' }
      }

      user.emailVerified = true
      user.verificationCode = ''
      user.verificationExpiresAt = null

      const activated = prepareActiveUser(user)
      users[index] = activated
      await writeUsers(users)
      return { type: 'ok', user: activated }
    })

    if (result.type === 'not_found') {
      return res.status(404).json({ error: 'No existe una cuenta con ese email.' })
    }
    if (result.type === 'expired') {
      return res.status(400).json({ error: 'El codigo de verificacion ha expirado.' })
    }
    if (result.type === 'invalid_code') {
      return res.status(400).json({ error: 'Codigo de verificacion no valido.' })
    }

    return res.json({
      user: sanitizeUser(result.user),
      quota: quotaSnapshot(result.user),
      message:
        result.type === 'already_verified'
          ? 'Tu email ya estaba verificado.'
          : 'Email verificado correctamente.',
    })
  } catch (error) {
    console.error('[Auth verify-email] Error:', error.message)
    return res.status(500).json({ error: 'No se pudo verificar el email.' })
  }
})

app.post('/api/auth/resend-verification', async (req, res) => {
  const { email } = req.body || {}
  const normalizedEmail = normalizeEmail(email)

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Email no valido.' })
  }

  try {
    const result = await withUsersLock(async () => {
      const users = await readUsers()
      const index = users.findIndex((entry) => entry.email === normalizedEmail)
      if (index < 0) {
        return { type: 'not_found' }
      }

      const user = normalizeUserRecord(users[index])
      if (user.emailVerified) {
        return { type: 'already_verified', user }
      }

      user.verificationCode = generateNumericCode()
      user.verificationExpiresAt = futureIsoByHours(VERIFICATION_CODE_EXPIRY_HOURS)
      users[index] = user
      await writeUsers(users)
      return { type: 'ok', user }
    })

    if (result.type === 'not_found') {
      return res.status(404).json({ error: 'No existe una cuenta con ese email.' })
    }

    return res.json({
      message:
        result.type === 'already_verified'
          ? 'Ese email ya esta verificado.'
          : 'Codigo de verificacion reenviado.',
      verification: {
        required: result.type !== 'already_verified',
        ...(authExposeCodes && result.type !== 'already_verified'
          ? { code: result.user.verificationCode }
          : {}),
      },
    })
  } catch (error) {
    console.error('[Auth resend-verification] Error:', error.message)
    return res.status(500).json({ error: 'No se pudo reenviar el codigo de verificacion.' })
  }
})

app.post('/api/auth/password-recovery/request', async (req, res) => {
  const { email } = req.body || {}
  const normalizedEmail = normalizeEmail(email)

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Email no valido.' })
  }

  try {
    const result = await withUsersLock(async () => {
      const users = await readUsers()
      const index = users.findIndex((entry) => entry.email === normalizedEmail)
      if (index < 0) {
        return { type: 'not_found' }
      }

      const user = normalizeUserRecord(users[index])
      user.resetCode = generateNumericCode()
      user.resetExpiresAt = futureIsoByMinutes(PASSWORD_RESET_EXPIRY_MINUTES)
      users[index] = user
      await writeUsers(users)
      return { type: 'ok', user }
    })

    if (result.type === 'not_found') {
      return res.status(404).json({ error: 'No existe una cuenta con ese email.' })
    }

    return res.json({
      message: 'Codigo de recuperacion enviado.',
      reset: {
        ...(authExposeCodes ? { code: result.user.resetCode } : {}),
      },
    })
  } catch (error) {
    console.error('[Auth password-recovery request] Error:', error.message)
    return res.status(500).json({ error: 'No se pudo iniciar la recuperacion de contraseña.' })
  }
})

app.post('/api/auth/password-recovery/confirm', async (req, res) => {
  const { email, code, newPassword } = req.body || {}
  const normalizedEmail = normalizeEmail(email)
  const normalizedCode = String(code || '').trim()
  const normalizedPassword = String(newPassword || '')

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Email no valido.' })
  }
  if (!normalizedCode) {
    return res.status(400).json({ error: 'Codigo de recuperacion requerido.' })
  }
  if (normalizedPassword.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' })
  }

  try {
    const result = await withUsersLock(async () => {
      const users = await readUsers()
      const index = users.findIndex((entry) => entry.email === normalizedEmail)
      if (index < 0) {
        return { type: 'not_found' }
      }

      const user = normalizeUserRecord(users[index])
      if (!user.resetCode || user.resetCode !== normalizedCode) {
        return { type: 'invalid_code' }
      }
      if (user.resetExpiresAt && new Date(user.resetExpiresAt).getTime() < Date.now()) {
        return { type: 'expired' }
      }

      const { hash, salt } = hashPassword(normalizedPassword)
      user.passwordHash = hash
      user.passwordSalt = salt
      user.resetCode = ''
      user.resetExpiresAt = null

      users[index] = user
      await writeUsers(users)
      return { type: 'ok' }
    })

    if (result.type === 'not_found') {
      return res.status(404).json({ error: 'No existe una cuenta con ese email.' })
    }
    if (result.type === 'invalid_code') {
      return res.status(400).json({ error: 'Codigo de recuperacion no valido.' })
    }
    if (result.type === 'expired') {
      return res.status(400).json({ error: 'El codigo de recuperacion ha expirado.' })
    }

    return res.json({ message: 'Contraseña actualizada correctamente.' })
  } catch (error) {
    console.error('[Auth password-recovery confirm] Error:', error.message)
    return res.status(500).json({ error: 'No se pudo actualizar la contraseña.' })
  }
})

app.get('/api/auth/profile', async (req, res) => {
  const normalizedEmail = normalizeEmail(req.query?.email)
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Email no valido.' })
  }

  try {
    const result = await withUsersLock(async () => {
      const users = await readUsers()
      const index = users.findIndex((entry) => entry.email === normalizedEmail)
      if (index < 0) {
        return null
      }

      const user = prepareActiveUser(users[index])
      users[index] = user
      await writeUsers(users)
      return user
    })

    if (!result) {
      return res.status(404).json({ error: 'Usuario no encontrado.' })
    }

    return res.json({
      user: sanitizeUser(result),
      quota: quotaSnapshot(result),
    })
  } catch (error) {
    console.error('[Auth profile] Error:', error.message)
    return res.status(500).json({ error: 'No se pudo cargar el perfil.' })
  }
})

app.post('/api/auth/consume-render', async (req, res) => {
  const normalizedEmail = normalizeEmail(req.body?.email)
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Email no valido.' })
  }

  try {
    const result = await withUsersLock(async () => {
      const users = await readUsers()
      const index = users.findIndex((entry) => entry.email === normalizedEmail)
      if (index < 0) {
        return { type: 'not_found' }
      }

      const consumeResult = consumeUserRender(users[index])
      users[index] = consumeResult.user
      await writeUsers(users)
      return { type: 'ok', ...consumeResult }
    })

    if (result.type === 'not_found') {
      return res.status(404).json({ error: 'Usuario no encontrado.' })
    }

    return res.json({
      allowed: result.allowed,
      message: result.message,
      user: sanitizeUser(result.user),
      quota: result.quota,
    })
  } catch (error) {
    console.error('[Auth consume-render] Error:', error.message)
    return res.status(500).json({ error: 'No se pudo procesar la cuota de tapizados.' })
  }
})

app.post('/api/auth/activate-plan', async (req, res) => {
  const normalizedEmail = normalizeEmail(req.body?.email)
  const planId = String(req.body?.planId || '').trim()

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Email no valido.' })
  }
  if (!ACTIVATABLE_PLAN_IDS.includes(planId)) {
    return res.status(400).json({ error: 'Plan no valido para activacion.' })
  }

  try {
    const result = await withUsersLock(async () => {
      const users = await readUsers()
      const index = users.findIndex((entry) => entry.email === normalizedEmail)
      if (index < 0) {
        return { type: 'not_found' }
      }

      const user = prepareActiveUser(users[index])
      user.planId = planId
      user.freeMonthlyPeriod = monthPeriod()
      user.freeMonthlyRendersUsed = 0
      const planLimit = finitePlanMonthlyLimit(planId)
      if (planLimit !== null) {
        user.freeMonthlyRendersLimit = planLimit
      }
      users[index] = user
      await writeUsers(users)
      return { type: 'ok', user }
    })

    if (result.type === 'not_found') {
      return res.status(404).json({ error: 'Usuario no encontrado.' })
    }

    return res.json({
      user: sanitizeUser(result.user),
      quota: quotaSnapshot(result.user),
      message: `Plan ${getPlanName(planId)} activado.`,
    })
  } catch (error) {
    console.error('[Auth activate-plan] Error:', error.message)
    return res.status(500).json({ error: 'No se pudo activar el plan.' })
  }
})

app.post('/api/auth/add-credits', async (req, res) => {
  const normalizedEmail = normalizeEmail(req.body?.email)
  const requestedCredits = Number.parseInt(String(req.body?.credits || DEFAULT_CREDIT_PACK_SIZE), 10)
  const creditsToAdd = Number.isFinite(requestedCredits) ? requestedCredits : DEFAULT_CREDIT_PACK_SIZE
  const purchaseId = String(req.body?.purchaseId || '').trim()

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Email no valido.' })
  }
  if (creditsToAdd <= 0) {
    return res.status(400).json({ error: 'La cantidad de creditos debe ser mayor que cero.' })
  }
  if (creditsToAdd > 10000) {
    return res.status(400).json({ error: 'Cantidad de creditos fuera de rango.' })
  }

  try {
    const result = await withUsersLock(async () => {
      const users = await readUsers()
      const index = users.findIndex((entry) => entry.email === normalizedEmail)
      if (index < 0) {
        return { type: 'not_found' }
      }

      const { user: userWithCredits, added } = addUserCredits(users[index], creditsToAdd, purchaseId)
      users[index] = userWithCredits
      await writeUsers(users)
      return { type: 'ok', user: userWithCredits, added }
    })

    if (result.type === 'not_found') {
      return res.status(404).json({ error: 'Usuario no encontrado.' })
    }

    return res.json({
      user: sanitizeUser(result.user),
      quota: quotaSnapshot(result.user),
      message: result.added
        ? `${creditsToAdd} creditos agregados correctamente.`
        : 'Los creditos de esta compra ya estaban aplicados.',
    })
  } catch (error) {
    console.error('[Auth add-credits] Error:', error.message)
    return res.status(500).json({ error: 'No se pudieron agregar los creditos.' })
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

    if (!plan || !CHECKOUT_PLAN_IDS.includes(plan.id) || plan.free) {
      return res.status(400).json({ error: 'Plan no valido para checkout.' })
    }

    const cycle = resolveBillingCycle(billingCycle)
    const appOrigin = normalizeOrigin(origin) || defaultAppBaseUrl
    const unitAmount = getPriceCents(plan, cycle)
    const isCreditPack = plan.kind === 'credits'

    const lineItem = isCreditPack
      ? {
          quantity: 1,
          price_data: {
            currency: stripeCurrency,
            unit_amount: unitAmount,
            product_data: {
              name: `Tapiza.online ${plan.name}`,
              description:
                plan.description || `Pack de ${Number(plan.creditsAmount || 0)} creditos para Tapiza.online`,
            },
          },
        }
      : {
          quantity: 1,
          price_data: {
            currency: stripeCurrency,
            recurring: { interval: 'month' },
            unit_amount: unitAmount,
            product_data: {
              name: `Tapiza.online ${plan.name} (Mensual)`,
              description: plan.description,
            },
          },
        }

    const session = await stripe.checkout.sessions.create({
      mode: isCreditPack ? 'payment' : 'subscription',
      allow_promotion_codes: true,
      success_url: `${appOrigin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appOrigin}/?checkout=cancelled`,
      customer_email: customerEmail || undefined,
      client_reference_id: clientReferenceId || undefined,
      line_items: [lineItem],
      metadata: {
        planId: plan.id,
        billingCycle: cycle,
        productKind: isCreditPack ? 'credits' : 'subscription',
        creditsAmount: isCreditPack ? String(Number(plan.creditsAmount || 0)) : '',
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
