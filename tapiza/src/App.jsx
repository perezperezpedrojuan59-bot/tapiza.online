import { useEffect, useMemo, useState } from 'react'
import { ANNUAL_DISCOUNT_RATE, PLAN_DEFINITIONS } from '../shared/plans.js'
import { FROCA_FABRICS, FROCA_FABRIC_COUNTS } from '../shared/frocaFabrics.js'
import './App.css'

const assetUrl = (path) => {
  const cleanPath = String(path).replace(/^\/+/, '')
  return `${import.meta.env.BASE_URL}${cleanPath}`
}

const STRIPE_API_BASE_URL = (import.meta.env.VITE_STRIPE_API_BASE_URL || '').trim()

const apiUrl = (path) =>
  `${STRIPE_API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`

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

const renderFabricPreview = async (furnitureId, fabricSelection) => {
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

      outputPixels[index] = clamp(tintedRed * 0.9 + sourceRed * 0.1)
      outputPixels[index + 1] = clamp(tintedGreen * 0.9 + sourceGreen * 0.1)
      outputPixels[index + 2] = clamp(tintedBlue * 0.9 + sourceBlue * 0.1)
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

const BASE_FABRICS = [
  {
    id: 'velvet-azul',
    name: 'Velvet Azul Noche',
    family: 'Velvet',
    color: '#1E3A5F',
  },
  {
    id: 'chenille-arena',
    name: 'Chenille Arena',
    family: 'Chenille',
    color: '#D4A574',
  },
  {
    id: 'lino-crudo',
    name: 'Lino Crudo',
    family: 'Lino',
    color: '#DDD3C5',
  },
  {
    id: 'boucle-perla',
    name: 'Boucle Perla',
    family: 'Boucle',
    color: '#E7E7E4',
  },
  {
    id: 'microfibra-grafito',
    name: 'Microfibra Grafito',
    family: 'Microfibra',
    color: '#474747',
  },
  {
    id: 'jacquard-verde',
    name: 'Jacquard Verde Salvia',
    family: 'Jacquard',
    color: '#8C9B83',
  },
  {
    id: 'algodon-terracota',
    name: 'Algodon Terracota',
    family: 'Algodon',
    color: '#B66F52',
  },
  {
    id: 'pana-nude',
    name: 'Pana Nude',
    family: 'Pana',
    color: '#B99E8C',
  },
]

const FABRICS = [...FROCA_FABRICS, ...BASE_FABRICS]

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

function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('furniture')
  const [selectedCategory, setSelectedCategory] = useState('Todos')
  const [selectedStyle, setSelectedStyle] = useState('Todos los estilos')
  const [selectedShape, setSelectedShape] = useState('Todas las formas')
  const [selectedFurniture, setSelectedFurniture] = useState(null)
  const [selectedFabric, setSelectedFabric] = useState(null)
  const [selectedFabricFamily, setSelectedFabricFamily] = useState('Todas')
  const [renderedPreviewSrc, setRenderedPreviewSrc] = useState('')
  const [isApplyingFabric, setIsApplyingFabric] = useState(false)
  const [renderError, setRenderError] = useState('')
  const [annualBilling, setAnnualBilling] = useState(false)
  const [renderStatus, setRenderStatus] = useState('')
  const [paymentNotice, setPaymentNotice] = useState('')
  const [paymentError, setPaymentError] = useState('')
  const [checkoutLoadingPlanId, setCheckoutLoadingPlanId] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const checkoutStatus = params.get('checkout')

    if (checkoutStatus === 'success') {
      setPaymentNotice('Pago confirmado. Tu suscripcion Stripe se ha iniciado correctamente.')
      setPaymentError('')
    } else if (checkoutStatus === 'cancelled') {
      setPaymentNotice('Checkout cancelado. Puedes volver a intentarlo cuando quieras.')
      setPaymentError('')
    }

    if (checkoutStatus) {
      const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`
      window.history.replaceState({}, '', cleanUrl)
    }
  }, [])

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
  const fabricFamilies = useMemo(
    () => ['Todas', ...Array.from(new Set(FABRICS.map((fabric) => fabric.family)))],
    [],
  )
  const visibleFabrics = useMemo(
    () =>
      selectedFabricFamily === 'Todas'
        ? FABRICS
        : FABRICS.filter((fabric) => fabric.family === selectedFabricFamily),
    [selectedFabricFamily],
  )
  const selectedFabricVisible = selectedFabric
    ? visibleFabrics.some((fabric) => fabric.id === selectedFabric.id)
    : true

  const jumpTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setMobileMenuOpen(false)
  }

  const applyFabric = async () => {
    if (!selectedFurniture || !selectedFabric) return

    setRenderError('')
    setRenderStatus('')
    setIsApplyingFabric(true)

    try {
      const renderedResult = await renderFabricPreview(
        selectedFurniture.id,
        selectedFabric,
      )
      setRenderedPreviewSrc(renderedResult)
      setRenderStatus(
        `Vista previa actualizada: ${selectedFurniture.name} + ${selectedFabric.name}.`,
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

    setPaymentError('')
    setPaymentNotice('')
    setCheckoutLoadingPlanId(plan.id)

    try {
      const response = await fetch(apiUrl('/api/stripe/checkout-session'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.id,
          billingCycle: annualBilling ? 'annual' : 'monthly',
          origin: window.location.origin,
        }),
      })

      if (!response.ok) {
        throw new Error(await formatCheckoutError(response))
      }

      const payload = await response.json()
      if (!payload?.url) {
        throw new Error('Stripe no devolvio una URL de checkout valida.')
      }

      window.location.href = payload.url
    } catch (error) {
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

  return (
    <div className="app-shell">
      <header className="top-header">
        <div className="container header-inner">
          <div className="brand">
            <img src={assetUrl('/images/logo.png')} alt="Tapiza.online" />
            <span>Tapiza.online</span>
          </div>

          <nav className="desktop-nav">
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
            <button className="btn btn-dark" type="button">
              Iniciar sesion
            </button>
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
            <button type="button" onClick={() => jumpTo('catalogo')}>
              Catalogo
            </button>
            <button type="button" onClick={() => jumpTo('mi-diseno')}>
              Mi Diseno
            </button>
            <button type="button" onClick={() => jumpTo('precios')}>
              Precios
            </button>
          </div>
        ) : null}
      </header>

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

                  <div className="fabric-family-filters">
                    {fabricFamilies.map((family) => (
                      <button
                        key={family}
                        type="button"
                        className={
                          selectedFabricFamily === family
                            ? 'fabric-family-filter active'
                            : 'fabric-family-filter'
                        }
                        onClick={() => setSelectedFabricFamily(family)}
                      >
                        {family}
                      </button>
                    ))}
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
                        <small>{fabric.family}</small>
                      </button>
                    ))}
                  </div>

                  {!selectedFabricVisible && selectedFabric ? (
                    <p className="fabric-filter-warning">
                      La tela seleccionada no coincide con el filtro actual de familia.
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

                <button
                  className="btn btn-primary full-width"
                  type="button"
                  disabled={!canApply}
                  onClick={applyFabric}
                >
                  {isApplyingFabric ? 'Aplicando tela...' : 'Aplicar tela'}
                </button>

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
            {PLANS.map((plan) => (
              <article
                key={plan.name}
                className={`plan-card${plan.current ? ' current' : ''}${plan.popular ? ' popular' : ''}`}
              >
                {plan.current ? <div className="plan-tag current-tag">Plan actual</div> : null}
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
                  disabled={plan.id === 'free' || checkoutLoadingPlanId === plan.id}
                  onClick={() => handlePlanCheckout(plan)}
                >
                  {checkoutLoadingPlanId === plan.id ? 'Abriendo checkout...' : plan.cta}
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>

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
