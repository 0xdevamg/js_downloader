import { SITIOS_BASE } from './sites.js';

const CLAVE_SITIOS = 'sitios';
const CLAVE_AJUSTES = 'ajustes';

export async function obtenerSitios() {
  const { [CLAVE_SITIOS]: sitios } = await chrome.storage.local.get(CLAVE_SITIOS);
  return sitios || [];
}

export async function guardarSitios(sitios) {
  await chrome.storage.local.set({ [CLAVE_SITIOS]: sitios });
}

export async function obtenerAjustes() {
  const { [CLAVE_AJUSTES]: ajustes } = await chrome.storage.local.get(CLAVE_AJUSTES);
  return { repo: '', rama: 'main', ...ajustes };
}

export async function guardarAjustes(ajustes) {
  await chrome.storage.local.set({ [CLAVE_AJUSTES]: ajustes });
}

// Crea los sitios por defecto la primera vez que se instala la extensión.
// El código inicial se lee del archivo empaquetado (p. ej. scripts/onlyfans.js).
export async function inicializarSiHaceFalta() {
  const sitios = await obtenerSitios();
  if (sitios.length) return;
  const completos = [];
  for (const base of SITIOS_BASE) {
    let codigo = '';
    try {
      const resp = await fetch(chrome.runtime.getURL(`scripts/${base.id}.js`));
      if (resp.ok) codigo = await resp.text();
    } catch { /* sin código inicial: se podrá cargar desde GitHub */ }
    completos.push({ ...base, codigo, version: null, actualizado: null, error: null });
  }
  await guardarSitios(completos);
}
