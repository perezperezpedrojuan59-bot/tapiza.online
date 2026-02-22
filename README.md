# Tapiza Virtual

App web para **tapizar virtualmente** muebles a partir de una foto.

## Que hace

- Carga una imagen local (sofa, sillon, cabecera, etc.).
- Incluye ejemplos realistas precargados: cabecero, silla, sillon, sofa y puff.
- Detecta automaticamente la zona tapizable del mueble.
- Permite recalcular la deteccion con un control de sensibilidad.
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

## Probar en la ventana derecha de Cursor

1. Abre la carpeta del proyecto (`/workspace`) en Cursor.
2. Inicia un servidor local en terminal:

```bash
python3 -m http.server 8080
```

3. En Cursor, abre la vista de puertos/preview y abre `http://localhost:8080`.
4. Fija ese preview en el panel derecho para probar la app mientras editas.

## Publicacion automatica

- El repo incluye un workflow en `.github/workflows/deploy-pages.yml`.
- Cada push a la rama `cursor/tapicer-a-virtual-app-6bf8` despliega en GitHub Pages.
- URL esperada del sitio: `https://perezperezpedrojuan59-bot.github.io/tapiza.online/`

## Flujo recomendado

1. Carga foto o elige un ejemplo realista.
2. La app detecta sola la zona de tela.
3. Si hace falta, ajusta sensibilidad y recalcula deteccion.
4. Cambia colores/patrones y ajusta intensidad.
5. Descarga el resultado.

## Notas tecnicas

- El render usa canvas 2D.
- El efecto mantiene parte de la iluminacion original para que el tapizado se vea mas natural.
- Las imagenes grandes se reducen automaticamente para mejorar rendimiento.

## Creditos de imagenes de ejemplo

Las fotos de muestra incluidas en `assets/samples/` provienen de Unsplash:

- Cabecero: https://unsplash.com/photos/a-bed-with-a-fancy-headboard-in-a-bedroom-NNBnzeakKK0
- Silla: https://unsplash.com/photos/a-chair-and-a-table-in-a-room-al0srakHkkY
- Sillon: https://sureste.dico.com.mx/media/catalog/product/cache/ddfdab190e55251eefb307178e423bf7/s/a/sala-moderna-sillon-gris-london_sal38447s1-d-3.jpg
- Sofa: https://sureste.dico.com.mx/media/catalog/product/cache/ddfdab190e55251eefb307178e423bf7/s/a/sala-moderna-sofa-gris-london_sal38445s1-d-1.jpg
- Puff: https://unsplash.com/photos/a-living-room-with-a-large-window-and-a-white-ottoman-6DpsNbYFXMw
