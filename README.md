# Media Downloader

Extensión de Chrome/Brave (Manifest V3) que inyecta scripts de usuario en los
sitios que tú eliges, con una GUI minimalista y actualización de los scripts
desde un repositorio de GitHub.

## Instalación (Brave / Chrome)

1. Abre `brave://extensions` (o `chrome://extensions`).
2. Activa **Modo de desarrollador** (esquina superior derecha).
3. Pulsa **Cargar descomprimida** y selecciona esta carpeta
   (`downloader_addon`).
4. Fija la extensión a la barra con el icono de rombo de la barra de
   herramientas.

## Uso

- Pulsa el icono de la extensión: verás la lista de sitios soportados
  (solo **OnlyFans** por ahora) con su icono y un interruptor para activar o
  desactivar la inyección en cada uno.
- Al activar un sitio, el script se inyecta al momento en la pestaña activa;
  si no llega a aplicarse, recarga la página.
- El botón **Actualizar desde GitHub** descarga la última versión de cada
  script y lo guarda; se aplica al momento en la pestaña activa.

### Script inicial (OnlyFans)

Es el userscript de Tampermonkey de `code.js` (Shift + clic copia el enlace de
una imagen; botones flotantes descargan la imagen del visor o el video). La
extensión le proporciona los sustitutos necesarios de `GM_setClipboard`,
`GM_download` y `GM_registerMenuCommand`, así que el código funciona tal cual.

## Actualización desde GitHub

1. Abre la GUI y pulsa el icono de ⚙ **Ajustes**.
2. Escribe el repositorio con formato `usuario/repositorio` y la rama
   (por defecto `main`).
3. Pulsa **Actualizar desde GitHub**.

Cada sitio `X` se descarga de:

```
https://raw.githubusercontent.com/<repo>/<rama>/scripts/X.js
```

La versión que se muestra en la GUI se lee de la cabecera `@version` del
script. Si el repositorio no está configurado (o un archivo no existe), el
sitio conserva el código que ya tenía y muestra el error.

## Añadir un sitio nuevo

1. Copia el script en `scripts/<id>.js`.
2. Añade una entrada en `src/sites.js`:

```js
{
  id: 'nuevositio',            // = nombre de archivo scripts/nuevositio.js
  nombre: 'Nuevo Sitio',
  hosts: ['nuevositio.com'],   // dominios donde inyectar (incluye subdominios)
  color: '#ff5500',            // color del icono en la GUI
  letra: 'N',
  github: 'scripts/{id}.js'
}
```

3. En `brave://extensions`, pulsa el botón ⟳ de la extensión para recargarla
   (los sitios ya guardados no se pierden; solo se crean los nuevos).

## Estructura

```
manifest.json        Configuración MV3 de la extensión
background.js        Service worker: inyección y descargas
src/sites.js         Registro de sitios soportados
src/storage.js       Lectura/escritura de chrome.storage.local
src/github.js        Descarga de scripts desde GitHub
src/inject.js        Puente GM_* + ejecución del código en la página
popup/               GUI (HTML/CSS/JS)
scripts/             Scripts por sitio (onlyfans.js)
icons/               Iconos de la extensión
```
