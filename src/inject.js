// Esta función se serializa y se ejecuta dentro de la página (mundo aislado).
// Debe ser completamente autocontenida: no puede referenciar importaciones.
//
// Monta sustitutos de las APIs GM_* de Tampermonkey y después ejecuta el
// código del sitio tal cual, sin necesidad de adaptarlo.

export function ejecutarScriptUsuario(codigo, idSitio) {
  const marca = '__dln_' + idSitio;
  if (window[marca]) return 'ya-inyectado';
  window[marca] = true;

  // GM_setClipboard: portapapeles con respaldo en execCommand
  window.GM_setClipboard = async (texto) => {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.documentElement.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  };

  // GM_download: pide al service worker que descargue con chrome.downloads
  window.GM_download = (opciones) => {
    chrome.runtime.sendMessage(
      { tipo: 'gm_download', url: opciones.url, nombre: opciones.name },
      (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.ok) {
          opciones.onerror && opciones.onerror(chrome.runtime.lastError || new Error('Descarga fallida'));
        } else {
          opciones.onload && opciones.onload();
        }
      }
    );
  };

  // GM_registerMenuCommand: sin equivalente en la GUI propia; se ignora
  window.GM_registerMenuCommand = () => {};

  try {
    new Function(codigo)();
    return 'ok';
  } catch (e) {
    window[marca] = false;
    return 'error: ' + (e && e.message ? e.message : String(e));
  }
}
