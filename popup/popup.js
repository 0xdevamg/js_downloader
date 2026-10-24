import { obtenerSitios, guardarSitios, obtenerAjustes, guardarAjustes } from '../src/storage.js';
import { actualizarDesdeGithub } from '../src/github.js';

const $ = (sel) => document.querySelector(sel);

function haceCuanto(ts) {
  if (!ts) return 'nunca';
  const seg = Math.floor((Date.now() - ts) / 1000);
  if (seg < 60) return 'hace un momento';
  const min = Math.floor(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} d`;
}

async function pestañaActiva() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Muestra si el script se inyectó en la pestaña activa del navegador
async function mostrarEstadoPestaña() {
  const el = $('#estado-tab');
  const tab = await pestañaActiva();
  if (!tab || !tab.url || !/^https?:/.test(tab.url)) {
    el.hidden = true;
    return;
  }
  const estado = await chrome.runtime.sendMessage({ tipo: 'estado', tabId: tab.id });
  el.hidden = false;
  el.className = 'pista';
  if (!estado) {
    el.textContent = 'Esta pestaña: el script aún no se ha inyectado (recarga la página).';
  } else if (estado.resultado === 'sin-coincidencia') {
    el.textContent = 'Esta pestaña: la URL no pertenece a ningún sitio activado.';
  } else if (estado.resultado === 'ok' || estado.resultado === 'ya-inyectado') {
    el.textContent = `Esta pestaña: script inyectado ✓ (recuerda: el botón solo aparece en el visor de imágenes o con video de enlace directo).`;
    el.classList.add('ok');
  } else {
    el.textContent = `Esta pestaña: error al inyectar — ${estado.resultado}`;
    el.classList.add('error');
  }
}

function dibujarSitios(sitios) {
  const lista = $('#lista-sitios');
  lista.textContent = '';
  if (!sitios.length) {
    const vacio = document.createElement('div');
    vacio.className = 'vacio';
    vacio.textContent = 'No hay sitios configurados.';
    lista.appendChild(vacio);
    return;
  }
  for (const sitio of sitios) {
    const fila = document.createElement('div');
    fila.className = 'sitio';

    const icono = document.createElement('div');
    icono.className = 'icono-sitio';
    icono.style.background = sitio.color || '#555';
    icono.textContent = sitio.letra || sitio.nombre[0].toUpperCase();

    const datos = document.createElement('div');
    datos.className = 'datos-sitio';
    const nombre = document.createElement('div');
    nombre.className = 'nombre';
    nombre.textContent = sitio.nombre;
    const detalle = document.createElement('div');
    detalle.className = 'detalle';
    if (sitio.error) {
      detalle.classList.add('error');
      detalle.textContent = `Error al actualizar: ${sitio.error}`;
    } else {
      const version = sitio.version ? `v${sitio.version}` : 'sin versión';
      detalle.textContent = `${sitio.hosts.join(', ')} · ${version} · ${haceCuanto(sitio.actualizado)}`;
    }
    datos.append(nombre, detalle);

    const interruptor = document.createElement('label');
    interruptor.className = 'switch';
    const casilla = document.createElement('input');
    casilla.type = 'checkbox';
    casilla.checked = sitio.enabled !== false;
    casilla.addEventListener('change', async () => {
      sitio.enabled = casilla.checked;
      await guardarSitios(sitios);
      const tab = await pestañaActiva();
      if (tab) chrome.runtime.sendMessage({ tipo: 'reinyectar', tabId: tab.id });
      mostrarEstadoPestaña();
    });
    const pista = document.createElement('span');
    pista.className = 'pista-switch';
    interruptor.append(casilla, pista);

    fila.append(icono, datos, interruptor);
    lista.appendChild(fila);
  }
}

async function cargar() {
  dibujarSitios(await obtenerSitios());
  const ajustes = await obtenerAjustes();
  $('#in-repo').value = ajustes.repo || '';
  $('#in-rama').value = ajustes.rama || 'main';
}

$('#btn-ajustes').addEventListener('click', () => {
  const panel = $('#panel-ajustes');
  panel.hidden = !panel.hidden;
});

for (const [id, clave] of [['#in-repo', 'repo'], ['#in-rama', 'rama']]) {
  $(id).addEventListener('change', async (e) => {
    const ajustes = await obtenerAjustes();
    ajustes[clave] = e.target.value.trim();
    await guardarAjustes(ajustes);
  });
}

$('#btn-actualizar').addEventListener('click', async () => {
  const boton = $('#btn-actualizar');
  const texto = $('#btn-actualizar-texto');
  const estado = $('#estado-sync');
  boton.disabled = true;
  boton.classList.add('cargando');
  texto.textContent = 'Actualizando…';
  estado.textContent = '';
  estado.className = 'pista';

  const ajustes = await obtenerAjustes();
  const resultado = await actualizarDesdeGithub(ajustes);

  boton.disabled = false;
  boton.classList.remove('cargando');
  texto.textContent = 'Actualizar desde GitHub';

  if (!resultado.ok) {
    estado.textContent = resultado.error;
    estado.classList.add('error');
  } else {
    const fallidos = resultado.resultados.filter((r) => !r.ok);
    const cambiados = resultado.resultados.filter((r) => r.ok && r.cambio);
    if (fallidos.length) {
      estado.textContent = `${fallidos.length} sitio(s) con error: ${fallidos.map((f) => f.id).join(', ')}`;
      estado.classList.add('error');
    } else if (cambiados.length) {
      estado.textContent = `Actualizado: ${cambiados.map((c) => c.id).join(', ')}`;
      estado.classList.add('ok');
    } else {
      estado.textContent = 'Todo al día';
      estado.classList.add('ok');
    }
  }

  await cargar();
  const tab = await pestañaActiva();
  if (tab) chrome.runtime.sendMessage({ tipo: 'reinyectar', tabId: tab.id });
  mostrarEstadoPestaña();
});

cargar().then(mostrarEstadoPestaña);
