import { useEffect, useMemo, useState } from 'react'
import './App.css'

const assetUrl = (path) => {
  const cleanPath = String(path).replace(/^\/+/, '')
  return `${import.meta.env.BASE_URL}${cleanPath}`
}

const createFurnitureMask = (imageSrc) =>
  new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null)
      return
    }

    const image = new Image()

    image.onload = () => {
      const width = image.naturalWidth
      const height = image.naturalHeight

      if (!width || !height) {
        resolve(null)
        return
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) {
        resolve(null)
        return
      }

      context.drawImage(image, 0, 0, width, height)
      const imageData = context.getImageData(0, 0, width, height)
      const pixels = imageData.data

      const sampleStep = Math.max(1, Math.floor(Math.min(width, height) / 24))
      let sampleRed = 0
      let sampleGreen = 0
      let sampleBlue = 0
      let sampleCount = 0

      const readPixel = (x, y) => {
        const pixelIndex = (y * width + x) * 4
        return [
          pixels[pixelIndex],
          pixels[pixelIndex + 1],
          pixels[pixelIndex + 2],
        ]
      }

      for (let x = 0; x < width; x += sampleStep) {
        const top = readPixel(x, 0)
        const bottom = readPixel(x, height - 1)
        sampleRed += top[0] + bottom[0]
        sampleGreen += top[1] + bottom[1]
        sampleBlue += top[2] + bottom[2]
        sampleCount += 2
      }

      for (let y = sampleStep; y < height - sampleStep; y += sampleStep) {
        const left = readPixel(0, y)
        const right = readPixel(width - 1, y)
        sampleRed += left[0] + right[0]
        sampleGreen += left[1] + right[1]
        sampleBlue += left[2] + right[2]
        sampleCount += 2
      }

      const backgroundRed = sampleRed / sampleCount
      const backgroundGreen = sampleGreen / sampleCount
      const backgroundBlue = sampleBlue / sampleCount

      const alphaMask = new Uint8ClampedArray(width * height)

      for (let pixel = 0; pixel < width * height; pixel += 1) {
        const sourceIndex = pixel * 4
        const red = pixels[sourceIndex]
        const green = pixels[sourceIndex + 1]
        const blue = pixels[sourceIndex + 2]

        const redDiff = red - backgroundRed
        const greenDiff = green - backgroundGreen
        const blueDiff = blue - backgroundBlue
        const distance = Math.sqrt(
          redDiff * redDiff + greenDiff * greenDiff + blueDiff * blueDiff,
        )

        const maxChannel = Math.max(red, green, blue)
        const minChannel = Math.min(red, green, blue)
        const saturation = maxChannel - minChannel
        const luminance = (red + green + blue) / 3

        const looksLikeBackground =
          distance < 36 ||
          (luminance > 228 && saturation < 14 && distance < 64)

        alphaMask[pixel] = looksLikeBackground ? 0 : 255
      }

      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          const current = y * width + x
          if (alphaMask[current] === 0) continue

          const nearOpaque =
            (alphaMask[current - 1] > 0 ? 1 : 0) +
            (alphaMask[current + 1] > 0 ? 1 : 0) +
            (alphaMask[current - width] > 0 ? 1 : 0) +
            (alphaMask[current + width] > 0 ? 1 : 0)

          if (nearOpaque <= 1) {
            alphaMask[current] = 0
          }
        }
      }

      for (let pixel = 0; pixel < width * height; pixel += 1) {
        const sourceIndex = pixel * 4
        pixels[sourceIndex] = 255
        pixels[sourceIndex + 1] = 255
        pixels[sourceIndex + 2] = 255
        pixels[sourceIndex + 3] = alphaMask[pixel]
      }

      context.putImageData(imageData, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }

    image.onerror = () => resolve(null)
    image.src = imageSrc
  })

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

const FABRICS = [
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

const PLANS = [
  {
    name: 'Gratis',
    audience: 'Probadores',
    monthlyPrice: 0,
    current: true,
    icon: 'FREE',
    cta: 'Plan actual',
    features: ['5 renders/mes', 'Catalogo basico', 'Descarga de imagenes'],
  },
  {
    name: 'Basico',
    audience: 'Tapiceros autonomos',
    monthlyPrice: 19,
    icon: 'BASIC',
    cta: 'Suscribirse',
    features: [
      '50 renders/mes',
      'Catalogo completo',
      'Subir 5 telas propias',
      'Soporte por email',
    ],
  },
  {
    name: 'Profesional',
    audience: 'Decoradores',
    monthlyPrice: 49,
    popular: true,
    icon: 'PRO',
    cta: 'Suscribirse',
    features: [
      '200 renders/mes',
      'Subir muebles y telas',
      'Marcas favoritas',
      'Historial de proyectos',
      'Soporte prioritario',
    ],
  },
  {
    name: 'Business',
    audience: 'Contract / Empresas',
    monthlyPrice: 99,
    icon: 'BIZ',
    cta: 'Suscribirse',
    features: [
      'Renders ilimitados',
      'API access',
      'Multi-usuario (5)',
      'Brand customization',
      'Soporte dedicado',
    ],
  },
  {
    name: 'Enterprise',
    audience: 'Grandes estudios',
    monthlyPrice: 249,
    icon: 'ENT',
    cta: 'Suscribirse',
    features: [
      'Todo lo de Business',
      'SLA garantizado',
      'Integraciones custom',
      'Account manager',
      'Onboarding personalizado',
    ],
  },
]

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
    description: 'Velvet, lino, chenille y boucle de proveedores espanoles.',
    counter: '25 telas',
    variant: 'light',
  },
]

function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('furniture')
  const [selectedCategory, setSelectedCategory] = useState('Todos')
  const [selectedStyle, setSelectedStyle] = useState('Todos los estilos')
  const [selectedShape, setSelectedShape] = useState('Todas las formas')
  const [selectedFurniture, setSelectedFurniture] = useState(null)
  const [selectedFabric, setSelectedFabric] = useState(null)
  const [maskCache, setMaskCache] = useState({})
  const [annualBilling, setAnnualBilling] = useState(false)
  const [renderStatus, setRenderStatus] = useState('')

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
  const selectedMask = selectedFurniture ? maskCache[selectedFurniture.id] : null

  useEffect(() => {
    if (!selectedFurniture || selectedMask) return

    let isCancelled = false
    const furnitureId = selectedFurniture.id
    const source = assetUrl(selectedFurniture.image)

    createFurnitureMask(source).then((maskDataUrl) => {
      if (!maskDataUrl || isCancelled) return

      setMaskCache((previousCache) => {
        if (previousCache[furnitureId]) return previousCache
        return { ...previousCache, [furnitureId]: maskDataUrl }
      })
    })

    return () => {
      isCancelled = true
    }
  }, [selectedFurniture, selectedMask])

  const jumpTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setMobileMenuOpen(false)
  }

  const applyFabric = () => {
    if (!selectedFurniture || !selectedFabric) return

    setRenderStatus(
      `Vista previa actualizada: ${selectedFurniture.name} + ${selectedFabric.name}.`,
    )
  }

  const formatPrice = (plan) => {
    if (plan.monthlyPrice === 0) return 'Gratis'

    const value = annualBilling ? Math.round(plan.monthlyPrice * 0.8) : plan.monthlyPrice
    return `EUR ${value}`
  }

  const year = new Date().getFullYear()
  const canApply = Boolean(selectedFurniture && selectedFabric && selectedMask)

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
                    <span className="badge">{FABRICS.length} seleccionadas</span>
                  </div>

                  <div className="fabrics-grid">
                    {FABRICS.map((fabric) => (
                      <button
                        type="button"
                        key={fabric.id}
                        className={selectedFabric?.id === fabric.id ? 'fabric-card active' : 'fabric-card'}
                        onClick={() => {
                          setSelectedFabric(fabric)
                          setRenderStatus('')
                        }}
                      >
                        <span style={{ backgroundColor: fabric.color }} />
                        <strong>{fabric.name}</strong>
                        <small>{fabric.family}</small>
                      </button>
                    ))}
                  </div>
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
                    <>
                      <img
                        className="preview-furniture-image"
                        src={assetUrl(selectedFurniture.image)}
                        alt={selectedFurniture.name}
                      />
                      {selectedFabric && selectedMask ? (
                        <div
                          className="fabric-overlay"
                          style={{
                            backgroundColor: selectedFabric.color,
                            maskImage: `url("${selectedMask}")`,
                            WebkitMaskImage: `url("${selectedMask}")`,
                          }}
                        />
                      ) : null}
                    </>
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
                  Aplicar tela
                </button>

                {selectedFurniture && selectedFabric && !selectedMask ? (
                  <p className="mask-status">Preparando zona de tapizado...</p>
                ) : null}

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

                <button className={plan.popular ? 'btn btn-primary full-width' : 'btn btn-outline-dark full-width'} type="button">
                  {plan.cta}
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
