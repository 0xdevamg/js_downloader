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
5. **Importante:** en `brave://extensions`, entra en Media Downloader y activa
   el interruptor **«Permitir scripts de usuario»**. Sin esto la inyección no
   funciona (la GUI lo avisará con un banner naranja).

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

## Verificar que la inyección funciona

El botón de descarga **no siempre está visible**: el de imagen solo aparece
cuando hay un visor/overlay abierto (p. ej. al abrir una foto a pantalla
completa) y el de video solo cuando el `<video>` tiene un enlace directo —
los videos en streaming (`blob:`, como los de OnlyFans) se omiten a propósito
porque no se pueden descargar así.

Para comprobar la extensión sin depender de OnlyFans:

1. Sirve la página de prueba: `python3 -m http.server 8899` en esta carpeta.
2. Abre `http://localhost:8899/test/pagina-prueba.html` en Brave.
3. Haz clic en una foto (se abre el visor → botón abajo a la derecha) o mira
   el video (botón sobre su esquina superior derecha).

La GUI también muestra el estado de la pestaña activa: "script inyectado ✓",
"la URL no pertenece a ningún sitio activado" o el error concreto si la
inyección falló.

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
background.js        Service worker: registro de user scripts y descargas
src/sites.js         Registro de sitios soportados
src/storage.js       Lectura/escritura de chrome.storage.local
src/github.js        Descarga de scripts desde GitHub
src/shim.js          Sustitutos GM_* insertados antes de cada script
popup/               GUI (HTML/CSS/JS)
scripts/             Scripts por sitio (onlyfans.js)
test/                Página de prueba local
icons/               Iconos de la extensión
```

## Cómo funciona la inyección

Los sitios se registran con la API `chrome.userScripts` (la misma que usan
Tampermonkey y Violentmonkey en MV3): el código guardado en storage se
incrusta tal cual en el user script — sin `eval` ni `new Function`, que la CSP
de las extensiones MV3 prohíbe. El navegador inyecta cada script
automáticamente en las cargas de página que coinciden con sus dominios. Antes
del código se inserta un shim que proporciona `GM_setClipboard`,
`GM_download` (vía `chrome.downloads` en el service worker) y
`GM_registerMenuCommand` (sin efecto).
