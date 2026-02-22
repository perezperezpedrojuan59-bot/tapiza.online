# Tapiza.online (Replica Frontend)

Aplicacion React + Vite inspirada en la web de referencia:
`https://n14gh1mssxf0-d.space.z.ai/`

## Incluye

- Header sticky con navegacion por secciones.
- Hero principal con estadisticas y CTAs.
- Seccion **Mi Diseno** con:
  - filtros por categoria, estilo y forma,
  - seleccion de mueble,
  - seleccion de tela,
  - preview de tapizado.
- Seccion de catalogo resumen.
- Seccion de precios con toggle mensual/anual.
- Footer corporativo.

## Ejecutar en local

```bash
npm install
npm run dev
```

## Ejecutar frontend + backend Stripe

```bash
npm install
cp .env.example .env
npm run dev:full
```

API Stripe local: `http://localhost:8787`

## Build de produccion

```bash
npm run build
npm run preview
```

## Variables de entorno Stripe

Configura en `.env`:

- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET` (opcional pero recomendado)
- `APP_BASE_URL` (URL publica del frontend)
- `VITE_STRIPE_API_BASE_URL` (si backend esta en otro dominio)

### Endpoints backend

- `GET /api/stripe/config`
- `POST /api/stripe/checkout-session`
- `POST /api/stripe/webhook`

### Nota de seguridad

No subas ni compartas claves `sk_live` en repositorio ni en chats. Usa `.env`.
