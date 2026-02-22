# Tapiza Virtual

App web para **tapizar virtualmente** muebles a partir de una foto.

## Que hace

- Carga una imagen local (sofa, sillon, cabecera, etc.).
- Permite pintar la zona a tapizar con brocha.
- Incluye modo borrador y deshacer.
- Ofrece telas por color y por patron.
- Ajusta intensidad del acabado.
- Alterna entre vista original y resultado.
- Descarga la imagen final en PNG.

## Como usar

No requiere dependencias ni build.

1. Abre `index.html` en tu navegador.
2. O levanta un servidor estatico:

```bash
python3 -m http.server 8080
```

y luego visita `http://localhost:8080`.

## Flujo recomendado

1. Carga foto.
2. Usa brocha para marcar la tela actual del mueble.
3. Cambia colores/patrones y ajusta intensidad.
4. Descarga el resultado.

## Notas tecnicas

- El render usa canvas 2D.
- El efecto mantiene parte de la iluminacion original para que el tapizado se vea mas natural.
- Las imagenes grandes se reducen automaticamente para mejorar rendimiento.
