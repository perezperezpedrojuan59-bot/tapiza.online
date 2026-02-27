# tapiza.online

MVP inicial para tapiza.online: un cotizador CLI para servicios de tapizado.

## Objetivo

Tener una base funcional para evolucionar el producto:

- un dominio minimo de cotizacion
- una interfaz CLI para generar presupuestos
- tests de negocio sobre reglas de calculo

## Estructura

```text
job/
|-- .editorconfig
|-- .env.example
|-- .gitignore
|-- Makefile
|-- pyproject.toml
|-- README.md
|-- docs/
|   `-- ROADMAP.md
|-- src/
|   `-- job/
|       |-- __init__.py
|       |-- main.py
|       `-- quote.py
`-- tests/
    |-- test_quote.py
    `-- test_smoke.py
```

## Requisitos

- Python 3.11+
- make

## Arranque rapido

1. Crear entorno virtual:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

2. Ejecutar ayuda del CLI:

   ```bash
   make run
   ```

3. Generar una cotizacion de ejemplo:

   ```bash
   PYTHONPATH=src python -m job.main cotizar --mueble sofa_3p --horas 14 --tela premium --urgente --recogida
   ```

4. Ejecutar tests:

   ```bash
   make test
   ```

## Estado actual del MVP

- [x] Alcance inicial del MVP definido
- [x] Primer caso de uso implementado (cotizacion)
- [x] Tests de negocio para calculo y validaciones
