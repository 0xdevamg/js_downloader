import { inicializarSiHaceFalta, obtenerSitios } from './src/storage.js';
import { CODIGO_SHIM } from './src/shim.js';

// tabId -> { sitio, resultado, url }: último aviso del shim, para la GUI
const ESTADO_INYECCION = new Map();

// Los user scripts se registran una vez y el navegador los inyecta solo en
// cada carga de página que coincida (como Tampermonkey). Sincronizar el
// registro con lo que hay guardado en storage.
async function sincronizarRegistros() {
  try {
    if (!chrome.userScripts) {
      throw new Error('La API userScripts no está disponible: activa «Permitir scripts de usuario» y recarga la extensión (⟳).');
    }
    // Permite que el código inyectado use chrome.runtime.sendMessage (GM_download)
    await chrome.userScripts.configureWorld({ messaging: true });

    const sitios = await obtenerSitios();
    const actuales = await chrome.userScripts.getScripts({});
    const porId = new Map(actuales.map((s) => [s.id, s]));
    const deseados = [];

    for (const sitio of sitios) {
      if (sitio.enabled === false || !sitio.codigo) continue;
      deseados.push({
        id: sitio.id,
        matches: sitio.hosts.map((h) => `*://*.${h}/*`),
        js: [{ code: CODIGO_SHIM }, { code: codigoDeSitio(sitio) }],
        world: 'USER_SCRIPT',
        runAt: 'document_idle',
        persistAcrossSessions: true
      });
    }

    const deseadosIds = new Set(deseados.map((d) => d.id));
    const obsoletos = actuales.map((s) => s.id).filter((id) => !deseadosIds.has(id));
    if (obsoletos.length) await chrome.userScripts.unregister(obsoletos);

    for (const script of deseados) {
      if (porId.has(script.id)) {
        await chrome.userScripts.update([script]);
      } else {
        await chrome.userScripts.register([script]);
      }
    }
    await chrome.storage.local.set({ falta_permiso: false });
    await chrome.storage.local.remove('error_permiso');
  } catch (e) {
    // Casi siempre: el interruptor "Permitir scripts de usuario" está apagado
    await chrome.storage.local.set({ falta_permiso: true, error_permiso: String(e && e.message || e) });
    console.warn('[Media Downloader] No se pudieron registrar los user scripts:', e.message);
  }
}

// El código del sitio va incrustado tal cual (sin eval): el navegador ejecuta
// el archivo del user script directamente. El try/catch reporta el resultado
// a la GUI. Como el código es JS válido, las llaves quedan balanceadas.
function codigoDeSitio(sitio) {
  const id = JSON.stringify(sitio.id);
  return [
    'try {',
    sitio.codigo,
    '  chrome.runtime.sendMessage({ tipo: \'inyectado\', sitio: ' + id + ', resultado: \'ok\' });',
    '} catch (e) {',
    '  chrome.runtime.sendMessage({ tipo: \'inyectado\', sitio: ' + id + ', resultado: \'error: \' + (e && e.message ? e.message : String(e)) });',
    '}'
  ].join('\n');
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.tipo === 'inyectado') {
    if (sender.tab) {
      ESTADO_INYECCION.set(sender.tab.id, { sitio: msg.sitio, resultado: msg.resultado, url: sender.tab.url });
    }
    return;
  }

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

  if (msg.tipo === 'sincronizar') {
    sincronizarRegistros().then(() => sendResponse({ ok: true }));
    return true; // respuesta asíncrona
  }

  if (msg.tipo === 'estado') {
    sendResponse(ESTADO_INYECCION.get(msg.tabId) || null);
    return;
  }
});

// Cualquier cambio en los sitios (interruptor, actualización desde GitHub)
// resincroniza el registro de user scripts
chrome.storage.onChanged.addListener((cambios, area) => {
  if (area === 'local' && cambios.sitios) sincronizarRegistros();
});

chrome.runtime.onInstalled.addListener(() => inicializarSiHaceFalta().then(sincronizarRegistros));
chrome.runtime.onStartup.addListener(() => inicializarSiHaceFalta().then(sincronizarRegistros));

chrome.tabs.onRemoved.addListener((tabId) => {
  ESTADO_INYECCION.delete(tabId);
});
