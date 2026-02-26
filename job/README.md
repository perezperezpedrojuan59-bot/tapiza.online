# job

Proyecto base inicial para arrancar rapido.

## Objetivo

Dejar una base limpia y lista para evolucionar (API, CLI o app) sin bloquearte por configuracion inicial.

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
|       `-- main.py
`-- tests/
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

2. Ejecutar el proyecto:

   ```bash
   make run
   ```

3. Ejecutar tests:

   ```bash
   make test
   ```

## Siguientes pasos recomendados

1. Definir alcance inicial del proyecto (MVP).
2. Elegir arquitectura objetivo (API REST, worker, CLI, etc.).
3. Crear el primer modulo funcional real en `src/job/`.
