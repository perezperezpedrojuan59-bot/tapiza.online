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
- Alta de usuario + login.
- Verificacion de email (codigo).
- Recuperacion de contraseña (solicitud + confirmacion con codigo).
- Panel basico de perfil (estado de verificacion, plan y cuota).
- Flujo de monetizacion:
  - 1 render como invitado.
  - Registro y verificacion de email.
  - Prueba Pro de 14 dias.
  - Plan gratis mensual (5 renders/mes) o suscripcion de pago.

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

- `VITE_API_BASE_URL` (API global opcional para auth + Stripe)
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET` (opcional pero recomendado)
- `APP_BASE_URL` (URL publica del frontend)
- `VITE_STRIPE_API_BASE_URL` (compatibilidad, se usa si `VITE_API_BASE_URL` esta vacio)

### Endpoints backend

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verification`
- `POST /api/auth/password-recovery/request`
- `POST /api/auth/password-recovery/confirm`
- `GET /api/auth/profile?email=...`
- `POST /api/auth/consume-render`
- `POST /api/auth/activate-plan`
- `GET /api/stripe/config`
- `POST /api/stripe/checkout-session`
- `POST /api/stripe/webhook`

### Fallback para sitios estaticos (GitHub Pages)

Si `VITE_STRIPE_API_BASE_URL` no esta definido, el frontend usa enlaces directos de Stripe
(`shared/stripePaymentLinks.js`) para abrir el checkout sin backend.

- Ventaja: checkout funciona en hosting estatico.
- Limitacion: no hay webhook propio para post-procesado en tu servidor.

Para autenticacion, si el endpoint API no esta disponible, la app usa almacenamiento local
en navegador para permitir registro/inicio de sesion en modo demo.

`AUTH_EXPOSE_CODES=true` permite devolver codigos de verificacion/recuperacion en respuestas API
para entorno demo (no usar en produccion).

### Nota de seguridad

No subas ni compartas claves `sk_live` en repositorio ni en chats. Usa `.env`.
