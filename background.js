import { inicializarSiHaceFalta, obtenerSitios } from './src/storage.js';
import { ejecutarScriptUsuario } from './src/inject.js';

// Clave `${tabId}:${frameId}` -> última URL inyectada, para no inyectar dos veces
const INYECTADOS = new Map();
// tabId -> { sitio, resultado, url }: último intento de inyección, para la GUI
const ESTADO_INYECCION = new Map();

function coincideHost(url, hosts) {
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }
  return hosts.some((h) => hostname === h || hostname.endsWith('.' + h));
}

async function inyectar(tabId, url) {
  const sitios = await obtenerSitios();
  const sitio = sitios.find((s) => s.enabled !== false && s.codigo && coincideHost(url, s.hosts));
  if (!sitio) {
    ESTADO_INYECCION.set(tabId, { sitio: null, resultado: 'sin-coincidencia', url });
    return;
  }
  const clave = `${tabId}:0`;
  if (INYECTADOS.get(clave) === url) return;

  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: ejecutarScriptUsuario,
      args: [sitio.codigo, sitio.id]
    });
    INYECTADOS.set(clave, url);
    ESTADO_INYECCION.set(tabId, {
      sitio: sitio.id,
      resultado: res && res.result ? String(res.result) : 'sin-resultado',
      url
    });
    if (res && res.result && String(res.result).startsWith('error:')) {
      console.warn(`[Media Downloader] ${sitio.id}:`, res.result);
    }
  } catch (e) {
    // La pestaña puede haberse cerrado o estar en página restringida (chrome://)
    ESTADO_INYECCION.set(tabId, { sitio: sitio.id, resultado: 'error: ' + e.message, url });
    console.warn('[Media Downloader] No se pudo inyectar:', e.message);
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) inyectar(tabId, tab.url);
});

// Navegaciones internas de SPAs (pushState): OnlyFans funciona así
chrome.webNavigation.onHistoryStateUpdated.addListener((detalles) => {
  if (detalles.frameId === 0) inyectar(detalles.tabId, detalles.url);
});

// Una recarga de página debe permitir inyectar de nuevo aunque la URL no cambie
chrome.webNavigation.onCommitted.addListener((detalles) => {
  if (detalles.frameId === 0) INYECTADOS.delete(`${detalles.tabId}:0`);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  INYECTADOS.delete(`${tabId}:0`);
  ESTADO_INYECCION.delete(tabId);
});

chrome.runtime.onInstalled.addListener(inicializarSiHaceFalta);
chrome.runtime.onStartup.addListener(inicializarSiHaceFalta);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.tipo === 'gm_download') {
    chrome.downloads.download(
      { url: msg.url, filename: msg.nombre, saveAs: false, conflictAction: 'uniquify' },
      (id) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ ok: true, id });
        }
      }
    );
    return true; // respuesta asíncrona
  }

  if (msg.tipo === 'estado') {
    sendResponse(ESTADO_INYECCION.get(msg.tabId) || null);
    return;
  }

  if (msg.tipo === 'reinyectar') {
    INYECTADOS.delete(`${msg.tabId}:0`);
    chrome.tabs.get(msg.tabId, (tab) => {
      if (chrome.runtime.lastError || !tab || !tab.url) return sendResponse({ ok: false });
      inyectar(tab.id, tab.url).then(() => sendResponse({ ok: true }));
    });
    return true;
  }
});
