# CurranteYA (MVP)

Plataforma de empleo rapido para trabajos operativos en mercado hispano.

## Stack

- Next.js 14 (App Router) + TypeScript (strict)
- TailwindCSS
- Supabase (Auth, Postgres, Storage, Realtime)
- Deploy preparado para Vercel

## Decision clave de arquitectura

Se usa **una sola tabla `profiles`** con campos opcionales por rol (`worker` o `company`), para reducir joins y complejidad de permisos.

## Estructura del proyecto

```text
job/
|-- .env.example
|-- .eslintrc.json
|-- middleware.ts
|-- next.config.mjs
|-- package.json
|-- postcss.config.js
|-- tailwind.config.ts
|-- tsconfig.json
|-- supabase/
|   |-- schema.sql
|   `-- seed.sql
`-- src/
    |-- app/
    |   |-- actions/
    |   |   |-- auth.ts
    |   |   |-- jobs.ts
    |   |   `-- profiles.ts
    |   |-- auth/
    |   |-- chats/[id]/
    |   |-- offers/
    |   |-- panel/
    |   |-- globals.css
    |   |-- layout.tsx
    |   `-- page.tsx
    |-- components/
    |-- lib/
    |   |-- domain/
    |   |-- supabase/
    |   `-- validation/
    `-- types/
```

## Variables de entorno

Copia el ejemplo y completa valores:

```bash
cp .env.example .env.local
```

`.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

## Como crear y configurar Supabase

1. Crea un proyecto en Supabase.
2. Ve a SQL Editor y ejecuta completo `supabase/schema.sql`.
3. (Opcional) Ejecuta `supabase/seed.sql` tras reemplazar UUIDs.
4. En Auth -> Providers, deja Email enabled.
5. En Database -> Replication, verifica que `public.messages` este en publication `supabase_realtime`.
6. En Storage, se crea bucket `profile-media` via SQL (public bucket con policies por carpeta de usuario).

## Desarrollo local

```bash
npm install
npm run dev
```

Abrir: `http://localhost:3000`

## Scripts utiles

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run test
```

## Deploy en Vercel

1. Importa el repo en Vercel.
2. Configura variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy.

## Funcionalidades MVP incluidas

- Auth email/password con rol en registro (`worker` / `company`).
- Perfiles por rol usando tabla unica `profiles`.
- Ofertas (CRUD empresa) + listado y filtros.
- Postulacion worker + estado candidatura.
- Chat 1:1 por candidatura con Supabase Realtime.
- Toggle "Disponible hoy" para worker.
- Listado de workers disponibles para empresas.
- Panel worker y panel company.
- Upload de foto/logo con validacion de tipo y tamano (max 2MB).

## Tests minimos incluidos (5)

Archivo: `src/lib/domain/mvp.test.ts`

1. Crear oferta
2. Postular
3. Worker no puede editar oferta
4. Chat solo participantes
5. Toggle `available_today`

## Checklist final de verificacion manual

- [ ] Registro worker crea perfil con rol correcto
- [ ] Registro company crea perfil con rol correcto
- [ ] Company puede crear/editar/eliminar oferta propia
- [ ] Worker puede ver ofertas y postularse
- [ ] Company ve candidaturas de sus ofertas
- [ ] Chat abre tras postular y solo participantes acceden
- [ ] Worker puede activar/desactivar "Disponible hoy"
- [ ] Company filtra "Disponibles hoy" por ciudad/categoria
- [ ] Upload de avatar/logo respeta tipo y tamano
- [ ] RLS bloquea accesos cruzados entre usuarios
