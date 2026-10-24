// ==UserScript==
// @name         Copiar Link de Imagen con Shift + Click (Ultra)
// @namespace    http://tampermonkey.net/
// @version      2.6
// @description  Copia el enlace de imágenes dinámicas con Shift + Click y añade botones de descarga para imágenes en overlay y para videos.
// @author       Tu Nombre
// @match        *://*/*
// @grant        GM_setClipboard
// @grant        GM_download
// @connect      *
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';

    // ---------------------------------------------------------------------
    // Configuración
    // ---------------------------------------------------------------------

    // Ubicación de las descargas: subcarpeta DENTRO de la carpeta de descargas
    // del navegador. Ejemplos: 'Tampermonkey', 'Medios/Capturas'.
    // Déjala vacía ('') para guardar directamente en la carpeta de descargas.
    // No admite rutas absolutas (C:\..., /home/...): el navegador no lo permite.
    // Requiere en Tampermonkey: Configuración > Descargas > Modo de descarga = "API del navegador".
    const CARPETA_DESCARGAS = '';

    const ID_BOTON = 'tm-boton-descargar';
    const CLASE_BOTON = 'tm-boton-descarga'; // común al botón del overlay y a los de video
    const CLASE_BOTON_VIDEO = 'tm-boton-descarga-video';
    const ID_BOTON_VIDEO = 'tm-boton-descargar-video';
    const ID_CHECK = 'tm-check-copiado';
    const NS = 'http://www.w3.org/2000/svg';

    // ---------------------------------------------------------------------
    // Utilidades compartidas
    // ---------------------------------------------------------------------

    // URL real de un <img>, normalizada a absoluta
    function urlDeImagen(img) {
        const url = img.currentSrc ||
                    img.src ||
                    img.getAttribute('data-src') ||
                    img.getAttribute('data-original');
        return normalizarUrl(url);
    }

    function normalizarUrl(url) {
        if (!url) return null;
        if (url.startsWith('//')) return window.location.protocol + url;
        if (url.startsWith('/')) return window.location.origin + url;
        return url;
    }

    function esVisible(el) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const cs = window.getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
    }

    // ---------------------------------------------------------------------
    // Shift + Click: copiar el enlace de la imagen
    // ---------------------------------------------------------------------

    document.addEventListener('click', function(event) {
        // Solo actuar si Shift está presionado
        if (!event.shiftKey) return;

        let target = event.target;
        // El botón de descarga tiene su propio manejador
        if (target.closest && target.closest('.' + CLASE_BOTON)) return;

        let imageUrl = null;

        // 0. Si lo que hay bajo el cursor es un video, copiar su enlace
        const video = videoEnPunto(event.clientX, event.clientY);
        const videoUrl = video && urlDeVideo(video);
        if (videoUrl) {
            event.preventDefault();
            event.stopPropagation();
            GM_setClipboard(videoUrl, 'text');
            mostrarAviso(true);
            return;
        }

        // 1. Intentar obtener la imagen directamente o buscarla dentro del elemento clickeado
        let imgElement = target.tagName === 'IMG' ? target : target.querySelector('img');

        // 2. Si no se encontró, puede que haya un div invisible ENCIMA de la imagen.
        if (!imgElement) {
            const elementsAtPoint = document.elementsFromPoint(event.clientX, event.clientY);
            for (let el of elementsAtPoint) {
                if (el.tagName === 'IMG') {
                    imgElement = el;
                    break;
                } else {
                    let subImg = el.querySelector('img');
                    if (subImg) {
                        imgElement = subImg;
                        break;
                    }
                }
            }
        }

        // 3. Si encontramos una imagen, extraemos su URL real
        if (imgElement) {
            event.preventDefault();
            event.stopPropagation();
            imageUrl = urlDeImagen(imgElement);
        }
        // 4. Si no es un <img>, revisar si tiene imagen de fondo (CSS background-image)
        else {
            const bgImg = window.getComputedStyle(target).backgroundImage;
            if (bgImg && bgImg !== 'none') {
                const match = bgImg.match(/url\(['"]?([^'"]+)['"]?\)/);
                if (match && match[1]) {
                    event.preventDefault();
                    event.stopPropagation();
                    imageUrl = normalizarUrl(match[1]);
                }
            }
        }

        // 5. Si logramos capturar una URL, la copiamos
        if (imageUrl) {
            GM_setClipboard(imageUrl, 'text');
            mostrarAviso(true);
        }
    }, true); // fase de captura para adelantarse a otros scripts de la página

    // ---------------------------------------------------------------------
    // Overlay de imagen: detección + botón de descarga
    // ---------------------------------------------------------------------

    // Devuelve el contenedor del overlay abierto, o null
    function detectarOverlay() {
        // a) PhotoSwipe (visor usado por muchos sitios)
        const pswp = document.querySelector('.pswp--open, .pswp--visible, .pswp[aria-hidden="false"]');
        if (pswp && esVisible(pswp)) return pswp;

        //    Respaldo: cualquier diapositiva .pswp__img visible (un <div> que envuelve al <img>, o el <img> mismo)
        for (const slide of document.querySelectorAll('.pswp__img')) {
            if (!esVisible(slide)) continue;
            return slide.closest('.pswp') || slide.parentElement;
        }

        // b) Genérico: capa fija a pantalla completa, por encima de la página,
        //    que contiene una imagen grande
        const vw = window.innerWidth, vh = window.innerHeight;
        const pila = document.elementsFromPoint(vw / 2, vh / 2);
        for (const el of pila) {
            if (el === document.documentElement || el === document.body) continue;
            const cs = window.getComputedStyle(el);
            if (cs.position !== 'fixed') continue;
            const r = el.getBoundingClientRect();
            if (r.width < vw * 0.9 || r.height < vh * 0.9) continue;
            const encima = parseInt(cs.zIndex, 10) > 0 ||
                           el.getAttribute('aria-modal') === 'true' ||
                           el.getAttribute('role') === 'dialog';
            if (!encima) continue;
            if (imagenDelOverlay(el)) return el;
        }
        return null;
    }

    // La imagen que se está mostrando: la más grande que cubre el centro de la pantalla
    function imagenDelOverlay(overlay) {
        const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
        let mejor = null, mejorArea = 0, respaldo = null, respaldoArea = 0;
        // En PhotoSwipe, limitarse a las diapositivas para no confundirlas con miniaturas o avatares
        let imgs = overlay.querySelectorAll('.pswp__img img, img.pswp__img');
        if (!imgs.length) imgs = overlay.querySelectorAll('img');
        for (const img of imgs) {
            if (!esVisible(img)) continue;
            const r = img.getBoundingClientRect();
            if (r.width < 150 || r.height < 150) continue; // descartar iconos y avatares
            const area = r.width * r.height;
            const enCentro = r.left <= cx && r.right >= cx && r.top <= cy && r.bottom >= cy;
            if (enCentro && area > mejorArea) { mejor = img; mejorArea = area; }
            if (area > respaldoArea) { respaldo = img; respaldoArea = area; }
        }
        return mejor || respaldo;
    }

    function nombreDeArchivo(url, extension) {
        try {
            const ultimo = new URL(url).pathname.split('/').pop();
            const nombre = decodeURIComponent(ultimo || '').replace(/[\\/:*?"<>|]/g, '_');
            if (nombre && /\.[a-z0-9]{2,5}$/i.test(nombre)) return nombre;
            if (nombre) return nombre + extension;
        } catch (e) { /* URL no válida: usar nombre genérico */ }
        return 'descarga-' + Date.now() + extension;
    }

    // Antepone CARPETA_DESCARGAS al nombre del archivo. Limpia la carpeta para que
    // siempre sea una ruta relativa válida (sin unidad, sin '..', sin barras sobrantes).
    function rutaDeDescarga(nombre) {
        const carpeta = String(CARPETA_DESCARGAS || '')
            .replace(/\\/g, '/')
            .split('/')
            .map(parte => parte.trim().replace(/[:*?"<>|]/g, '_'))
            .filter(parte => parte && parte !== '.' && parte !== '..')
            .join('/');
        return carpeta ? carpeta + '/' + nombre : nombre;
    }

    // Descarga una URL; mientras dura, el botón queda atenuado y desactivado
    function descargarUrl(url, extension, boton) {
        if (!url) { mostrarAviso(false); return; }
        if (boton.dataset.ocupado) return;
        boton.dataset.ocupado = '1';
        boton.style.opacity = '0.4';
        const liberar = () => { delete boton.dataset.ocupado; boton.style.opacity = '1'; };

        GM_download({
            url: url,
            name: rutaDeDescarga(nombreDeArchivo(url, extension)),
            saveAs: false,
            onload: () => { liberar(); mostrarAviso(true); },
            onerror: () => {
                // Si Tampermonkey no puede descargarlo, abrirlo en otra pestaña
                liberar();
                mostrarAviso(false);
                window.open(url, '_blank', 'noopener');
            }
        });
    }

    function descargarImagen(boton) {
        const overlay = detectarOverlay();
        const img = overlay && imagenDelOverlay(overlay);
        descargarUrl(img && urlDeImagen(img), '.jpg', boton);
    }

    // ---------------------------------------------------------------------
    // Videos
    // ---------------------------------------------------------------------

    function esUrlDescargable(url) {
        return !!url && /^https?:/i.test(url); // blob: (streaming/DRM) no se puede bajar así
    }

    // Enlace del video. Primero el mismo que usa el navegador en
    // "Abrir video en una pestaña nueva" (currentSrc: lo que el reproductor tiene
    // cargado); si no hay, el atributo src; y por último los <source>, de mayor
    // a menor calidad.
    function urlDeVideo(video) {
        const directos = [video.currentSrc, video.getAttribute('src')];
        for (const candidato of directos) {
            const url = normalizarUrl(candidato);
            if (esUrlDescargable(url)) return url;
        }
        let mejor = null, mejorPuntos = -1;
        for (const source of video.querySelectorAll('source')) {
            const url = normalizarUrl(source.getAttribute('src'));
            if (!esUrlDescargable(url)) continue;
            const etiqueta = (source.getAttribute('label') || '').toLowerCase();
            let puntos = parseInt(etiqueta, 10) || 0;
            if (/original|source/.test(etiqueta)) puntos = 1e6;
            if (puntos > mejorPuntos) { mejor = url; mejorPuntos = puntos; }
        }
        return mejor;
    }

    // El <video> que hay bajo el cursor, aunque tenga capas encima (controles, póster)
    function videoEnPunto(x, y) {
        for (const el of document.elementsFromPoint(x, y)) {
            if (el.tagName === 'VIDEO') return el;
            const dentro = el.querySelector && el.querySelector('video');
            if (dentro && el.closest('.video-js')) return dentro;
        }
        return null;
    }

    // Contenedor donde colgar el botón: el reproductor video.js, o el padre del <video>
    function contenedorDeVideo(video) {
        return video.closest('.video-js') || video.parentElement;
    }

    function hayVideoEnElCentro(overlay) {
        const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
        for (const video of overlay.querySelectorAll('video')) {
            if (!esVisible(video)) continue;
            const r = video.getBoundingClientRect();
            if (r.left <= cx && r.right >= cx && r.top <= cy && r.bottom >= cy) return true;
        }
        return false;
    }

    // Parte de un rectángulo que queda dentro de la ventana
    function areaVisible(r) {
        const ancho = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0);
        const alto = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
        return ancho > 0 && alto > 0 ? ancho * alto : 0;
    }

    // El video al que apunta el botón: el descargable que más espacio ocupa en pantalla
    function videoObjetivo() {
        let mejor = null, mejorArea = 0;
        for (const video of document.querySelectorAll('video')) {
            if (!urlDeVideo(video)) continue;
            // Medir el reproductor y no el <video>: este puede estar oculto tras el póster
            const caja = contenedorDeVideo(video) || video;
            const r = caja.getBoundingClientRect();
            if (r.width < 120 || r.height < 80) continue;
            const area = areaVisible(r);
            if (area > mejorArea) { mejor = video; mejorArea = area; }
        }
        return mejor;
    }

    // Botón flotante de video. Igual que el de imagen, se cuelga de <html> (no del
    // reproductor, que puede taparlo o borrarlo) y se coloca sobre la esquina
    // superior derecha del video.
    function sincronizarBotonDeVideo() {
        // Limpiar botones de versiones anteriores, inyectados dentro del reproductor
        document.querySelectorAll('.' + CLASE_BOTON_VIDEO).forEach(b => { if (b.id !== ID_BOTON_VIDEO) b.remove(); });

        let boton = document.getElementById(ID_BOTON_VIDEO);
        const video = videoObjetivo();
        if (!video) { if (boton) boton.remove(); return; }

        if (!boton) {
            boton = crearBoton('Descargar video', {
                position: 'fixed',
                width: '44px',
                height: '44px',
                zIndex: '2147483647'
            }, b => {
                const v = videoObjetivo();
                descargarUrl(v && urlDeVideo(v), '.mp4', b);
            });
            boton.id = ID_BOTON_VIDEO;
            boton.classList.add(CLASE_BOTON_VIDEO);
            document.documentElement.appendChild(boton);
        }

        const r = (contenedorDeVideo(video) || video).getBoundingClientRect();
        const lado = 44, margen = 12;
        const top = Math.min(Math.max(r.top + margen, margen), window.innerHeight - lado - margen);
        const left = Math.min(Math.max(r.right - lado - margen, margen), window.innerWidth - lado - margen);
        boton.style.top = top + 'px';
        boton.style.left = left + 'px';
    }

    // Menú de Tampermonkey: copia un resumen de los videos de la página, por si el botón no aparece
    GM_registerMenuCommand('Diagnóstico de videos (copiar)', () => {
        const info = [...document.querySelectorAll('video')].map(v => {
            const caja = contenedorDeVideo(v);
            const r = (caja || v).getBoundingClientRect();
            const src = v.currentSrc || v.getAttribute('src') || '';
            return {
                tipoDeSrc: src.split(':')[0] || '(vacío)',
                fuentes: v.querySelectorAll('source').length,
                descargable: !!urlDeVideo(v),
                contenedor: caja ? caja.tagName + '.' + String(caja.className).slice(0, 80) : null,
                rect: [r.left, r.top, r.width, r.height].map(Math.round),
                enIframe: window.top !== window.self
            };
        });
        GM_setClipboard(JSON.stringify({ pagina: location.hostname, ventana: [innerWidth, innerHeight], videos: info }, null, 1), 'text');
        mostrarAviso(true);
    });

    // ---------------------------------------------------------------------
    // Botones
    // ---------------------------------------------------------------------

    function crearBoton(titulo, estilos, alHacerClic) {
        const boton = document.createElement('button');
        boton.className = CLASE_BOTON;
        boton.type = 'button';
        boton.title = titulo;
        boton.setAttribute('aria-label', titulo);
        Object.assign(boton.style, {
            padding: '0',
            border: 'none',
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.65)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'opacity 0.2s ease'
        }, estilos);

        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '55%');
        svg.setAttribute('height', '55%');
        svg.style.pointerEvents = 'none';
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', 'M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#fff');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(path);
        boton.appendChild(svg);

        // Evitar que el clic llegue al visor o al reproductor (cerraría el overlay o pausaría el video)
        ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach(tipo => {
            boton.addEventListener(tipo, e => {
                e.stopPropagation();
                if (tipo === 'click') { e.preventDefault(); alHacerClic(boton); }
            });
        });
        return boton;
    }

    // Botón flotante de imagen: visible solo si hay un overlay mostrando una imagen
    // (si lo que hay en el centro es un video, ese ya tiene su propio botón).
    // Se cuelga de <html> y no del overlay para que la página no lo borre al re-renderizar.
    function sincronizarBoton() {
        const existente = document.getElementById(ID_BOTON);
        const overlay = detectarOverlay();
        const mostrar = overlay && imagenDelOverlay(overlay) && !hayVideoEnElCentro(overlay);
        if (mostrar) {
            if (!existente) {
                const boton = crearBoton('Descargar imagen', {
                    position: 'fixed',
                    right: '24px',
                    bottom: '24px',
                    width: '48px',
                    height: '48px',
                    zIndex: '2147483647'
                }, descargarImagen);
                boton.id = ID_BOTON;
                document.documentElement.appendChild(boton);
            }
        } else if (existente) {
            existente.remove();
        }
        sincronizarBotonDeVideo();
    }

    let pendiente = null;
    function programarSincronizacion() {
        if (pendiente) return;
        pendiente = setTimeout(() => { pendiente = null; sincronizarBoton(); }, 150);
    }

    new MutationObserver(programarSincronizacion).observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'aria-hidden', 'src']
    });
    window.addEventListener('resize', programarSincronizacion);
    // El botón de video sigue al reproductor al desplazarse (captura: el chat tiene su propio scroll)
    let cuadroPendiente = false;
    window.addEventListener('scroll', () => {
        if (cuadroPendiente) return;
        cuadroPendiente = true;
        requestAnimationFrame(() => { cuadroPendiente = false; sincronizarBotonDeVideo(); });
    }, { capture: true, passive: true });
    // Algunos reproductores crean el <video> o le asignan el enlace al darle a reproducir
    ['play', 'loadedmetadata', 'emptied'].forEach(tipo => document.addEventListener(tipo, programarSincronizacion, true));
    programarSincronizacion();

    // ---------------------------------------------------------------------
    // Aviso en el centro de la pantalla: check verde (ok) o X roja (error)
    // ---------------------------------------------------------------------

    function mostrarAviso(ok) {
        // Quitar uno anterior si aún está visible
        const previo = document.getElementById(ID_CHECK);
        if (previo) previo.remove();

        const caja = document.createElement('div');
        caja.id = ID_CHECK;
        Object.assign(caja.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            width: '80px',
            height: '80px',
            background: ok ? '#22c55e' : '#ef4444',
            borderRadius: '16px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '2147483647',
            pointerEvents: 'none',
            opacity: '0',
            transform: 'translate(-50%, -50%) scale(0.7)',
            transition: 'opacity 0.2s ease, transform 0.2s ease'
        });

        // SVG creado con DOM (no innerHTML) para funcionar en sitios con Trusted Types
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '48');
        svg.setAttribute('height', '48');
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', ok ? 'M5 12.5l4.5 4.5L19 7.5' : 'M7 7l10 10M17 7L7 17');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#fff');
        path.setAttribute('stroke-width', '3');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(path);
        caja.appendChild(svg);

        (document.body || document.documentElement).appendChild(caja);

        // Animación de entrada
        requestAnimationFrame(() => {
            caja.style.opacity = '1';
            caja.style.transform = 'translate(-50%, -50%) scale(1)';
        });

        // Animación de salida y eliminación
        setTimeout(() => {
            caja.style.opacity = '0';
            caja.style.transform = 'translate(-50%, -50%) scale(0.7)';
            setTimeout(() => caja.remove(), 250);
        }, 900);
    }
})();