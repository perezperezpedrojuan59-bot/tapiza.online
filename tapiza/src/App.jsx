import { useEffect, useMemo, useRef, useState } from 'react'
import { ANNUAL_DISCOUNT_RATE, PLAN_DEFINITIONS } from '../shared/plans.js'
import { FROCA_FABRICS, FROCA_FABRIC_COUNTS } from '../shared/frocaFabrics.js'
import { STRIPE_PAYMENT_LINKS } from '../shared/stripePaymentLinks.js'
import './App.css'

const assetUrl = (path) => {
  const cleanPath = String(path).replace(/^\/+/, '')
  return `${import.meta.env.BASE_URL}${cleanPath}`
}

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_STRIPE_API_BASE_URL ||
  ''
).trim()

const apiUrl = (path) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath
}

const getDirectPaymentLink = (planId, billingCycle) =>
  STRIPE_PAYMENT_LINKS[planId]?.[billingCycle] || ''

const AUTH_USERS_STORAGE_KEY = 'tapiza.localUsers.v1'
const AUTH_SESSION_STORAGE_KEY = 'tapiza.authSession.v1'
const AUTH_PENDING_PLAN_STORAGE_KEY = 'tapiza.pendingPlan.v1'
const GUEST_RENDER_USAGE_KEY = 'tapiza.guestRenderUsage.v1'

const TRIAL_DURATION_DAYS = 14
const TRIAL_RENDER_LIMIT = 120
const FREE_MONTHLY_RENDER_LIMIT = 5
const GUEST_RENDER_LIMIT = 1

const normalizeEmail = (value) => String(value || '').trim().toLowerCase()
const isEmailValid = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value))
const currentMonthPeriod = () => new Date().toISOString().slice(0, 7)
const generateNumericCode = () => `${Math.floor(100000 + Math.random() * 900000)}`

const trialEndIso = () => {
  const date = new Date()
  date.setDate(date.getDate() + TRIAL_DURATION_DAYS)
  return date.toISOString()
}

const codeExpiryIso = (hours = 24) => {
  const date = new Date()
  date.setHours(date.getHours() + hours)
  return date.toISOString()
}

const hashPasswordInBrowser = async (password) => {
  const normalizedPassword = String(password || '')
  if (!normalizedPassword) return ''

  if (typeof window !== 'undefined' && window.crypto?.subtle && window.TextEncoder) {
    const input = new TextEncoder().encode(normalizedPassword)
    const digest = await window.crypto.subtle.digest('SHA-256', input)
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  }

  return btoa(normalizedPassword)
}

const readLocalUsers = () => {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(AUTH_USERS_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeLocalUsers = (users) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(AUTH_USERS_STORAGE_KEY, JSON.stringify(users))
}

const normalizeStoredUser = (user) => {
  const normalized = {
    ...user,
    id: user.id,
    name: String(user.name || '').trim(),
    email: normalizeEmail(user.email),
    createdAt: user.createdAt || new Date().toISOString(),
    provider: user.provider || 'local',
    emailVerified: Boolean(user.emailVerified),
    planId: user.planId || 'free',
    trialStartedAt: user.trialStartedAt || null,
    trialEndsAt: user.trialEndsAt || null,
    trialRendersLimit: Number(user.trialRendersLimit || TRIAL_RENDER_LIMIT),
    trialRendersUsed: Number(user.trialRendersUsed || 0),
    freeMonthlyRendersLimit: Number(user.freeMonthlyRendersLimit || FREE_MONTHLY_RENDER_LIMIT),
    freeMonthlyRendersUsed: Number(user.freeMonthlyRendersUsed || 0),
    freeMonthlyPeriod: user.freeMonthlyPeriod || currentMonthPeriod(),
    verificationCode: user.verificationCode || '',
    verificationExpiresAt: user.verificationExpiresAt || null,
    resetCode: user.resetCode || '',
    resetExpiresAt: user.resetExpiresAt || null,
    passwordHash: user.passwordHash || '',
  }

  const period = currentMonthPeriod()
  if (normalized.freeMonthlyPeriod !== period) {
    normalized.freeMonthlyPeriod = period
    normalized.freeMonthlyRendersUsed = 0
  }

  return normalized
}

const sanitizeAuthUser = (user) => {
  const normalized = normalizeStoredUser(user)
  return {
    id: normalized.id,
    name: normalized.name,
    email: normalized.email,
    createdAt: normalized.createdAt,
    provider: normalized.provider,
    emailVerified: normalized.emailVerified,
    planId: normalized.planId,
    trialStartedAt: normalized.trialStartedAt,
    trialEndsAt: normalized.trialEndsAt,
    trialRendersLimit: normalized.trialRendersLimit,
    trialRendersUsed: normalized.trialRendersUsed,
    freeMonthlyRendersLimit: normalized.freeMonthlyRendersLimit,
    freeMonthlyRendersUsed: normalized.freeMonthlyRendersUsed,
    freeMonthlyPeriod: normalized.freeMonthlyPeriod,
  }
}

const isTrialActive = (user) => {
  if (!user?.trialEndsAt) return false
  return new Date(user.trialEndsAt).getTime() > Date.now()
}

const withTrialIfEligible = (user) => {
  const normalized = normalizeStoredUser(user)
  if (!normalized.emailVerified) return normalized

  if (!normalized.trialStartedAt) {
    normalized.trialStartedAt = new Date().toISOString()
    normalized.trialEndsAt = trialEndIso()
    normalized.trialRendersLimit = TRIAL_RENDER_LIMIT
    normalized.trialRendersUsed = 0
  }

  return normalized
}

const upsertLocalUser = (draftUser) => {
  const normalizedDraft = normalizeStoredUser(draftUser)
  const users = readLocalUsers().map((entry) => normalizeStoredUser(entry))
  const index = users.findIndex((entry) => entry.email === normalizedDraft.email)

  if (index >= 0) {
    users[index] = normalizedDraft
  } else {
    users.push(normalizedDraft)
  }

  writeLocalUsers(users)
  return normalizedDraft
}

const readLocalUserByEmail = (email) => {
  const normalizedEmail = normalizeEmail(email)
  const users = readLocalUsers().map((entry) => normalizeStoredUser(entry))
  return users.find((entry) => entry.email === normalizedEmail) || null
}

const saveAuthSession = (user) => {
  if (typeof window === 'undefined' || !user) return
  window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(sanitizeAuthUser(user)))
}

const readAuthSession = () => {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)
    if (!raw) return null
    return sanitizeAuthUser(JSON.parse(raw))
  } catch {
    return null
  }
}

const clearAuthSession = () => {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
}

const registerLocalUser = async ({ name, email, password }) => {
  const normalizedEmail = normalizeEmail(email)
  const users = readLocalUsers().map((entry) => normalizeStoredUser(entry))

  if (users.some((user) => normalizeEmail(user.email) === normalizedEmail)) {
    throw new Error('Ya existe una cuenta registrada con ese email.')
  }

  const passwordHash = await hashPasswordInBrowser(password)
  const user = {
    id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    name: String(name || '').trim(),
    email: normalizedEmail,
    passwordHash,
    createdAt: new Date().toISOString(),
    provider: 'local',
    emailVerified: false,
    planId: 'free',
    trialStartedAt: null,
    trialEndsAt: null,
    trialRendersLimit: TRIAL_RENDER_LIMIT,
    trialRendersUsed: 0,
    freeMonthlyRendersLimit: FREE_MONTHLY_RENDER_LIMIT,
    freeMonthlyRendersUsed: 0,
    freeMonthlyPeriod: currentMonthPeriod(),
    verificationCode: generateNumericCode(),
    verificationExpiresAt: codeExpiryIso(24),
    resetCode: '',
    resetExpiresAt: null,
  }

  users.push(user)
  writeLocalUsers(users)
  saveAuthSession(user)
  return {
    user: sanitizeAuthUser(user),
    verification: { required: true, code: user.verificationCode },
  }
}

const loginLocalUser = async ({ email, password }) => {
  const normalizedEmail = normalizeEmail(email)
  const users = readLocalUsers().map((entry) => normalizeStoredUser(entry))
  const existingUser = users.find((user) => normalizeEmail(user.email) === normalizedEmail)

  if (!existingUser) {
    throw new Error('No existe una cuenta con ese email.')
  }

  const passwordHash = await hashPasswordInBrowser(password)
  if (passwordHash !== existingUser.passwordHash) {
    throw new Error('La contraseña es incorrecta.')
  }

  saveAuthSession(existingUser)

  if (!existingUser.emailVerified) {
    const error = new Error('Debes verificar tu email antes de continuar.')
    error.verificationRequired = true
    error.email = existingUser.email
    throw error
  }

  const verifiedUser = withTrialIfEligible(existingUser)
  upsertLocalUser(verifiedUser)
  saveAuthSession(verifiedUser)
  return { user: sanitizeAuthUser(verifiedUser) }
}

const verifyLocalUserEmail = async ({ email, code }) => {
  const existingUser = readLocalUserByEmail(email)
  if (!existingUser) {
    throw new Error('No existe una cuenta con ese email.')
  }
  if (existingUser.emailVerified) {
    const alreadyVerified = withTrialIfEligible(existingUser)
    upsertLocalUser(alreadyVerified)
    saveAuthSession(alreadyVerified)
    return { user: sanitizeAuthUser(alreadyVerified) }
  }
  if (!String(code || '').trim()) {
    throw new Error('Introduce el código de verificación.')
  }

  const isExpired =
    existingUser.verificationExpiresAt &&
    new Date(existingUser.verificationExpiresAt).getTime() < Date.now()

  if (isExpired) {
    throw new Error('El código ha expirado. Solicita uno nuevo.')
  }
  if (String(code || '').trim() !== String(existingUser.verificationCode || '').trim()) {
    throw new Error('El código de verificación no es válido.')
  }

  existingUser.emailVerified = true
  existingUser.verificationCode = ''
  existingUser.verificationExpiresAt = null

  const verifiedUser = withTrialIfEligible(existingUser)
  upsertLocalUser(verifiedUser)
  saveAuthSession(verifiedUser)
  return { user: sanitizeAuthUser(verifiedUser) }
}

const resendLocalVerificationCode = async ({ email }) => {
  const existingUser = readLocalUserByEmail(email)
  if (!existingUser) {
    throw new Error('No existe una cuenta con ese email.')
  }
  if (existingUser.emailVerified) {
    return {
      message: 'Ese email ya está verificado.',
      verification: { required: false },
    }
  }

  const newCode = generateNumericCode()
  existingUser.verificationCode = newCode
  existingUser.verificationExpiresAt = codeExpiryIso(24)
  upsertLocalUser(existingUser)
  return {
    message: 'Código de verificación reenviado.',
    verification: { required: true, code: newCode },
  }
}

const requestLocalPasswordReset = async ({ email }) => {
  const existingUser = readLocalUserByEmail(email)
  if (!existingUser) {
    throw new Error('No existe una cuenta con ese email.')
  }

  const resetCode = generateNumericCode()
  const resetExpiry = new Date()
  resetExpiry.setMinutes(resetExpiry.getMinutes() + 30)

  existingUser.resetCode = resetCode
  existingUser.resetExpiresAt = resetExpiry.toISOString()
  upsertLocalUser(existingUser)

  return {
    message: 'Código de recuperación enviado.',
    reset: { code: resetCode },
  }
}

const resetLocalPassword = async ({ email, code, newPassword }) => {
  const existingUser = readLocalUserByEmail(email)
  if (!existingUser) {
    throw new Error('No existe una cuenta con ese email.')
  }
  if (!String(code || '').trim()) {
    throw new Error('Introduce el código de recuperación.')
  }
  const isExpired =
    existingUser.resetExpiresAt && new Date(existingUser.resetExpiresAt).getTime() < Date.now()
  if (isExpired) {
    throw new Error('El código de recuperación ha expirado.')
  }
  if (String(code || '').trim() !== String(existingUser.resetCode || '').trim()) {
    throw new Error('El código de recuperación no es válido.')
  }
  if (String(newPassword || '').length < 8) {
    throw new Error('La nueva contraseña debe tener al menos 8 caracteres.')
  }

  existingUser.passwordHash = await hashPasswordInBrowser(newPassword)
  existingUser.resetCode = ''
  existingUser.resetExpiresAt = null
  upsertLocalUser(existingUser)

  return { message: 'Contraseña actualizada correctamente.' }
}

const savePendingPlan = (value) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(AUTH_PENDING_PLAN_STORAGE_KEY, JSON.stringify(value))
}

const readPendingPlan = () => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(AUTH_PENDING_PLAN_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const clearPendingPlan = () => {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(AUTH_PENDING_PLAN_STORAGE_KEY)
}

const readGuestRenderUsage = () => {
  if (typeof window === 'undefined') return 0
  try {
    return Number.parseInt(window.localStorage.getItem(GUEST_RENDER_USAGE_KEY) || '0', 10) || 0
  } catch {
    return 0
  }
}

const writeGuestRenderUsage = (value) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(GUEST_RENDER_USAGE_KEY, String(value))
}

const getUserQuotaSnapshot = (user) => {
  if (!user) {
    const guestUsage = readGuestRenderUsage()
    return {
      state: 'guest',
      limit: GUEST_RENDER_LIMIT,
      used: guestUsage,
      remaining: Math.max(0, GUEST_RENDER_LIMIT - guestUsage),
      blocked: guestUsage >= GUEST_RENDER_LIMIT,
      message:
        guestUsage >= GUEST_RENDER_LIMIT
          ? 'Tu prueba rápida como invitado se agotó. Regístrate gratis para continuar.'
          : 'Tienes una prueba rápida como invitado disponible.',
    }
  }

  const normalized = normalizeStoredUser(user)
  if (!normalized.emailVerified) {
    return {
      state: 'verify',
      blocked: true,
      message: 'Verifica tu email para activar tu prueba gratis.',
    }
  }

  if (normalized.planId && normalized.planId !== 'free') {
    return {
      state: 'paid',
      blocked: false,
      message: `Plan ${normalized.planId.toUpperCase()} activo. Renders ilimitados.`,
    }
  }

  if (isTrialActive(normalized)) {
    const remainingTrial = Math.max(
      0,
      Number(normalized.trialRendersLimit || TRIAL_RENDER_LIMIT) -
        Number(normalized.trialRendersUsed || 0),
    )
    return {
      state: 'trial',
      limit: normalized.trialRendersLimit,
      used: normalized.trialRendersUsed,
      remaining: remainingTrial,
      trialEndsAt: normalized.trialEndsAt,
      blocked: remainingTrial <= 0,
      message:
        remainingTrial > 0
          ? `Prueba Pro activa. Te quedan ${remainingTrial} renders.`
          : 'Has agotado los renders de prueba. Pasa a un plan de pago o usa el plan gratis.',
    }
  }

  const remainingFree = Math.max(
    0,
    Number(normalized.freeMonthlyRendersLimit || FREE_MONTHLY_RENDER_LIMIT) -
      Number(normalized.freeMonthlyRendersUsed || 0),
  )
  return {
    state: 'free',
    period: normalized.freeMonthlyPeriod,
    limit: normalized.freeMonthlyRendersLimit,
    used: normalized.freeMonthlyRendersUsed,
    remaining: remainingFree,
    blocked: remainingFree <= 0,
    message:
      remainingFree > 0
        ? `Plan gratis: te quedan ${remainingFree} renders este mes.`
        : 'Has alcanzado el límite del plan gratis este mes.',
  }
}

const consumeLocalRenderQuota = async (user) => {
  if (!user) {
    const guestUsage = readGuestRenderUsage()
    if (guestUsage >= GUEST_RENDER_LIMIT) {
      return {
        allowed: false,
        reason: 'guest_limit',
        message: 'Regístrate para continuar después de la prueba rápida gratuita.',
      }
    }

    writeGuestRenderUsage(guestUsage + 1)
    return {
      allowed: true,
      user: null,
      quota: getUserQuotaSnapshot(null),
    }
  }

  const storedUser = readLocalUserByEmail(user.email)
  if (!storedUser) {
    return {
      allowed: false,
      reason: 'user_not_found',
      message: 'No se encontró tu cuenta local. Inicia sesión nuevamente.',
    }
  }

  let normalized = withTrialIfEligible(storedUser)
  normalized = normalizeStoredUser(normalized)

  const quotaBefore = getUserQuotaSnapshot(normalized)
  if (quotaBefore.blocked) {
    return {
      allowed: false,
      reason: quotaBefore.state,
      message: quotaBefore.message,
      user: sanitizeAuthUser(normalized),
      quota: quotaBefore,
    }
  }

  if (quotaBefore.state === 'trial') {
    normalized.trialRendersUsed = Number(normalized.trialRendersUsed || 0) + 1
  } else if (quotaBefore.state === 'free') {
    normalized.freeMonthlyRendersUsed = Number(normalized.freeMonthlyRendersUsed || 0) + 1
  }

  const savedUser = upsertLocalUser(normalized)
  saveAuthSession(savedUser)

  return {
    allowed: true,
    user: sanitizeAuthUser(savedUser),
    quota: getUserQuotaSnapshot(savedUser),
  }
}

const clamp = (value, min = 0, max = 255) => Math.min(max, Math.max(min, value))

const hexToRgb = (hexColor) => {
  const cleaned = hexColor.replace('#', '')
  return {
    r: Number.parseInt(cleaned.slice(0, 2), 16),
    g: Number.parseInt(cleaned.slice(2, 4), 16),
    b: Number.parseInt(cleaned.slice(4, 6), 16),
  }
}

const imageCache = new Map()
const swatchTextureCache = new Map()

const loadImage = (source) => {
  const cached = imageCache.get(source)
  if (cached) return cached

  const promise = new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Image load failed: ${source}`))
    image.src = source
  })

  imageCache.set(source, promise)
  return promise
}

const buildSmoothedLuminanceMap = (pixels, width, height, radius = 2) => {
  const luminance = new Float32Array(width * height)

  for (let i = 0; i < width * height; i += 1) {
    const pixelOffset = i * 4
    luminance[i] =
      (0.299 * pixels[pixelOffset] +
        0.587 * pixels[pixelOffset + 1] +
        0.114 * pixels[pixelOffset + 2]) /
      255
  }

  const horizontalBlur = new Float32Array(width * height)
  const verticalBlur = new Float32Array(width * height)
  const kernelDiameter = radius * 2 + 1

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width
    const prefix = new Float32Array(width + 1)

    for (let x = 0; x < width; x += 1) {
      prefix[x + 1] = prefix[x] + luminance[rowOffset + x]
    }

    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - radius)
      const right = Math.min(width - 1, x + radius)
      horizontalBlur[rowOffset + x] = (prefix[right + 1] - prefix[left]) / (right - left + 1)
    }
  }

  for (let x = 0; x < width; x += 1) {
    const prefix = new Float32Array(height + 1)

    for (let y = 0; y < height; y += 1) {
      prefix[y + 1] = prefix[y] + horizontalBlur[y * width + x]
    }

    for (let y = 0; y < height; y += 1) {
      const top = Math.max(0, y - radius)
      const bottom = Math.min(height - 1, y + radius)
      verticalBlur[y * width + x] = (prefix[bottom + 1] - prefix[top]) / (bottom - top + 1)
    }
  }

  return { map: verticalBlur, kernelDiameter }
}

const wrapCoordinate = (value, size) => {
  const wrapped = value % size
  return wrapped < 0 ? wrapped + size : wrapped
}

const sampleBilinearRgb = (pixels, width, height, x, y) => {
  const px = wrapCoordinate(x, width)
  const py = wrapCoordinate(y, height)

  const x0 = Math.floor(px)
  const y0 = Math.floor(py)
  const x1 = (x0 + 1) % width
  const y1 = (y0 + 1) % height

  const tx = px - x0
  const ty = py - y0

  const topLeft = (y0 * width + x0) * 4
  const topRight = (y0 * width + x1) * 4
  const bottomLeft = (y1 * width + x0) * 4
  const bottomRight = (y1 * width + x1) * 4

  const topRed = pixels[topLeft] * (1 - tx) + pixels[topRight] * tx
  const topGreen = pixels[topLeft + 1] * (1 - tx) + pixels[topRight + 1] * tx
  const topBlue = pixels[topLeft + 2] * (1 - tx) + pixels[topRight + 2] * tx

  const bottomRed = pixels[bottomLeft] * (1 - tx) + pixels[bottomRight] * tx
  const bottomGreen = pixels[bottomLeft + 1] * (1 - tx) + pixels[bottomRight + 1] * tx
  const bottomBlue = pixels[bottomLeft + 2] * (1 - tx) + pixels[bottomRight + 2] * tx

  return {
    r: topRed * (1 - ty) + bottomRed * ty,
    g: topGreen * (1 - ty) + bottomGreen * ty,
    b: topBlue * (1 - ty) + bottomBlue * ty,
  }
}

const loadSwatchTexture = async (swatchPath) => {
  const swatchUrl = assetUrl(swatchPath)
  const cached = swatchTextureCache.get(swatchUrl)
  if (cached) return cached

  const texturePromise = (async () => {
    const swatchImage = await loadImage(swatchUrl)
    const sourceWidth = swatchImage.naturalWidth || swatchImage.width
    const sourceHeight = swatchImage.naturalHeight || swatchImage.height

    const cropX = Math.floor(sourceWidth * 0.12)
    const cropY = Math.floor(sourceHeight * 0.12)
    const cropWidth = Math.max(16, Math.floor(sourceWidth * 0.76))
    const cropHeight = Math.max(16, Math.floor(sourceHeight * 0.76))

    const textureCanvas = document.createElement('canvas')
    textureCanvas.width = Math.min(320, cropWidth)
    textureCanvas.height = Math.min(320, cropHeight)
    const textureContext = textureCanvas.getContext('2d', { willReadFrequently: true })
    if (!textureContext) return null

    textureContext.imageSmoothingEnabled = true
    textureContext.drawImage(
      swatchImage,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      textureCanvas.width,
      textureCanvas.height,
    )

    return {
      width: textureCanvas.width,
      height: textureCanvas.height,
      pixels: textureContext.getImageData(0, 0, textureCanvas.width, textureCanvas.height).data,
    }
  })()

  swatchTextureCache.set(swatchUrl, texturePromise)
  return texturePromise
}

const cutoutPath = (furnitureId) => assetUrl(`/images/furniture-cutout/${furnitureId}.png`)
const upholsteryMaskPath = (furnitureId) => assetUrl(`/images/upholstery-mask/${furnitureId}.png`)

const createDefaultUpholsteryMask = async (furnitureId) => {
  const cutoutImage = await loadImage(cutoutPath(furnitureId))
  const width = cutoutImage.naturalWidth || cutoutImage.width
  const height = cutoutImage.naturalHeight || cutoutImage.height

  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = width
  maskCanvas.height = height
  const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true })
  if (!maskContext) {
    throw new Error('No se pudo crear la mascara de tapizado.')
  }

  maskContext.drawImage(cutoutImage, 0, 0, width, height)
  const imageData = maskContext.getImageData(0, 0, width, height)
  const pixels = imageData.data

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3]
    pixels[index] = 255
    pixels[index + 1] = 255
    pixels[index + 2] = 255
    pixels[index + 3] = alpha
  }

  maskContext.putImageData(imageData, 0, 0)
  return maskCanvas.toDataURL('image/png')
}

const createInitialUpholsteryMask = async (furnitureId) => {
  try {
    const [cutoutImage, predefinedMaskImage] = await Promise.all([
      loadImage(cutoutPath(furnitureId)),
      loadImage(upholsteryMaskPath(furnitureId)),
    ])

    const width = cutoutImage.naturalWidth || cutoutImage.width
    const height = cutoutImage.naturalHeight || cutoutImage.height
    const maskCanvas = document.createElement('canvas')
    maskCanvas.width = width
    maskCanvas.height = height
    const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true })
    if (!maskContext) {
      throw new Error('No se pudo crear la mascara inicial del mueble.')
    }

    maskContext.drawImage(predefinedMaskImage, 0, 0, width, height)
    const maskImageData = maskContext.getImageData(0, 0, width, height)
    const maskPixels = maskImageData.data

    let hasTransparentPixels = false
    for (let index = 3; index < maskPixels.length; index += 4) {
      if (maskPixels[index] < 250) {
        hasTransparentPixels = true
        break
      }
    }

    for (let index = 0; index < maskPixels.length; index += 4) {
      const sourceAlpha = maskPixels[index + 3]
      const luminance =
        0.299 * maskPixels[index] + 0.587 * maskPixels[index + 1] + 0.114 * maskPixels[index + 2]

      maskPixels[index] = 255
      maskPixels[index + 1] = 255
      maskPixels[index + 2] = 255
      maskPixels[index + 3] = hasTransparentPixels ? sourceAlpha : clamp(luminance, 0, 255)
    }

    maskContext.putImageData(maskImageData, 0, 0)
    return maskCanvas.toDataURL('image/png')
  } catch {
    return createDefaultUpholsteryMask(furnitureId)
  }
}

const loadMaskPixels = async (maskDataUrl, width, height) => {
  if (!maskDataUrl) return null

  const maskImage = await loadImage(maskDataUrl)
  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = width
  maskCanvas.height = height
  const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true })
  if (!maskContext) return null

  maskContext.drawImage(maskImage, 0, 0, width, height)
  return maskContext.getImageData(0, 0, width, height).data
}

const renderFabricPreview = async (furnitureId, fabricSelection, upholsteryMaskDataUrl = '') => {
  const cutoutImage = await loadImage(cutoutPath(furnitureId))

  const width = cutoutImage.naturalWidth || cutoutImage.width
  const height = cutoutImage.naturalHeight || cutoutImage.height

  const baseCanvas = document.createElement('canvas')
  baseCanvas.width = width
  baseCanvas.height = height
  const baseContext = baseCanvas.getContext('2d', { willReadFrequently: true })
  if (!baseContext) {
    throw new Error('Unable to create preview canvas context')
  }

  baseContext.drawImage(cutoutImage, 0, 0, width, height)
  const baseImageData = baseContext.getImageData(0, 0, width, height)
  const sourcePixels = baseImageData.data

  const outputImageData = baseContext.createImageData(width, height)
  const outputPixels = outputImageData.data
  const fabric = hexToRgb(fabricSelection.color)
  const swatchTexture = fabricSelection.swatch ? await loadSwatchTexture(fabricSelection.swatch) : null
  const maskPixels = await loadMaskPixels(upholsteryMaskDataUrl, width, height)
  const { map: smoothLuminanceMap, kernelDiameter } = buildSmoothedLuminanceMap(
    sourcePixels,
    width,
    height,
  )
  const smoothingStrength = 1 / Math.max(3, kernelDiameter)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const baseAlpha = sourcePixels[index + 3]
      const alpha = baseAlpha

      if (alpha <= 0) {
        outputPixels[index + 3] = 0
        continue
      }

      const maskAlpha = maskPixels ? maskPixels[index + 3] : 255
      if (maskAlpha <= 6) {
        outputPixels[index] = sourcePixels[index]
        outputPixels[index + 1] = sourcePixels[index + 1]
        outputPixels[index + 2] = sourcePixels[index + 2]
        outputPixels[index + 3] = alpha
        continue
      }
      const maskFactor = maskAlpha / 255

      const sourceRed = sourcePixels[index]
      const sourceGreen = sourcePixels[index + 1]
      const sourceBlue = sourcePixels[index + 2]
      const smoothLuminance = smoothLuminanceMap[y * width + x]

      let textureRed = fabric.r
      let textureGreen = fabric.g
      let textureBlue = fabric.b
      let microRelief = 0

      if (swatchTexture) {
        const textureX = x * 0.17 + y * 0.035
        const textureY = y * 0.17 - x * 0.028
        const sample = sampleBilinearRgb(
          swatchTexture.pixels,
          swatchTexture.width,
          swatchTexture.height,
          textureX,
          textureY,
        )

        textureRed = clamp(sample.r * 0.74 + fabric.r * 0.26)
        textureGreen = clamp(sample.g * 0.74 + fabric.g * 0.26)
        textureBlue = clamp(sample.b * 0.74 + fabric.b * 0.26)

        const sampleLuminance = (0.299 * sample.r + 0.587 * sample.g + 0.114 * sample.b) / 255
        microRelief = (sampleLuminance - 0.5) * 0.22
      } else {
        const weaveA = Math.sin((x + y * 0.32) * 0.033) * 0.024
        const weaveB = Math.cos((y - x * 0.22) * 0.037) * 0.02
        const weaveC = Math.sin(x * 0.012 + y * 0.016) * 0.016
        const proceduralTexture = clamp(1 + weaveA + weaveB + weaveC, 0.92, 1.08)
        textureRed = clamp(fabric.r * proceduralTexture)
        textureGreen = clamp(fabric.g * proceduralTexture)
        textureBlue = clamp(fabric.b * proceduralTexture)
      }

      const shading = clamp(
        0.44 + smoothLuminance * (0.9 + smoothingStrength * 0.04) + microRelief,
        0.22,
        1.28,
      )

      const tintedRed = clamp(textureRed * shading)
      const tintedGreen = clamp(textureGreen * shading)
      const tintedBlue = clamp(textureBlue * shading)

      const mixedRed = clamp(tintedRed * 0.9 + sourceRed * 0.1)
      const mixedGreen = clamp(tintedGreen * 0.9 + sourceGreen * 0.1)
      const mixedBlue = clamp(tintedBlue * 0.9 + sourceBlue * 0.1)

      outputPixels[index] = clamp(mixedRed * maskFactor + sourceRed * (1 - maskFactor))
      outputPixels[index + 1] = clamp(mixedGreen * maskFactor + sourceGreen * (1 - maskFactor))
      outputPixels[index + 2] = clamp(mixedBlue * maskFactor + sourceBlue * (1 - maskFactor))
      outputPixels[index + 3] = alpha
    }
  }

  baseContext.clearRect(0, 0, width, height)
  baseContext.putImageData(outputImageData, 0, 0)

  baseContext.globalCompositeOperation = 'multiply'
  baseContext.globalAlpha = 0.16
  baseContext.drawImage(cutoutImage, 0, 0, width, height)

  baseContext.globalCompositeOperation = 'screen'
  baseContext.globalAlpha = 0.08
  baseContext.drawImage(cutoutImage, 0, 0, width, height)

  baseContext.globalCompositeOperation = 'source-over'
  baseContext.globalAlpha = 1

  return baseCanvas.toDataURL('image/png')
}

const FURNITURE = [
  {
    id: 'sofa-1plaza',
    name: 'Sofa 1 Plaza Moderno',
    category: 'Sofas',
    style: 'Moderno',
    shape: 'Recto/Moderno',
    type: 'Sofa',
    image: '/images/furniture/sofa-1plaza.png',
  },
  {
    id: 'sofa-2plazas',
    name: 'Sofa 2 Plazas Clasico',
    category: 'Sofas',
    style: 'Clasico/Vintage',
    shape: 'Recto/Moderno',
    type: 'Sofa',
    image: '/images/furniture/sofa-2plazas.png',
  },
  {
    id: 'sofa-ideal-premium',
    name: 'Sofa Ideal Tapiza',
    category: 'Sofas',
    style: 'Moderno',
    shape: 'Recto/Moderno',
    type: 'Sofa',
    image: '/images/furniture/sofa-ideal-premium.png',
  },
  {
    id: 'sofa-3plazas',
    name: 'Sofa 3 Plazas Moderno',
    category: 'Sofas',
    style: 'Moderno',
    shape: 'Recto/Moderno',
    type: 'Sofa',
    image: '/images/furniture/sofa-3plazas.png',
  },
  {
    id: 'sofa-chevron',
    name: 'Sofa Chevron Clasico',
    category: 'Sofas',
    style: 'Clasico/Vintage',
    shape: 'Curvo/Redondeado',
    type: 'Sofa',
    image: '/images/furniture/sofa-chevron.png',
  },
  {
    id: 'sofa-esquinero-l',
    name: 'Sofa Esquinero L',
    category: 'Sofas',
    style: 'Moderno',
    shape: 'Esquinero/L',
    type: 'Sofa',
    image: '/images/furniture/sofa-esquinero-l.png',
  },
  {
    id: 'sofa-modular',
    name: 'Sofa Modular',
    category: 'Sofas',
    style: 'Moderno',
    shape: 'Modular',
    type: 'Sofa',
    image: '/images/furniture/sofa-modular.png',
  },
  {
    id: 'sofa-curvo',
    name: 'Sofa Curvo',
    category: 'Sofas',
    style: 'Moderno',
    shape: 'Curvo/Redondeado',
    type: 'Sofa',
    image: '/images/furniture/sofa-curvo.png',
  },
  {
    id: 'sillon-clasico',
    name: 'Sillon Clasico Orejero',
    category: 'Sillones',
    style: 'Clasico/Vintage',
    shape: 'Curvo/Redondeado',
    type: 'Sillon',
    image: '/images/furniture/sillon-clasico.png',
  },
  {
    id: 'sillon-moderno',
    name: 'Sillon Moderno',
    category: 'Sillones',
    style: 'Moderno',
    shape: 'Recto/Moderno',
    type: 'Sillon',
    image: '/images/furniture/sillon-moderno.png',
  },
  {
    id: 'sillon-escandinavo',
    name: 'Sillon Escandinavo',
    category: 'Sillones',
    style: 'Escandinavo',
    shape: 'Recto/Moderno',
    type: 'Sillon',
    image: '/images/furniture/sillon-escandinavo.png',
  },
  {
    id: 'butaca-vintage',
    name: 'Butaca Vintage',
    category: 'Sillones',
    style: 'Clasico/Vintage',
    shape: 'Curvo/Redondeado',
    type: 'Sillon',
    image: '/images/furniture/butaca-vintage.png',
  },
  {
    id: 'bergere',
    name: 'Bergere Frances',
    category: 'Sillones',
    style: 'Clasico/Vintage',
    shape: 'Curvo/Redondeado',
    type: 'Sillon',
    image: '/images/furniture/bergere.png',
  },
  {
    id: 'chaise-longue',
    name: 'Chaise Longue Elegante',
    category: 'Chaise Longue',
    style: 'Moderno',
    shape: 'Curvo/Redondeado',
    type: 'Chaise',
    image: '/images/furniture/chaise-longue.png',
  },
  {
    id: 'chaise-clasica',
    name: 'Chaise Longue Clasica',
    category: 'Chaise Longue',
    style: 'Clasico/Vintage',
    shape: 'Curvo/Redondeado',
    type: 'Chaise',
    image: '/images/furniture/chaise-clasica.png',
  },
  {
    id: 'sofa-cama-2plazas',
    name: 'Sofa Cama 2 Plazas',
    category: 'Sofas Cama',
    style: 'Moderno',
    shape: 'Recto/Moderno',
    type: 'Sofa Cama',
    image: '/images/furniture/sofa-cama-2plazas.png',
  },
  {
    id: 'sofa-cama-nordico',
    name: 'Sofa Cama Nordico',
    category: 'Sofas Cama',
    style: 'Escandinavo',
    shape: 'Recto/Moderno',
    type: 'Sofa Cama',
    image: '/images/furniture/sofa-cama-nordico.png',
  },
  {
    id: 'otomana-clasica',
    name: 'Otomana Clasica',
    category: 'Ottomanas',
    style: 'Clasico/Vintage',
    shape: 'Curvo/Redondeado',
    type: 'Otomana',
    image: '/images/furniture/otomana-clasica.png',
  },
  {
    id: 'reposapies-moderno',
    name: 'Reposapies Moderno',
    category: 'Ottomanas',
    style: 'Moderno',
    shape: 'Recto/Moderno',
    type: 'Otomana',
    image: '/images/furniture/reposapies-moderno.png',
  },
  {
    id: 'otomana-redonda',
    name: 'Otomana Redonda',
    category: 'Ottomanas',
    style: 'Moderno',
    shape: 'Curvo/Redondeado',
    type: 'Otomana',
    image: '/images/furniture/otomana-redonda.png',
  },
  {
    id: 'banco-entrada',
    name: 'Banco Entrada',
    category: 'Bancos',
    style: 'Moderno',
    shape: 'Recto/Moderno',
    type: 'Banco',
    image: '/images/furniture/banco-entrada.png',
  },
  {
    id: 'banco-dormitorio',
    name: 'Banco Dormitorio',
    category: 'Bancos',
    style: 'Clasico/Vintage',
    shape: 'Recto/Moderno',
    type: 'Banco',
    image: '/images/furniture/banco-dormitorio.png',
  },
  {
    id: 'cabecero-simple',
    name: 'Cabecero Simple',
    category: 'Cabeceros',
    style: 'Moderno',
    shape: 'Recto/Moderno',
    type: 'Cabecero',
    image: '/images/furniture/cabecero-simple.png',
  },
  {
    id: 'cabecero-botones',
    name: 'Cabecero con Botones',
    category: 'Cabeceros',
    style: 'Clasico/Vintage',
    shape: 'Recto/Moderno',
    type: 'Cabecero',
    image: '/images/furniture/cabecero-botones.png',
  },
  {
    id: 'puff-redondo',
    name: 'Puff Redondo',
    category: 'Puffs',
    style: 'Moderno',
    shape: 'Curvo/Redondeado',
    type: 'Puff',
    image: '/images/furniture/puff-redondo.png',
  },
  {
    id: 'puff-boho',
    name: 'Puff Boho',
    category: 'Puffs',
    style: 'Boho/Etnico',
    shape: 'Curvo/Redondeado',
    type: 'Puff',
    image: '/images/furniture/puff-boho.png',
  },
  {
    id: 'cojin-cuadrado',
    name: 'Cojin Cuadrado',
    category: 'Cojines',
    style: 'Moderno',
    shape: 'Recto/Moderno',
    type: 'Cojin',
    image: '/images/furniture/cojin-cuadrado.png',
  },
  {
    id: 'cojin-redondo',
    name: 'Cojin Redondo',
    category: 'Cojines',
    style: 'Boho/Etnico',
    shape: 'Curvo/Redondeado',
    type: 'Cojin',
    image: '/images/furniture/cojin-redondo.png',
  },
  {
    id: 'sillon-industrial',
    name: 'Sillon Industrial',
    category: 'Sillones',
    style: 'Industrial',
    shape: 'Recto/Moderno',
    type: 'Sillon',
    image: '/images/furniture/sillon-industrial.png',
  },
  {
    id: 'sofa-industrial',
    name: 'Sofa Industrial',
    category: 'Sofas',
    style: 'Industrial',
    shape: 'Recto/Moderno',
    type: 'Sofa',
    image: '/images/furniture/sofa-industrial.png',
  },
]

const CATEGORIES = [
  'Todos',
  'Sofas',
  'Sillones',
  'Chaise Longue',
  'Sofas Cama',
  'Ottomanas',
  'Bancos',
  'Cabeceros',
  'Puffs',
  'Cojines',
]

const STYLES = [
  'Todos los estilos',
  'Clasico/Vintage',
  'Moderno',
  'Escandinavo',
  'Industrial',
  'Boho/Etnico',
]

const SHAPES = [
  'Todas las formas',
  'Recto/Moderno',
  'Curvo/Redondeado',
  'Modular',
  'Esquinero/L',
]

const BASE_MANUFACTURER_OPTIONS = [
  'Todos los fabricantes',
  'Froca',
  'Aznar Textil',
  'GB Grup',
  'Tuva Textil',
]
const ALL_COLLECTIONS_OPTION = 'Todas las colecciones'

const FABRIC_TYPE_OPTIONS = [
  'Todos los tipos',
  'Polipiel',
  'Chenilla',
  'Lino',
  'Jacquard',
  'Microfibra',
  'Piel/Cuero',
  'Velvet',
  'Boucle',
  'Algodon',
  'Pana',
]

const FABRIC_COLOR_OPTIONS = [
  'Todos los colores',
  'Rojo',
  'Azul',
  'Verde',
  'Amarillo',
  'Naranja',
  'Negro',
  'Blanco',
  'Gris',
  'Marron',
  'Beige',
  'Morado',
]

const FABRIC_PATTERN_OPTIONS = [
  'Todos los diseños',
  'Liso',
  'Cuadros',
  'Rayas',
  'Circulos',
  'Rombos',
  'Geometricos',
  'Abstractos',
  'Florales',
]

const rgbToHsv = ({ r, g, b }) => {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min

  let hue = 0
  if (delta > 0) {
    if (max === red) {
      hue = ((green - blue) / delta) % 6
    } else if (max === green) {
      hue = (blue - red) / delta + 2
    } else {
      hue = (red - green) / delta + 4
    }
  }

  const normalizedHue = Math.round((hue * 60 + 360) % 360)
  const saturation = max === 0 ? 0 : delta / max
  const value = max

  return { h: normalizedHue, s: saturation, v: value }
}

const detectColorFamily = (hexColor) => {
  const hsv = rgbToHsv(hexToRgb(hexColor))

  if (hsv.v < 0.16) return 'Negro'
  if (hsv.v > 0.92 && hsv.s < 0.12) return 'Blanco'
  if (hsv.s < 0.12 && hsv.v < 0.78) return 'Gris'
  if (hsv.s < 0.18 && hsv.v >= 0.78) return 'Beige'
  if (hsv.h >= 15 && hsv.h < 52 && hsv.v < 0.72) return 'Marron'
  if (hsv.h >= 345 || hsv.h < 15) return 'Rojo'
  if (hsv.h < 42) return 'Naranja'
  if (hsv.h < 65) return 'Amarillo'
  if (hsv.h < 160) return 'Verde'
  if (hsv.h < 255) return 'Azul'
  if (hsv.h < 325) return 'Morado'
  return 'Rojo'
}

const enrichFabric = (fabric, defaults = {}) => ({
  ...fabric,
  manufacturer: fabric.manufacturer || defaults.manufacturer || 'Froca',
  collection: fabric.collection || defaults.collection || fabric.family || 'General',
  fabricType: fabric.fabricType || defaults.fabricType || 'Chenilla',
  pattern: fabric.pattern || defaults.pattern || 'Liso',
  colorFamily: fabric.colorFamily || detectColorFamily(fabric.color),
})

const BASE_FABRICS = [
  {
    id: 'velvet-azul',
    name: 'Velvet Azul Noche',
    family: 'Velvet',
    color: '#1E3A5F',
    manufacturer: 'GB Grup',
    fabricType: 'Velvet',
    pattern: 'Liso',
  },
  {
    id: 'chenille-arena',
    name: 'Chenille Arena',
    family: 'Chenille',
    color: '#D4A574',
    manufacturer: 'Aznar Textil',
    fabricType: 'Chenilla',
    pattern: 'Cuadros',
  },
  {
    id: 'lino-crudo',
    name: 'Lino Crudo',
    family: 'Lino',
    color: '#DDD3C5',
    manufacturer: 'GB Grup',
    fabricType: 'Lino',
    pattern: 'Rayas',
  },
  {
    id: 'boucle-perla',
    name: 'Boucle Perla',
    family: 'Boucle',
    color: '#E7E7E4',
    manufacturer: 'Tuva Textil',
    fabricType: 'Boucle',
    pattern: 'Liso',
  },
  {
    id: 'microfibra-grafito',
    name: 'Microfibra Grafito',
    family: 'Microfibra',
    color: '#474747',
    manufacturer: 'Aznar Textil',
    fabricType: 'Microfibra',
    pattern: 'Liso',
  },
  {
    id: 'jacquard-verde',
    name: 'Jacquard Verde Salvia',
    family: 'Jacquard',
    color: '#8C9B83',
    manufacturer: 'GB Grup',
    fabricType: 'Jacquard',
    pattern: 'Geometricos',
  },
  {
    id: 'algodon-terracota',
    name: 'Algodon Terracota',
    family: 'Algodon',
    color: '#B66F52',
    manufacturer: 'Tuva Textil',
    fabricType: 'Algodon',
    pattern: 'Florales',
  },
  {
    id: 'pana-nude',
    name: 'Pana Nude',
    family: 'Pana',
    color: '#B99E8C',
    manufacturer: 'Aznar Textil',
    fabricType: 'Pana',
    pattern: 'Abstractos',
  },
]

const FABRICS = [
  ...FROCA_FABRICS.map((fabric) =>
    enrichFabric(fabric, {
      manufacturer: 'Froca',
      collection: fabric.family.includes('Acanto')
        ? 'Acanto'
        : fabric.family.includes('Balenciaga')
          ? 'Balenciaga'
          : 'Froca',
      fabricType: fabric.family === 'Froca Balenciaga' ? 'Jacquard' : 'Chenilla',
      pattern: 'Liso',
    }),
  ),
  ...BASE_FABRICS.map((fabric) => enrichFabric(fabric)),
]

const PLANS = PLAN_DEFINITIONS

const CATALOG_CARDS = [
  {
    title: 'Sofas',
    description:
      'Desde sofas modernos hasta clasicos Chesterfield. Encuentra el estilo perfecto.',
    counter: '8 modelos',
    variant: 'dark',
  },
  {
    title: 'Sillones',
    description: 'Sillones orejeros, Bergere y escandinavos para renovar espacios.',
    counter: '6 modelos',
    variant: 'gold',
  },
  {
    title: 'Telas Premium',
    description: 'Coleccion real de Froca y tejidos premium para tapiceria profesional.',
    counter: `${FABRICS.length} telas`,
    variant: 'light',
  },
]

const formatCheckoutError = async (response) => {
  try {
    const body = await response.json()
    if (body?.error) return body.error
  } catch {
    return 'No se pudo iniciar el checkout de Stripe.'
  }

  return 'No se pudo iniciar el checkout de Stripe.'
}

const safeParseJson = async (response) => {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('furniture')
  const [selectedCategory, setSelectedCategory] = useState('Todos')
  const [selectedStyle, setSelectedStyle] = useState('Todos los estilos')
  const [selectedShape, setSelectedShape] = useState('Todas las formas')
  const [selectedFurniture, setSelectedFurniture] = useState(null)
  const [selectedFabric, setSelectedFabric] = useState(null)
  const [selectedManufacturer, setSelectedManufacturer] = useState('Todos los fabricantes')
  const [selectedCollection, setSelectedCollection] = useState(ALL_COLLECTIONS_OPTION)
  const [selectedFabricType, setSelectedFabricType] = useState('Todos los tipos')
  const [selectedColorFamily, setSelectedColorFamily] = useState('Todos los colores')
  const [selectedPattern, setSelectedPattern] = useState('Todos los diseños')
  const [renderedPreviewSrc, setRenderedPreviewSrc] = useState('')
  const [isApplyingFabric, setIsApplyingFabric] = useState(false)
  const [renderError, setRenderError] = useState('')
  const [annualBilling, setAnnualBilling] = useState(false)
  const [renderStatus, setRenderStatus] = useState('')
  const [paymentNotice, setPaymentNotice] = useState('')
  const [paymentError, setPaymentError] = useState('')
  const [checkoutLoadingPlanId, setCheckoutLoadingPlanId] = useState('')
  const [isMaskEditorOpen, setIsMaskEditorOpen] = useState(false)
  const [maskEditorBusy, setMaskEditorBusy] = useState(false)
  const [maskEditorError, setMaskEditorError] = useState('')
  const [maskBrushMode, setMaskBrushMode] = useState('erase')
  const [maskBrushSize, setMaskBrushSize] = useState(22)
  const [maskEditorRevision, setMaskEditorRevision] = useState(0)
  const [isSavingMask, setIsSavingMask] = useState(false)
  const [maskCoveragePercent, setMaskCoveragePercent] = useState(100)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authMode, setAuthMode] = useState('register')
  const [authName, setAuthName] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authConfirmPassword, setAuthConfirmPassword] = useState('')
  const [authCode, setAuthCode] = useState('')
  const [authRecoveryPassword, setAuthRecoveryPassword] = useState('')
  const [authRecoveryConfirmPassword, setAuthRecoveryConfirmPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [quotaRevision, setQuotaRevision] = useState(0)

  const upholsteryMaskByFurnitureRef = useRef(new Map())
  const maskEditorCanvasRef = useRef(null)
  const maskEditorMaskCanvasRef = useRef(null)
  const maskEditorOverlayCanvasRef = useRef(null)
  const maskEditorImageRef = useRef(null)
  const maskEditorFurnitureAlphaRef = useRef(null)
  const maskEditorDrawingRef = useRef(false)
  const maskEditorLastPointRef = useRef(null)

  useEffect(() => {
    const persistedSession = readAuthSession()
    if (!persistedSession) return

    if (persistedSession.provider === 'local') {
      const localUser = readLocalUserByEmail(persistedSession.email)
      if (!localUser) {
        clearAuthSession()
        return
      }

      const hydratedUser = withTrialIfEligible(localUser)
      upsertLocalUser(hydratedUser)
      saveAuthSession(hydratedUser)
      setCurrentUser(sanitizeAuthUser(hydratedUser))
      setQuotaRevision((value) => value + 1)
      return
    }

    setCurrentUser(sanitizeAuthUser({ ...persistedSession, provider: 'api' }))
  }, [])

  useEffect(() => {
    if (!authModalOpen) return undefined

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setAuthModalOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [authModalOpen])

  const resetAuthForm = () => {
    setAuthName('')
    setAuthEmail('')
    setAuthPassword('')
    setAuthConfirmPassword('')
    setAuthCode('')
    setAuthRecoveryPassword('')
    setAuthRecoveryConfirmPassword('')
    setAuthError('')
  }

  const openAuthModal = (mode = 'register') => {
    setAuthMode(mode)
    setAuthModalOpen(true)
    setAuthNotice('')
    setAuthError('')
    setAuthPassword('')
    setAuthConfirmPassword('')
    setAuthCode('')
    setAuthRecoveryPassword('')
    setAuthRecoveryConfirmPassword('')

    if (currentUser?.email && (mode === 'verify' || mode === 'recover-request')) {
      setAuthEmail(currentUser.email)
    }
  }

  const closeAuthModal = () => {
    setAuthModalOpen(false)
    setAuthLoading(false)
  }

  const switchAuthMode = (mode) => {
    setAuthMode(mode)
    setAuthError('')
    setAuthNotice('')
    setAuthPassword('')
    setAuthConfirmPassword('')
    setAuthCode('')
    setAuthRecoveryPassword('')
    setAuthRecoveryConfirmPassword('')
  }

  const handleLogout = () => {
    clearAuthSession()
    setCurrentUser(null)
    setQuotaRevision((value) => value + 1)
    setAuthNotice('Sesion cerrada correctamente.')
    setAuthError('')
  }

  const applyAuthenticatedUser = (user, source = 'local') => {
    if (!user) return null
    const provider = source === 'api' ? 'api' : 'local'
    const sanitized = sanitizeAuthUser({ ...user, provider })
    setCurrentUser(sanitized)
    saveAuthSession(sanitized)
    setQuotaRevision((value) => value + 1)
    return sanitized
  }

  const runAuthAction = async ({
    apiEndpoint,
    apiPayload,
    localAction,
    fallbackMessage,
    fallbackStatuses = [404, 503],
  }) => {
    if (!API_BASE_URL) {
      return { source: 'local', payload: await localAction() }
    }

    try {
      const response = await fetch(apiUrl(apiEndpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiPayload),
      })

      const payload = await safeParseJson(response)
      if (response.ok) {
        return { source: 'api', payload }
      }

      if (fallbackStatuses.includes(response.status)) {
        return { source: 'local', payload: await localAction() }
      }

      const error = new Error(payload?.error || fallbackMessage)
      error.status = response.status
      error.payload = payload || {}
      throw error
    } catch (networkError) {
      if (networkError?.status) {
        throw networkError
      }

      return { source: 'local', payload: await localAction() }
    }
  }

  const resolveAuthResultUser = (payload, source) => {
    if (!payload) return null
    const rawUser = payload.user || payload
    if (!rawUser || typeof rawUser !== 'object') return null
    return sanitizeAuthUser({
      ...rawUser,
      provider: source === 'api' ? 'api' : 'local',
    })
  }

  const handleResendVerification = async () => {
    const normalizedEmail = normalizeEmail(authEmail)
    if (!isEmailValid(normalizedEmail)) {
      setAuthError('Introduce un email valido para reenviar el código.')
      return
    }

    setAuthError('')
    setAuthLoading(true)
    try {
      const { payload } = await runAuthAction({
        apiEndpoint: '/api/auth/resend-verification',
        apiPayload: { email: normalizedEmail },
        localAction: () => resendLocalVerificationCode({ email: normalizedEmail }),
        fallbackMessage: 'No se pudo reenviar el código de verificación.',
      })

      const exposedCode = payload?.verification?.code
      setAuthNotice(
        exposedCode
          ? `Código reenviado. Código demo: ${exposedCode}`
          : payload?.message || 'Te hemos reenviado el código de verificación.',
      )
    } catch (error) {
      setAuthError(error.message || 'No se pudo reenviar el código.')
    } finally {
      setAuthLoading(false)
    }
  }

  const submitAuth = async (event) => {
    event.preventDefault()

    const normalizedName = authName.trim()
    const normalizedEmail = normalizeEmail(authEmail)
    const normalizedCode = authCode.trim()

    if (authMode === 'register' && normalizedName.length < 2) {
      setAuthError('El nombre debe tener al menos 2 caracteres.')
      return
    }

    if (!isEmailValid(normalizedEmail)) {
      setAuthError('Introduce un email valido.')
      return
    }

    if ((authMode === 'register' || authMode === 'login') && !authPassword) {
      setAuthError('Introduce tu contraseña.')
      return
    }

    if (authMode === 'register' && authPassword.length < 8) {
      setAuthError('La contraseña debe tener al menos 8 caracteres.')
      return
    }

    if (authMode === 'register' && authPassword !== authConfirmPassword) {
      setAuthError('Las contraseñas no coinciden.')
      return
    }

    if (authMode === 'verify' && !normalizedCode) {
      setAuthError('Introduce el código de verificación.')
      return
    }

    if (authMode === 'recover-reset') {
      if (!normalizedCode) {
        setAuthError('Introduce el código de recuperación.')
        return
      }
      if (authRecoveryPassword.length < 8) {
        setAuthError('La nueva contraseña debe tener al menos 8 caracteres.')
        return
      }
      if (authRecoveryPassword !== authRecoveryConfirmPassword) {
        setAuthError('Las contraseñas no coinciden.')
        return
      }
    }

    setAuthError('')
    setAuthLoading(true)

    try {
      if (authMode === 'register') {
        const { source, payload } = await runAuthAction({
          apiEndpoint: '/api/auth/register',
          apiPayload: {
            name: normalizedName,
            email: normalizedEmail,
            password: authPassword,
          },
          localAction: () =>
            registerLocalUser({
              name: normalizedName,
              email: normalizedEmail,
              password: authPassword,
            }),
          fallbackMessage: 'No se pudo completar el registro.',
        })

        const user = resolveAuthResultUser(payload, source)
        applyAuthenticatedUser(user, source)
        setAuthMode('verify')
        setAuthPassword('')
        setAuthConfirmPassword('')
        setAuthCode('')

        const exposedCode = payload?.verification?.code
        setAuthNotice(
          exposedCode
            ? `Cuenta creada. Código demo de verificación: ${exposedCode}`
            : 'Cuenta creada. Revisa tu email e introduce el código de verificación.',
        )
        return
      }

      if (authMode === 'login') {
        const { source, payload } = await runAuthAction({
          apiEndpoint: '/api/auth/login',
          apiPayload: {
            email: normalizedEmail,
            password: authPassword,
          },
          localAction: () => loginLocalUser({ email: normalizedEmail, password: authPassword }),
          fallbackMessage: 'No se pudo iniciar sesion.',
        })

        const user = resolveAuthResultUser(payload, source)
        applyAuthenticatedUser(user, source)
        setAuthNotice(`Sesion iniciada. Hola ${user?.name || 'de nuevo'}.`)
        resetAuthForm()
        closeAuthModal()
        return
      }

      if (authMode === 'verify') {
        const { source, payload } = await runAuthAction({
          apiEndpoint: '/api/auth/verify-email',
          apiPayload: {
            email: normalizedEmail,
            code: normalizedCode,
          },
          localAction: () => verifyLocalUserEmail({ email: normalizedEmail, code: normalizedCode }),
          fallbackMessage: 'No se pudo verificar el email.',
        })

        const user = resolveAuthResultUser(payload, source)
        applyAuthenticatedUser(user, source)
        setAuthNotice('Email verificado. Tu prueba gratis Pro está activa.')
        resetAuthForm()
        closeAuthModal()
        return
      }

      if (authMode === 'recover-request') {
        const { payload } = await runAuthAction({
          apiEndpoint: '/api/auth/password-recovery/request',
          apiPayload: { email: normalizedEmail },
          localAction: () => requestLocalPasswordReset({ email: normalizedEmail }),
          fallbackMessage: 'No se pudo solicitar la recuperación de contraseña.',
        })

        setAuthMode('recover-reset')
        setAuthCode('')
        setAuthRecoveryPassword('')
        setAuthRecoveryConfirmPassword('')
        const exposedCode = payload?.reset?.code
        setAuthNotice(
          exposedCode
            ? `Código de recuperación enviado. Código demo: ${exposedCode}`
            : payload?.message || 'Te hemos enviado un código de recuperación.',
        )
        return
      }

      if (authMode === 'recover-reset') {
        await runAuthAction({
          apiEndpoint: '/api/auth/password-recovery/confirm',
          apiPayload: {
            email: normalizedEmail,
            code: normalizedCode,
            newPassword: authRecoveryPassword,
          },
          localAction: () =>
            resetLocalPassword({
              email: normalizedEmail,
              code: normalizedCode,
              newPassword: authRecoveryPassword,
            }),
          fallbackMessage: 'No se pudo actualizar la contraseña.',
        })

        setAuthNotice('Contraseña actualizada. Ya puedes iniciar sesión.')
        setAuthMode('login')
        setAuthPassword('')
        setAuthConfirmPassword('')
        setAuthCode('')
        setAuthRecoveryPassword('')
        setAuthRecoveryConfirmPassword('')
        return
      }
    } catch (error) {
      if (error?.verificationRequired || error?.payload?.verificationRequired) {
        if (error?.email) {
          setAuthEmail(error.email)
        }
        setAuthMode('verify')
        setAuthPassword('')
        setAuthConfirmPassword('')
        setAuthCode('')
        setAuthNotice(error?.payload?.message || 'Debes verificar tu email antes de entrar.')
      } else {
        setAuthError(error.message || 'No se pudo completar la autenticacion.')
      }
    } finally {
      setAuthLoading(false)
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const checkoutStatus = params.get('checkout')
    if (!checkoutStatus) return

    const applyLocalPlan = (user, planId) => {
      const localUser =
        readLocalUserByEmail(user.email) || normalizeStoredUser({ ...user, provider: 'local' })
      localUser.planId = planId
      const savedUser = upsertLocalUser(localUser)
      const sanitized = sanitizeAuthUser({
        ...savedUser,
        provider: user.provider === 'api' ? 'api' : 'local',
      })
      setCurrentUser(sanitized)
      saveAuthSession(sanitized)
      setQuotaRevision((value) => value + 1)
      return sanitized
    }

    const activatePlanForCurrentUser = async (planId) => {
      if (!planId || planId === 'free') return false
      const user = readAuthSession()
      if (!user?.email) return false

      if (API_BASE_URL && user.provider === 'api') {
        try {
          const response = await fetch(apiUrl('/api/auth/activate-plan'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: user.email,
              planId,
            }),
          })
          const payload = await safeParseJson(response)
          if (response.ok && payload?.user) {
            const sanitized = sanitizeAuthUser({ ...payload.user, provider: 'api' })
            setCurrentUser(sanitized)
            saveAuthSession(sanitized)
            setQuotaRevision((value) => value + 1)
            return true
          }
        } catch {
          return false
        }
      }

      applyLocalPlan(user, planId)
      return true
    }

    const syncCheckoutState = async () => {
      if (checkoutStatus === 'success') {
        const pendingPlan = readPendingPlan()
        const activated = pendingPlan?.planId
          ? await activatePlanForCurrentUser(pendingPlan.planId)
          : false

        setPaymentNotice(
          activated
            ? `Pago confirmado. Plan ${pendingPlan.planId.toUpperCase()} activado correctamente.`
            : 'Pago confirmado. Tu suscripcion Stripe se ha iniciado correctamente.',
        )
        setPaymentError('')
        clearPendingPlan()
      } else if (checkoutStatus === 'cancelled') {
        setPaymentNotice('Checkout cancelado. Puedes volver a intentarlo cuando quieras.')
        setPaymentError('')
      }
    }

    syncCheckoutState()

    const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`
    window.history.replaceState({}, '', cleanUrl)
  }, [])

  useEffect(() => {
    if (!currentUser?.email || currentUser.provider !== 'api' || !API_BASE_URL) return

    let cancelled = false

    const refreshApiProfile = async () => {
      try {
        const response = await fetch(
          `${apiUrl('/api/auth/profile')}?email=${encodeURIComponent(currentUser.email)}`,
        )
        const payload = await safeParseJson(response)
        if (!response.ok || !payload?.user || cancelled) return

        const updatedUser = sanitizeAuthUser({ ...payload.user, provider: 'api' })
        setCurrentUser(updatedUser)
        saveAuthSession(updatedUser)
        setQuotaRevision((value) => value + 1)
      } catch {
        // Keep current session data if profile refresh fails.
      }
    }

    refreshApiProfile()
    return () => {
      cancelled = true
    }
  }, [currentUser?.email, currentUser?.provider])

  const filteredFurniture = useMemo(
    () =>
      FURNITURE.filter((item) => {
        const categoryMatch =
          selectedCategory === 'Todos' || item.category === selectedCategory
        const styleMatch =
          selectedStyle === 'Todos los estilos' || item.style === selectedStyle
        const shapeMatch =
          selectedShape === 'Todas las formas' || item.shape === selectedShape

        return categoryMatch && styleMatch && shapeMatch
      }),
    [selectedCategory, selectedStyle, selectedShape],
  )

  const selectedVisible = filteredFurniture.some((item) => item.id === selectedFurniture?.id)
  const manufacturerOptions = useMemo(() => {
    const availableManufacturers = Array.from(
      new Set(FABRICS.map((fabric) => fabric.manufacturer).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right, 'es'))

    return [
      BASE_MANUFACTURER_OPTIONS[0],
      ...Array.from(new Set([...BASE_MANUFACTURER_OPTIONS.slice(1), ...availableManufacturers])),
    ]
  }, [])

  const collectionOptions = useMemo(() => {
    const byCollection = new Map()
    FABRICS.forEach((fabric) => {
      const manufacturer = fabric.manufacturer || 'General'
      const collection = fabric.collection || fabric.family || 'General'
      const value = `${collection}::${manufacturer}`

      if (!byCollection.has(value)) {
        byCollection.set(value, {
          value,
          label: `${collection} (${manufacturer})`,
        })
      }
    })

    const sortedCollections = Array.from(byCollection.values()).sort((left, right) =>
      left.label.localeCompare(right.label, 'es'),
    )

    return [
      { value: ALL_COLLECTIONS_OPTION, label: ALL_COLLECTIONS_OPTION },
      ...sortedCollections,
    ]
  }, [])

  const fabricTypeOptions = useMemo(() => {
    const availableTypes = Array.from(
      new Set(FABRICS.map((fabric) => fabric.fabricType).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right, 'es'))

    return [FABRIC_TYPE_OPTIONS[0], ...Array.from(new Set([...FABRIC_TYPE_OPTIONS.slice(1), ...availableTypes]))]
  }, [])

  const colorOptions = useMemo(() => {
    const availableColors = Array.from(
      new Set(FABRICS.map((fabric) => fabric.colorFamily).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right, 'es'))

    return [FABRIC_COLOR_OPTIONS[0], ...Array.from(new Set([...FABRIC_COLOR_OPTIONS.slice(1), ...availableColors]))]
  }, [])

  const patternOptions = useMemo(() => {
    const availablePatterns = Array.from(
      new Set(FABRICS.map((fabric) => fabric.pattern).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right, 'es'))

    return [
      FABRIC_PATTERN_OPTIONS[0],
      ...Array.from(new Set([...FABRIC_PATTERN_OPTIONS.slice(1), ...availablePatterns])),
    ]
  }, [])

  const visibleFabrics = useMemo(
    () =>
      FABRICS.filter((fabric) => {
        const manufacturerMatch =
          selectedManufacturer === 'Todos los fabricantes' ||
          fabric.manufacturer === selectedManufacturer
        const collectionMatch =
          selectedCollection === ALL_COLLECTIONS_OPTION ||
          selectedCollection === `${fabric.collection}::${fabric.manufacturer}`
        const typeMatch =
          selectedFabricType === 'Todos los tipos' || fabric.fabricType === selectedFabricType
        const colorMatch =
          selectedColorFamily === 'Todos los colores' || fabric.colorFamily === selectedColorFamily
        const patternMatch =
          selectedPattern === 'Todos los diseños' || fabric.pattern === selectedPattern

        return manufacturerMatch && collectionMatch && typeMatch && colorMatch && patternMatch
      }),
    [selectedManufacturer, selectedCollection, selectedFabricType, selectedColorFamily, selectedPattern],
  )
  const selectedFabricVisible = selectedFabric
    ? visibleFabrics.some((fabric) => fabric.id === selectedFabric.id)
    : true

  const ensureUpholsteryMask = async (furnitureId) => {
    const cachedMask = upholsteryMaskByFurnitureRef.current.get(furnitureId)
    if (cachedMask) return cachedMask

    const generatedMask = await createInitialUpholsteryMask(furnitureId)
    upholsteryMaskByFurnitureRef.current.set(furnitureId, generatedMask)
    return generatedMask
  }

  const drawMaskEditorCanvas = () => {
    const previewCanvas = maskEditorCanvasRef.current
    const baseImage = maskEditorImageRef.current
    const maskCanvas = maskEditorMaskCanvasRef.current
    const overlayCanvas = maskEditorOverlayCanvasRef.current

    if (!previewCanvas || !baseImage || !maskCanvas || !overlayCanvas) return

    const previewContext = previewCanvas.getContext('2d')
    const overlayContext = overlayCanvas.getContext('2d')
    if (!previewContext || !overlayContext) return

    const width = previewCanvas.width
    const height = previewCanvas.height

    overlayContext.clearRect(0, 0, width, height)
    overlayContext.drawImage(maskCanvas, 0, 0, width, height)
    overlayContext.globalCompositeOperation = 'source-in'
    overlayContext.fillStyle = '#0ea5e9'
    overlayContext.fillRect(0, 0, width, height)
    overlayContext.globalCompositeOperation = 'source-over'

    previewContext.clearRect(0, 0, width, height)
    previewContext.drawImage(baseImage, 0, 0, width, height)
    previewContext.globalAlpha = 0.45
    previewContext.drawImage(overlayCanvas, 0, 0, width, height)
    previewContext.globalAlpha = 1
  }

  const getMaskEditorPoint = (event) => {
    const canvas = maskEditorCanvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    const normalizedX = (event.clientX - rect.left) / rect.width
    const normalizedY = (event.clientY - rect.top) / rect.height

    return {
      x: clamp(normalizedX * canvas.width, 0, canvas.width),
      y: clamp(normalizedY * canvas.height, 0, canvas.height),
    }
  }

  const paintMaskAtPoint = (x, y) => {
    const maskCanvas = maskEditorMaskCanvasRef.current
    if (!maskCanvas) return

    const maskContext = maskCanvas.getContext('2d')
    if (!maskContext) return

    const previousPoint = maskEditorLastPointRef.current

    maskContext.save()
    maskContext.lineCap = 'round'
    maskContext.lineJoin = 'round'
    maskContext.lineWidth = maskBrushSize
    maskContext.globalCompositeOperation = maskBrushMode === 'paint' ? 'source-over' : 'destination-out'
    maskContext.strokeStyle = 'rgba(255, 255, 255, 1)'
    maskContext.fillStyle = 'rgba(255, 255, 255, 1)'

    if (previousPoint) {
      maskContext.beginPath()
      maskContext.moveTo(previousPoint.x, previousPoint.y)
      maskContext.lineTo(x, y)
      maskContext.stroke()
    }

    maskContext.beginPath()
    maskContext.arc(x, y, maskBrushSize / 2, 0, Math.PI * 2)
    maskContext.fill()
    maskContext.restore()

    maskEditorLastPointRef.current = { x, y }
    drawMaskEditorCanvas()
    setMaskCoveragePercent(calculateMaskCoveragePercent(maskCanvas))
  }

  const calculateMaskCoveragePercent = (maskCanvas) => {
    const furnitureAlphaMap = maskEditorFurnitureAlphaRef.current
    if (!maskCanvas || !furnitureAlphaMap) return 100

    const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true })
    if (!maskContext) return 100

    const maskPixels = maskContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data

    let furniturePixels = 0
    let selectedPixels = 0

    for (let pixelIndex = 0; pixelIndex < furnitureAlphaMap.length; pixelIndex += 1) {
      if (furnitureAlphaMap[pixelIndex] <= 6) continue
      furniturePixels += 1
      if (maskPixels[pixelIndex * 4 + 3] > 6) {
        selectedPixels += 1
      }
    }

    if (furniturePixels <= 0) return 100
    return Math.round((selectedPixels / furniturePixels) * 100)
  }

  const handleMaskPointerDown = (event) => {
    if (maskEditorBusy) return

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    maskEditorDrawingRef.current = true
    maskEditorLastPointRef.current = null

    const { x, y } = getMaskEditorPoint(event)
    paintMaskAtPoint(x, y)
  }

  const handleMaskPointerMove = (event) => {
    if (!maskEditorDrawingRef.current) return

    event.preventDefault()
    const { x, y } = getMaskEditorPoint(event)
    paintMaskAtPoint(x, y)
  }

  const stopMaskDrawing = (event) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    maskEditorDrawingRef.current = false
    maskEditorLastPointRef.current = null
  }

  const saveMaskEditor = async () => {
    if (!selectedFurniture || !maskEditorMaskCanvasRef.current) return

    setIsSavingMask(true)
    try {
      const maskDataUrl = maskEditorMaskCanvasRef.current.toDataURL('image/png')
      upholsteryMaskByFurnitureRef.current.set(selectedFurniture.id, maskDataUrl)
      setRenderedPreviewSrc('')
      setRenderError('')
      setRenderStatus(
        `Zona textil guardada para ${selectedFurniture.name} (${maskCoveragePercent}% de cobertura). Pulsa "Aplicar tela" para ver el resultado.`,
      )
      setIsMaskEditorOpen(false)
    } finally {
      setIsSavingMask(false)
    }
  }

  const resetMaskEditor = async () => {
    if (!selectedFurniture) return

    setMaskEditorError('')
    setMaskEditorBusy(true)
    try {
      const defaultMask = await createInitialUpholsteryMask(selectedFurniture.id)
      upholsteryMaskByFurnitureRef.current.set(selectedFurniture.id, defaultMask)
      setRenderedPreviewSrc('')
      setRenderStatus(
        `Zona textil restablecida para ${selectedFurniture.name}. Ajusta de nuevo si lo necesitas.`,
      )
      setMaskEditorRevision((prev) => prev + 1)
    } catch {
      setMaskEditorError('No se pudo restablecer la zona textil.')
    } finally {
      setMaskEditorBusy(false)
    }
  }

  useEffect(() => {
    if (!isMaskEditorOpen || !selectedFurniture) return undefined

    let cancelled = false

    const setupMaskEditor = async () => {
      setMaskEditorBusy(true)
      setMaskEditorError('')

      try {
        const [cutoutImage, maskDataUrl] = await Promise.all([
          loadImage(cutoutPath(selectedFurniture.id)),
          ensureUpholsteryMask(selectedFurniture.id),
        ])

        const maskImage = await loadImage(maskDataUrl)
        if (cancelled) return

        const width = cutoutImage.naturalWidth || cutoutImage.width
        const height = cutoutImage.naturalHeight || cutoutImage.height
        const previewCanvas = maskEditorCanvasRef.current

        if (!previewCanvas) return

        previewCanvas.width = width
        previewCanvas.height = height

        const maskCanvas = document.createElement('canvas')
        maskCanvas.width = width
        maskCanvas.height = height
        const maskContext = maskCanvas.getContext('2d')
        if (!maskContext) {
          throw new Error('No se pudo crear el editor de mascara.')
        }
        maskContext.drawImage(maskImage, 0, 0, width, height)

        const overlayCanvas = document.createElement('canvas')
        overlayCanvas.width = width
        overlayCanvas.height = height

        const sourceCanvas = document.createElement('canvas')
        sourceCanvas.width = width
        sourceCanvas.height = height
        const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true })
        if (!sourceContext) {
          throw new Error('No se pudo preparar el mapa base del mueble.')
        }
        sourceContext.drawImage(cutoutImage, 0, 0, width, height)
        const sourcePixels = sourceContext.getImageData(0, 0, width, height).data
        const furnitureAlphaMap = new Uint8ClampedArray(width * height)
        for (let index = 0; index < width * height; index += 1) {
          furnitureAlphaMap[index] = sourcePixels[index * 4 + 3]
        }

        maskEditorImageRef.current = cutoutImage
        maskEditorMaskCanvasRef.current = maskCanvas
        maskEditorOverlayCanvasRef.current = overlayCanvas
        maskEditorFurnitureAlphaRef.current = furnitureAlphaMap
        maskEditorDrawingRef.current = false
        maskEditorLastPointRef.current = null
        drawMaskEditorCanvas()
        setMaskCoveragePercent(calculateMaskCoveragePercent(maskCanvas))
      } catch {
        if (!cancelled) {
          setMaskEditorError('No se pudo cargar el editor de zona textil.')
        }
      } finally {
        if (!cancelled) {
          setMaskEditorBusy(false)
        }
      }
    }

    setupMaskEditor()

    return () => {
      cancelled = true
      maskEditorDrawingRef.current = false
      maskEditorLastPointRef.current = null
    }
  }, [isMaskEditorOpen, selectedFurniture, maskEditorRevision])

  const jumpTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setMobileMenuOpen(false)
  }

  const accountSnapshot = useMemo(
    () => {
      void quotaRevision
      return getUserQuotaSnapshot(currentUser)
    },
    [currentUser, quotaRevision],
  )

  const consumeRenderQuota = async () => {
    if (!currentUser || !API_BASE_URL || currentUser.provider !== 'api') {
      const localResult = await consumeLocalRenderQuota(currentUser)
      if (localResult.user) {
        setCurrentUser(localResult.user)
        saveAuthSession(localResult.user)
      }
      setQuotaRevision((value) => value + 1)
      return localResult
    }

    try {
      const response = await fetch(apiUrl('/api/auth/consume-render'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentUser.email }),
      })
      const payload = await safeParseJson(response)

      if (response.ok) {
        const updatedUser = sanitizeAuthUser({ ...(payload?.user || currentUser), provider: 'api' })
        setCurrentUser(updatedUser)
        saveAuthSession(updatedUser)
        setQuotaRevision((value) => value + 1)
        return {
          allowed: Boolean(payload?.allowed),
          message: payload?.message || '',
          quota: payload?.quota || getUserQuotaSnapshot(updatedUser),
          user: updatedUser,
        }
      }

      if (response.status === 404 || response.status === 503) {
        const fallbackResult = await consumeLocalRenderQuota({ ...currentUser, provider: 'local' })
        if (fallbackResult.user) {
          setCurrentUser(fallbackResult.user)
          saveAuthSession(fallbackResult.user)
        }
        setQuotaRevision((value) => value + 1)
        return fallbackResult
      }

      return {
        allowed: false,
        message: payload?.error || 'No se pudo validar tu cuota de renders.',
      }
    } catch {
      return {
        allowed: false,
        message: 'No se pudo validar tu cuota en este momento. Intenta de nuevo.',
      }
    }
  }

  const applyFabric = async () => {
    if (!selectedFurniture || !selectedFabric) return

    setRenderError('')
    setRenderStatus('')
    setIsApplyingFabric(true)

    try {
      const quotaResult = await consumeRenderQuota()
      if (!quotaResult.allowed) {
        setRenderError(quotaResult.message || 'No tienes renders disponibles en este momento.')
        if (!currentUser) {
          openAuthModal('register')
        } else if (quotaResult.reason === 'verify') {
          openAuthModal('verify')
        } else if (
          quotaResult.reason === 'trial' ||
          quotaResult.reason === 'free' ||
          quotaResult.quota?.state === 'trial' ||
          quotaResult.quota?.state === 'free'
        ) {
          jumpTo('precios')
        }
        return
      }

      const upholsteryMask = await ensureUpholsteryMask(selectedFurniture.id)
      const renderedResult = await renderFabricPreview(
        selectedFurniture.id,
        selectedFabric,
        upholsteryMask,
      )
      setRenderedPreviewSrc(renderedResult)
      setRenderStatus(
        quotaResult?.quota?.message
          ? `Vista previa actualizada: ${selectedFurniture.name} + ${selectedFabric.name}. ${quotaResult.quota.message}`
          : `Vista previa actualizada: ${selectedFurniture.name} + ${selectedFabric.name}.`,
      )
    } catch {
      setRenderError(
        'No se pudo renderizar la tela con precision. Prueba con otra tela o recarga.',
      )
    } finally {
      setIsApplyingFabric(false)
    }
  }

  const handlePlanCheckout = async (plan) => {
    if (!plan || plan.id === 'free') {
      setPaymentError('')
      setPaymentNotice('Ya tienes disponible el plan gratis.')
      return
    }

    if (!currentUser) {
      setPaymentError('Crea tu cuenta para suscribirte.')
      openAuthModal('register')
      return
    }

    if (!currentUser.emailVerified) {
      setPaymentError('Debes verificar tu email antes de suscribirte.')
      openAuthModal('verify')
      return
    }

    const billingCycle = annualBilling ? 'annual' : 'monthly'
    const directPaymentLink = getDirectPaymentLink(plan.id, billingCycle)

    setPaymentError('')
    setPaymentNotice('')
    setCheckoutLoadingPlanId(plan.id)
    savePendingPlan({ planId: plan.id, billingCycle })

    if (!API_BASE_URL) {
      if (!directPaymentLink) {
        setPaymentError(
          'Checkout no disponible: configura VITE_API_BASE_URL o enlaces directos de Stripe.',
        )
        clearPendingPlan()
        setCheckoutLoadingPlanId('')
        return
      }

      window.location.href = directPaymentLink
      return
    }

    try {
      const response = await fetch(apiUrl('/api/stripe/checkout-session'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.id,
          billingCycle,
          origin: window.location.origin,
          customerEmail: currentUser.email,
          clientReferenceId: currentUser.id,
        }),
      })

      if (!response.ok) {
        const checkoutError = await formatCheckoutError(response)

        if (directPaymentLink) {
          setPaymentNotice(
            'Servidor de checkout no disponible temporalmente. Redirigiendo a Stripe...',
          )
          window.location.href = directPaymentLink
          return
        }

        throw new Error(checkoutError)
      }

      const payload = await response.json()
      if (!payload?.url) {
        if (directPaymentLink) {
          setPaymentNotice(
            'Servidor de checkout no disponible temporalmente. Redirigiendo a Stripe...',
          )
          window.location.href = directPaymentLink
          return
        }

        throw new Error('Stripe no devolvio una URL de checkout valida.')
      }

      window.location.href = payload.url
    } catch (error) {
      if (directPaymentLink) {
        setPaymentNotice('No se pudo iniciar checkout por API. Redirigiendo a Stripe...')
        window.location.href = directPaymentLink
        return
      }

      clearPendingPlan()
      setPaymentError(error.message || 'No se pudo iniciar el checkout de Stripe.')
    } finally {
      setCheckoutLoadingPlanId('')
    }
  }

  const formatPrice = (plan) => {
    if (plan.monthlyPrice === 0) return 'Gratis'

    const value = annualBilling
      ? Math.round(plan.monthlyPrice * (1 - ANNUAL_DISCOUNT_RATE))
      : plan.monthlyPrice
    return `EUR ${value}`
  }

  const year = new Date().getFullYear()
  const canApply = Boolean(selectedFurniture && selectedFabric && !isApplyingFabric)
  const activePlan = PLANS.find((plan) => plan.id === currentUser?.planId) || PLANS[0]
  const trialDaysLeft =
    currentUser?.trialEndsAt && isTrialActive(currentUser)
      ? Math.max(
          0,
          Math.ceil((new Date(currentUser.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        )
      : 0
  const authModeTitle =
    authMode === 'register'
      ? 'Alta de usuario'
      : authMode === 'login'
        ? 'Iniciar sesion'
        : authMode === 'verify'
          ? 'Verificar email'
          : authMode === 'recover-request'
            ? 'Recuperar contraseña'
            : 'Restablecer contraseña'
  const authSubmitLabel =
    authMode === 'register'
      ? authLoading
        ? 'Creando cuenta...'
        : 'Crear cuenta'
      : authMode === 'login'
        ? authLoading
          ? 'Iniciando sesion...'
          : 'Entrar'
        : authMode === 'verify'
          ? authLoading
            ? 'Verificando...'
            : 'Verificar email'
          : authMode === 'recover-request'
            ? authLoading
              ? 'Enviando codigo...'
              : 'Enviar codigo'
            : authLoading
              ? 'Actualizando...'
              : 'Actualizar contraseña'

  return (
    <div className="app-shell">
      <header className="top-header">
        <div className="container header-inner">
          <div className="brand">
            <img src={assetUrl('/images/logo.png')} alt="Tapiza.online" />
            <span>Tapiza.online</span>
          </div>

          <nav className="desktop-nav">
            <button type="button" onClick={() => jumpTo('perfil')}>
              Perfil
            </button>
            <button type="button" onClick={() => jumpTo('catalogo')}>
              Catalogo
            </button>
            <button type="button" onClick={() => jumpTo('mi-diseno')}>
              Mi Diseno
            </button>
            <button type="button" onClick={() => jumpTo('precios')}>
              Precios
            </button>
          </nav>

          <div className="header-actions">
            {currentUser ? (
              <>
                <span className="auth-chip">{currentUser.name}</span>
                <button className="btn btn-outline-dark" type="button" onClick={handleLogout}>
                  Cerrar sesion
                </button>
              </>
            ) : (
              <button className="btn btn-dark" type="button" onClick={() => openAuthModal('register')}>
                Crear cuenta
              </button>
            )}
            <button
              className="menu-btn"
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
            >
              MENU
            </button>
          </div>
        </div>

        {mobileMenuOpen ? (
          <div className="mobile-nav container">
            <button type="button" onClick={() => jumpTo('perfil')}>
              Perfil
            </button>
            <button type="button" onClick={() => jumpTo('catalogo')}>
              Catalogo
            </button>
            <button type="button" onClick={() => jumpTo('mi-diseno')}>
              Mi Diseno
            </button>
            <button type="button" onClick={() => jumpTo('precios')}>
              Precios
            </button>
            {currentUser ? (
              <button
                type="button"
                onClick={() => {
                  handleLogout()
                  setMobileMenuOpen(false)
                }}
              >
                Cerrar sesion
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  openAuthModal('register')
                  setMobileMenuOpen(false)
                }}
              >
                Crear cuenta
              </button>
            )}
          </div>
        ) : null}
      </header>

      {authNotice && !authModalOpen ? (
        <div className="container">
          <p className="auth-global-notice">{authNotice}</p>
        </div>
      ) : null}

      <section className="hero">
        <div className="container hero-content">
          <div className="pill">Tecnologia IA aplicada a tapiceria</div>

          <h1>
            Transforma tus muebles
            <span>con un clic</span>
          </h1>

          <p>
            Visualiza telas en muebles reales antes de tapizar. Ideal para tapiceros,
            decoradores y contract.
          </p>

          <div className="hero-actions">
            <button className="btn btn-primary btn-large" type="button" onClick={() => jumpTo('mi-diseno')}>
              Comenzar gratis
            </button>
            <button className="btn btn-outline btn-large" type="button" onClick={() => jumpTo('catalogo')}>
              Ver demo
            </button>
          </div>

          <div className="stats-grid">
            <div>
              <strong>500+</strong>
              <span>Telas disponibles</span>
            </div>
            <div>
              <strong>50+</strong>
              <span>Modelos de muebles</span>
            </div>
            <div>
              <strong>2.5K+</strong>
              <span>Usuarios activos</span>
            </div>
            <div>
              <strong>10K+</strong>
              <span>Renders generados</span>
            </div>
          </div>
        </div>
      </section>

      <main className="container main-content">
        <section id="perfil" className="section-space profile-section">
          <div className="section-title">
            <h2>Panel de perfil</h2>
            <p>
              Gestiona tu cuenta, verificación de email, recuperación de contraseña y estado
              de suscripción desde un único sitio.
            </p>
          </div>

          {currentUser ? (
            <div className="profile-card">
              <div className="profile-grid">
                <div>
                  <p className="profile-label">Usuario</p>
                  <strong>{currentUser.name}</strong>
                  <p>{currentUser.email}</p>
                </div>
                <div>
                  <p className="profile-label">Email</p>
                  <strong>{currentUser.emailVerified ? 'Verificado' : 'Pendiente de verificación'}</strong>
                  <p>
                    {currentUser.emailVerified
                      ? 'Cuenta verificada correctamente.'
                      : 'Verifica tu correo para activar la prueba Pro.'}
                  </p>
                </div>
                <div>
                  <p className="profile-label">Plan</p>
                  <strong>{activePlan?.name || 'Gratis'}</strong>
                  <p>
                    {currentUser.planId !== 'free'
                      ? 'Suscripción activa con renders ilimitados.'
                      : trialDaysLeft > 0
                        ? `Prueba Pro activa (${trialDaysLeft} días restantes).`
                        : 'Plan gratis mensual activo.'}
                  </p>
                </div>
              </div>

              <p className="profile-quota">{accountSnapshot.message}</p>

              <div className="profile-actions">
                {!currentUser.emailVerified ? (
                  <button
                    className="btn btn-outline-dark"
                    type="button"
                    onClick={() => openAuthModal('verify')}
                  >
                    Verificar email
                  </button>
                ) : null}
                <button
                  className="btn btn-outline-dark"
                  type="button"
                  onClick={() => openAuthModal('recover-request')}
                >
                  Recuperar contraseña
                </button>
                {currentUser.planId === 'free' ? (
                  <button className="btn btn-primary" type="button" onClick={() => jumpTo('precios')}>
                    Mejorar plan
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="profile-card guest">
              <p>
                Empieza con 1 render invitado, activa 14 días de prueba Pro al verificar tu email
                y luego decide si quieres pasar a un plan de pago.
              </p>
              <div className="profile-actions">
                <button className="btn btn-primary" type="button" onClick={() => openAuthModal('register')}>
                  Crear cuenta gratis
                </button>
                <button className="btn btn-outline-dark" type="button" onClick={() => openAuthModal('login')}>
                  Ya tengo cuenta
                </button>
              </div>
            </div>
          )}
        </section>

        <section id="mi-diseno" className="section-space">
          <div className="section-title">
            <h2>Disena tu tapizado</h2>
            <p>
              Selecciona un mueble del catalogo o sube tu propia imagen. Elige la tela
              perfecta y visualiza el resultado al instante.
            </p>
          </div>

          <div className="designer-grid">
            <div className="designer-main">
              <div className="tabs">
                <button
                  type="button"
                  className={activeTab === 'furniture' ? 'tab active' : 'tab'}
                  onClick={() => setActiveTab('furniture')}
                >
                  Muebles
                </button>
                <button
                  type="button"
                  className={activeTab === 'fabrics' ? 'tab active-fabric' : 'tab'}
                  onClick={() => setActiveTab('fabrics')}
                >
                  Telas
                </button>
              </div>

              {activeTab === 'furniture' ? (
                <div className="panel">
                  <div className="panel-head">
                    <h3>Catalogo de muebles</h3>
                    <span className="badge">{FURNITURE.length} disponibles</span>
                  </div>

                  <div className="filters">
                    <div>
                      <p>Categoria</p>
                      <div className="chip-wrap">
                        {CATEGORIES.map((category) => (
                          <button
                            key={category}
                            type="button"
                            className={selectedCategory === category ? 'chip active' : 'chip'}
                            onClick={() => setSelectedCategory(category)}
                          >
                            {category}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p>Estilo</p>
                      <div className="chip-wrap">
                        {STYLES.map((style) => (
                          <button
                            key={style}
                            type="button"
                            className={selectedStyle === style ? 'chip warm' : 'chip'}
                            onClick={() => setSelectedStyle(style)}
                          >
                            {style}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p>Forma</p>
                      <div className="chip-wrap">
                        {SHAPES.map((shape) => (
                          <button
                            key={shape}
                            type="button"
                            className={selectedShape === shape ? 'chip neutral' : 'chip'}
                            onClick={() => setSelectedShape(shape)}
                          >
                            {shape}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <p className="results-label">{filteredFurniture.length} muebles encontrados</p>

                  <div className="furniture-grid">
                    {filteredFurniture.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={selectedFurniture?.id === item.id ? 'furniture-card selected' : 'furniture-card'}
                        onClick={() => {
                          setSelectedFurniture(item)
                          setRenderedPreviewSrc('')
                          setRenderError('')
                          setRenderStatus('')
                          setIsMaskEditorOpen(false)
                          setMaskEditorError('')
                        }}
                      >
                        <div className="furniture-image">
                          <img src={assetUrl(item.image)} alt={item.name} loading="lazy" />
                        </div>
                        <h4>{item.name}</h4>
                        <div className="mini-badges">
                          <span>{item.type}</span>
                          <span>{item.style}</span>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="upload-card">
                    <h4>Subir mueble propio</h4>
                    <div>
                      <p>Arrastra un mueble aqui o haz clic para seleccionar.</p>
                      <small>JPG, PNG, WebP - Max 10MB</small>
                    </div>
                    <p className="upgrade-note">Mejora tu plan para subir muebles propios.</p>
                  </div>
                </div>
              ) : (
                <div className="panel">
                  <div className="panel-head">
                    <h3>Biblioteca de telas</h3>
                    <span className="badge">{visibleFabrics.length} seleccionadas</span>
                  </div>

                  <p className="fabric-source-note">
                    Froca ACANTO ({FROCA_FABRIC_COUNTS.acanto}) + BALENCIAGA (
                    {FROCA_FABRIC_COUNTS.balenciaga}) ya integradas.
                  </p>

                  <div className="fabric-select-grid">
                    <label className="fabric-select-field">
                      Fabricante
                      <select
                        value={selectedManufacturer}
                        onChange={(event) => setSelectedManufacturer(event.target.value)}
                      >
                        {manufacturerOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="fabric-select-field">
                      Colección
                      <select
                        value={selectedCollection}
                        onChange={(event) => setSelectedCollection(event.target.value)}
                      >
                        {collectionOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="fabric-select-field">
                      Tipo de tela
                      <select
                        value={selectedFabricType}
                        onChange={(event) => setSelectedFabricType(event.target.value)}
                      >
                        {fabricTypeOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="fabric-select-field">
                      Color
                      <select
                        value={selectedColorFamily}
                        onChange={(event) => setSelectedColorFamily(event.target.value)}
                      >
                        {colorOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="fabric-select-field">
                      Diseño
                      <select
                        value={selectedPattern}
                        onChange={(event) => setSelectedPattern(event.target.value)}
                      >
                        {patternOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="fabrics-grid">
                    {visibleFabrics.map((fabric) => (
                      <button
                        type="button"
                        key={fabric.id}
                        className={selectedFabric?.id === fabric.id ? 'fabric-card active' : 'fabric-card'}
                        onClick={() => {
                          setSelectedFabric(fabric)
                          setRenderedPreviewSrc('')
                          setRenderError('')
                          setRenderStatus('')
                        }}
                      >
                        <span
                          style={{
                            backgroundColor: fabric.color,
                            ...(fabric.swatch
                              ? {
                                  backgroundImage: `linear-gradient(rgba(255,255,255,0.12), rgba(255,255,255,0.12)), url(${assetUrl(
                                    fabric.swatch,
                                  )})`,
                                  backgroundSize: 'cover',
                                  backgroundPosition: 'center',
                                  backgroundBlendMode: 'multiply',
                                }
                              : {}),
                          }}
                        />
                        <strong>{fabric.name}</strong>
                        <small>
                          {fabric.collection} ({fabric.manufacturer}) · {fabric.fabricType} ·{' '}
                          {fabric.pattern}
                        </small>
                      </button>
                    ))}
                  </div>

                  {!selectedFabricVisible && selectedFabric ? (
                    <p className="fabric-filter-warning">
                      La tela seleccionada no coincide con los filtros actuales.
                    </p>
                  ) : null}

                  {!visibleFabrics.length ? (
                    <p className="fabric-filter-warning">
                      No hay telas para la combinacion seleccionada. Ajusta los filtros.
                    </p>
                  ) : null}
                </div>
              )}
            </div>

            <aside className="preview-panel">
              <div className="panel">
                <div className="panel-head">
                  <h3>Vista previa de tapizado</h3>
                </div>

                <div className="preview-box">
                  {selectedFurniture ? (
                    <img
                      className="preview-furniture-image"
                      src={renderedPreviewSrc || cutoutPath(selectedFurniture.id)}
                      alt={selectedFurniture.name}
                    />
                  ) : (
                    <div className="preview-placeholder">
                      <p>Selecciona un mueble para comenzar</p>
                    </div>
                  )}
                </div>

                <div className="selection-grid">
                  <div>
                    <p className="selection-title">Mueble</p>
                    <p>{selectedFurniture ? selectedFurniture.name : 'Sin seleccionar'}</p>
                  </div>
                  <div>
                    <p className="selection-title">Tela</p>
                    <p>{selectedFabric ? selectedFabric.name : 'Sin seleccionar'}</p>
                  </div>
                </div>

                {!selectedVisible && selectedFurniture ? (
                  <p className="filter-warning">
                    El mueble seleccionado no coincide con los filtros actuales.
                  </p>
                ) : null}

                {selectedFurniture ? (
                  <div className="mask-editor-section">
                    <button
                      className="btn btn-outline-dark full-width"
                      type="button"
                      onClick={() => {
                        setMaskEditorError('')
                        setIsMaskEditorOpen((prev) => {
                          if (!prev) {
                            setMaskEditorRevision((value) => value + 1)
                          }
                          return !prev
                        })
                      }}
                    >
                      {isMaskEditorOpen ? 'Cerrar editor de zona textil' : 'Editar zona textil'}
                    </button>
                    <p className="mask-editor-help">
                      Marca solo las zonas con tela para evitar tapizar patas, madera o partes
                      exteriores.
                    </p>

                    {isMaskEditorOpen ? (
                      <div className="mask-editor-card">
                        <div className="mask-editor-toolbar">
                          <div className="mask-editor-mode">
                            <button
                              type="button"
                              className={maskBrushMode === 'paint' ? 'mask-mode-btn active' : 'mask-mode-btn'}
                              onClick={() => setMaskBrushMode('paint')}
                            >
                              Pintar zona textil
                            </button>
                            <button
                              type="button"
                              className={maskBrushMode === 'erase' ? 'mask-mode-btn active' : 'mask-mode-btn'}
                              onClick={() => setMaskBrushMode('erase')}
                            >
                              Quitar zona
                            </button>
                          </div>
                          <label className="mask-size-control">
                            Pincel: {maskBrushSize}px
                            <input
                              type="range"
                              min="8"
                              max="180"
                              step="4"
                              value={maskBrushSize}
                              onChange={(event) =>
                                setMaskBrushSize(Number.parseInt(event.target.value, 10))
                              }
                            />
                          </label>
                        </div>

                        {maskEditorBusy ? (
                          <p className="mask-editor-info">Cargando editor de zona textil...</p>
                        ) : null}
                        {maskEditorError ? (
                          <p className="mask-editor-error">{maskEditorError}</p>
                        ) : null}

                        <canvas
                          ref={maskEditorCanvasRef}
                          className="mask-editor-canvas"
                          onPointerDown={handleMaskPointerDown}
                          onPointerMove={handleMaskPointerMove}
                          onPointerUp={stopMaskDrawing}
                          onPointerCancel={stopMaskDrawing}
                          onPointerLeave={stopMaskDrawing}
                        />

                        <div className="mask-editor-actions">
                          <button
                            type="button"
                            className="btn btn-outline-dark"
                            onClick={resetMaskEditor}
                            disabled={maskEditorBusy || isSavingMask}
                          >
                            Restablecer zona
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={saveMaskEditor}
                            disabled={maskEditorBusy || isSavingMask}
                          >
                            {isSavingMask ? 'Guardando...' : 'Guardar zona textil'}
                          </button>
                        </div>
                        <p className="mask-editor-info">
                          Azul = zona que recibira tela al aplicar el tejido. Cobertura actual:{' '}
                          {maskCoveragePercent}%.
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <button
                  className="btn btn-primary full-width"
                  type="button"
                  disabled={!canApply}
                  onClick={applyFabric}
                >
                  {isApplyingFabric ? 'Aplicando tela...' : 'Aplicar tela'}
                </button>

                {accountSnapshot?.message ? <p className="render-status">{accountSnapshot.message}</p> : null}
                {renderError ? <p className="render-error">{renderError}</p> : null}
                {renderStatus ? <p className="render-status">{renderStatus}</p> : null}
              </div>
            </aside>
          </div>
        </section>

        <section id="catalogo" className="section-space">
          <div className="section-title">
            <h2>Explora nuestro catalogo</h2>
            <p>
              Mas de 50 modelos de muebles y 500 telas de proveedores espanoles como Froca,
              Aznar Textil y Tuva Textil.
            </p>
          </div>

          <div className="catalog-summary">
            {CATALOG_CARDS.map((card) => (
              <article key={card.title} className={`summary-card ${card.variant}`}>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
                <span>{card.counter}</span>
              </article>
            ))}
          </div>
        </section>
      </main>

      <section id="precios" className="pricing">
        <div className="container">
          <div className="section-title">
            <h2>Planes adaptados a ti</h2>
            <p>
              Desde profesionales independientes hasta grandes estudios, tenemos el plan
              perfecto para tu negocio de tapiceria.
            </p>
          </div>
          <p className="payment-notice">
            Flujo activo: 1 render invitado - registro - verificacion de email - 14 dias de
            prueba Pro - plan gratis (5 renders/mes) o suscripcion.
          </p>

          <div className="billing-toggle">
            <span className={!annualBilling ? 'active' : ''}>Mensual</span>
            <button
              type="button"
              className={annualBilling ? 'switch active' : 'switch'}
              onClick={() => setAnnualBilling((prev) => !prev)}
              aria-label="Cambiar tipo de facturacion"
            >
              <span />
            </button>
            <span className={annualBilling ? 'active' : ''}>
              Anual <small>-20%</small>
            </span>
          </div>

          {paymentNotice ? <p className="payment-notice">{paymentNotice}</p> : null}
          {paymentError ? <p className="payment-error">{paymentError}</p> : null}

          <div className="plans-grid">
            {PLANS.map((plan) => {
              const isCurrentPlan = (currentUser?.planId || 'free') === plan.id
              return (
                <article
                  key={plan.name}
                  className={`plan-card${isCurrentPlan ? ' current' : ''}${plan.popular ? ' popular' : ''}`}
                >
                  {isCurrentPlan ? <div className="plan-tag current-tag">Plan actual</div> : null}
                  {plan.popular ? <div className="plan-tag popular-tag">Mas popular</div> : null}

                  <div className="plan-icon">{plan.icon}</div>
                  <h3>{plan.name}</h3>
                  <p>{plan.audience}</p>

                  <div className="plan-price">
                    <strong>{formatPrice(plan)}</strong>
                    {plan.monthlyPrice > 0 ? <span>/mes</span> : null}
                  </div>

                  <ul>
                    {plan.features.map((feature) => (
                      <li key={feature}>- {feature}</li>
                    ))}
                  </ul>

                  <button
                    className={plan.popular ? 'btn btn-primary full-width' : 'btn btn-outline-dark full-width'}
                    type="button"
                    disabled={isCurrentPlan || checkoutLoadingPlanId === plan.id}
                    onClick={() => handlePlanCheckout(plan)}
                  >
                    {isCurrentPlan
                      ? 'Plan actual'
                      : checkoutLoadingPlanId === plan.id
                        ? 'Abriendo checkout...'
                        : plan.cta}
                  </button>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      {authModalOpen ? (
        <div
          className="auth-modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeAuthModal()
            }
          }}
        >
          <div className="auth-modal" role="dialog" aria-modal="true" aria-label="Autenticacion">
            <div className="auth-modal-head">
              <h3>{authModeTitle}</h3>
              <button
                type="button"
                className="auth-modal-close"
                aria-label="Cerrar autenticacion"
                onClick={closeAuthModal}
              >
                x
              </button>
            </div>

            {authMode === 'register' || authMode === 'login' ? (
              <div className="auth-mode-switch">
                <button
                  type="button"
                  className={authMode === 'register' ? 'auth-mode-btn active' : 'auth-mode-btn'}
                  onClick={() => switchAuthMode('register')}
                >
                  Registro
                </button>
                <button
                  type="button"
                  className={authMode === 'login' ? 'auth-mode-btn active' : 'auth-mode-btn'}
                  onClick={() => switchAuthMode('login')}
                >
                  Acceso
                </button>
              </div>
            ) : null}

            <form className="auth-form" onSubmit={submitAuth}>
              {authMode === 'register' ? (
                <label className="auth-field">
                  Nombre
                  <input
                    type="text"
                    value={authName}
                    onChange={(event) => setAuthName(event.target.value)}
                    placeholder="Tu nombre"
                    autoComplete="name"
                    required
                  />
                </label>
              ) : null}

              <label className="auth-field">
                Email
                <input
                  type="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="correo@empresa.com"
                  autoComplete="email"
                  required
                />
              </label>

              {authMode === 'register' || authMode === 'login' ? (
                <label className="auth-field">
                  Contraseña
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    placeholder="Minimo 8 caracteres"
                    autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                    required
                  />
                </label>
              ) : null}

              {authMode === 'register' ? (
                <label className="auth-field">
                  Confirmar contraseña
                  <input
                    type="password"
                    value={authConfirmPassword}
                    onChange={(event) => setAuthConfirmPassword(event.target.value)}
                    placeholder="Repite la contraseña"
                    autoComplete="new-password"
                    required
                  />
                </label>
              ) : null}

              {authMode === 'verify' || authMode === 'recover-reset' ? (
                <label className="auth-field">
                  Código
                  <input
                    type="text"
                    value={authCode}
                    onChange={(event) => setAuthCode(event.target.value)}
                    placeholder="Introduce el código recibido"
                    autoComplete="one-time-code"
                    required
                  />
                </label>
              ) : null}

              {authMode === 'recover-reset' ? (
                <>
                  <label className="auth-field">
                    Nueva contraseña
                    <input
                      type="password"
                      value={authRecoveryPassword}
                      onChange={(event) => setAuthRecoveryPassword(event.target.value)}
                      placeholder="Minimo 8 caracteres"
                      autoComplete="new-password"
                      required
                    />
                  </label>

                  <label className="auth-field">
                    Confirmar contraseña
                    <input
                      type="password"
                      value={authRecoveryConfirmPassword}
                      onChange={(event) => setAuthRecoveryConfirmPassword(event.target.value)}
                      placeholder="Repite la nueva contraseña"
                      autoComplete="new-password"
                      required
                    />
                  </label>
                </>
              ) : null}

              <button className="btn btn-primary full-width" type="submit" disabled={authLoading}>
                {authSubmitLabel}
              </button>
            </form>

            <div className="auth-links">
              {authMode === 'login' ? (
                <button type="button" onClick={() => switchAuthMode('recover-request')}>
                  ¿Olvidaste tu contraseña?
                </button>
              ) : null}
              {authMode === 'verify' ? (
                <button type="button" onClick={handleResendVerification} disabled={authLoading}>
                  Reenviar código de verificación
                </button>
              ) : null}
              {authMode === 'recover-request' || authMode === 'recover-reset' ? (
                <button type="button" onClick={() => switchAuthMode('login')}>
                  Volver al acceso
                </button>
              ) : null}
            </div>

            {authError ? <p className="auth-error">{authError}</p> : null}
            {authNotice ? <p className="auth-success">{authNotice}</p> : null}
            <p className="auth-note">
              Tus datos se guardan en backend cuando está disponible. En modo demo también
              tienes fallback local para poder probar registro, verificación y recuperación.
            </p>
          </div>
        </div>
      ) : null}

      <footer className="site-footer">
        <div className="container footer-grid">
          <div>
            <div className="brand">
              <img src={assetUrl('/images/logo.png')} alt="Tapiza.online" />
              <span>Tapiza.online</span>
            </div>
            <p>
              La plataforma lider en visualizacion virtual de tapiceria para profesionales
              del sector.
            </p>
            <ul>
              <li>info@tapiza.online</li>
              <li>+34 900 123 456</li>
              <li>Valencia, Espana</li>
            </ul>
          </div>

          <div>
            <h4>Enlaces rapidos</h4>
            <button type="button" onClick={() => jumpTo('catalogo')}>
              Catalogo de muebles
            </button>
            <button type="button" onClick={() => jumpTo('mi-diseno')}>
              Mi diseno
            </button>
            <button type="button" onClick={() => jumpTo('precios')}>
              Planes y precios
            </button>
          </div>

          <div>
            <h4>Legal</h4>
            <a href="#">Sobre nosotros</a>
            <a href="#">Terminos de servicio</a>
            <a href="#">Politica de privacidad</a>
            <a href="#">Politica de cookies</a>
          </div>

          <div>
            <h4>Proveedores partners</h4>
            <div className="partner-grid">
              <span>Froca</span>
              <span>Aznar Textil</span>
              <span>Tuva Textil</span>
              <span>Texere</span>
            </div>
          </div>
        </div>

        <div className="container footer-bottom">
          <p>(c) {year} Tapiza.online. Todos los derechos reservados.</p>
          <div>
            <a href="#">Twitter</a>
            <a href="#">LinkedIn</a>
            <a href="#">Instagram</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
