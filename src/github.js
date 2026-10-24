// Descarga los scripts de cada sitio desde GitHub (raw.githubusercontent.com)
// y guarda el código en chrome.storage.local. Devuelve un resumen por sitio.

function extraerCabecera(codigo, nombre) {
  const m = codigo.match(new RegExp(`@${nombre}\\s+([^\\r\\n]*)`));
  return m ? m[1].trim() : null;
}

export async function actualizarDesdeGithub(ajustes) {
  const { obtenerSitios, guardarSitios } = await import('./storage.js');
  const sitios = await obtenerSitios();
  const repo = (ajustes.repo || '').trim().replace(/^\/+|\/+$/g, '');
  const rama = (ajustes.rama || 'main').trim() || 'main';

  if (!repo || !/^[^/]+\/[^/]+$/.test(repo)) {
    return { ok: false, error: 'Configura el repositorio en ajustes (formato: usuario/repositorio).' };
  }

  const resultados = [];
  for (const sitio of sitios) {
    const ruta = (sitio.github || `scripts/${sitio.id}.js`).replace('{id}', sitio.id);
    const url = `https://raw.githubusercontent.com/${repo}/${rama}/${ruta.replace(/^\/+/, '')}`;
    try {
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const codigo = await resp.text();
      if (!codigo.trim()) throw new Error('Archivo vacío');
      const version = extraerCabecera(codigo, 'version');
      const cambio = codigo !== sitio.codigo;
      sitio.codigo = codigo;
      sitio.version = version || sitio.version;
      sitio.actualizado = Date.now();
      sitio.error = null;
      resultados.push({ id: sitio.id, ok: true, cambio, version });
    } catch (e) {
      sitio.error = e.message;
      resultados.push({ id: sitio.id, ok: false, error: e.message, url });
    }
  }
  await guardarSitios(sitios);
  return { ok: true, resultados };
}
