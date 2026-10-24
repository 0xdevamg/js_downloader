// Sustitutos de las APIs GM_* de Tampermonkey. Se inserta como texto ANTES del
// código de cada sitio al registrar el user script, así que es una cadena, no
// una función. Sin backticks dentro para poder construirlo por líneas.

export const CODIGO_SHIM = [
  "(function () {",
  "  if (window.__dln_shim) return;",
  "  window.__dln_shim = true;",
  "  window.GM_setClipboard = async function (texto) {",
  "    try {",
  "      await navigator.clipboard.writeText(texto);",
  "    } catch (e) {",
  "      const ta = document.createElement('textarea');",
  "      ta.value = texto;",
  "      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';",
  "      document.documentElement.appendChild(ta);",
  "      ta.select();",
  "      document.execCommand('copy');",
  "      ta.remove();",
  "    }",
  "  };",
  "  window.GM_download = function (opciones) {",
  "    chrome.runtime.sendMessage(",
  "      { tipo: 'gm_download', url: opciones.url, nombre: opciones.name },",
  "      function (resp) {",
  "        if (chrome.runtime.lastError || !resp || !resp.ok) {",
  "          if (opciones.onerror) opciones.onerror(chrome.runtime.lastError || new Error('Descarga fallida'));",
  "        } else if (opciones.onload) {",
  "          opciones.onload();",
  "        }",
  "      }",
  "    );",
  "  };",
  "  window.GM_registerMenuCommand = function () {};",
  "})();"
].join('\n');
