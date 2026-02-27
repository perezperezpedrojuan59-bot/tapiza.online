# Roadmap inicial de tapiza.online

## Fase 1: Definicion

- [x] Definir problema y usuario objetivo.
- [x] Redactar requisitos funcionales del MVP.
- [x] Definir criterios de exito.

### Definicion actual

- Problema: talleres de tapizado tardan en responder presupuestos preliminares.
- Usuario objetivo: pequenos talleres y profesionales independientes.
- Criterio de exito inicial: generar presupuesto consistente en menos de 1 minuto.

## Fase 2: Arquitectura

- [x] Elegir tipo de aplicacion (CLI).
- [x] Disenar modelo de datos inicial.
- [ ] Definir estrategia de despliegue.

### Modelo de datos inicial

- Tipo de mueble
- Horas de mano de obra estimadas
- Nivel de tela
- Recargo por urgencia
- Servicio de recogida/entrega

## Fase 3: Implementacion

- [x] Crear primer caso de uso end-to-end.
- [ ] Anadir logging y manejo de errores.
- [x] Incorporar tests de dominio.

## Siguiente iteracion sugerida

1. Persistir cotizaciones en una base de datos ligera.
2. Exponer el cotizador como API HTTP para frontend web.
3. Agregar autenticacion para talleres.
