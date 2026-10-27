// Arranque y navegación entre pantallas.
//
// Ajustes y el lector añaden una entrada al historial, así el botón Atrás de
// Android los cierra en lugar de salir de la app.

import { cargarPreferencias, preferencias, alCambiarPreferencias } from './datos/preferencias.js';
import { iniciarSesionGoogle } from './sync/google.js';
import { prepararBiblioteca, pintarBiblioteca, mostrarMensaje } from './biblioteca/biblioteca.js';
import {
  prepararPantallaLector, abrirPantallaLector, cerrarPantallaLector, lectorAbierto,
} from './lector/pantalla-lector.js';
import { prepararAjustes, pintarAjustes, pintarDiagnostico } from './ui/ajustes.js';
import { prepararBienvenida, mostrarBienvenida } from './ui/bienvenida.js';
import { prepararHoja } from './ui/hoja.js';
import { prepararSincronizacion } from './ui/sincronizacion.js';
import { aplicarTemaInterfaz, alCambiarModoSistema } from './ui/temas.js';
import { registrar } from './ui/registro.js';
import { pedirPersistencia, estaInstalada } from './ui/diagnostico.js';

const $ = (id) => document.getElementById(id);
const PANTALLAS = ['bienvenida', 'biblioteca', 'ajustes'];

function mostrarPantalla(nombre) {
  for (const p of PANTALLAS) $(`pantalla-${p}`).hidden = p !== nombre;
  window.scrollTo(0, 0);
}

function aplicarTema() {
  const { dispositivo, lectura } = preferencias();
  aplicarTemaInterfaz(dispositivo.perfil, lectura);
}

async function irABiblioteca() {
  mostrarPantalla('biblioteca');
  await pintarBiblioteca();
}

function abrirAjustes() {
  history.pushState({ pantalla: 'ajustes' }, '');
  mostrarPantalla('ajustes');
  pintarAjustes();
}

async function abrirLibro(id) {
  history.pushState({ pantalla: 'lector' }, '');
  try {
    await abrirPantallaLector(id);
  } catch (e) {
    registrar(e.message, 'error');
    history.back();
    const caja = $('mensaje-biblioteca');
    caja.textContent = e.message;
    caja.classList.add('error');
  }
}

// Errores no previstos al registro, visible en Ajustes.
window.addEventListener('error', (e) => registrar(`Error: ${e.message} (${e.filename?.split('/').pop()}:${e.lineno})`, 'error'));
window.addEventListener('unhandledrejection', (e) => registrar(`Error: ${e.reason?.message || e.reason}`, 'error'));

window.addEventListener('popstate', async () => {
  if (lectorAbierto()) {
    await cerrarPantallaLector();
    await pintarBiblioteca();
  } else if (!$('pantalla-ajustes').hidden) {
    await irABiblioteca();
  }
});

async function iniciar() {
  registrar(`Inicio. ${estaInstalada() ? 'App instalada (standalone)' : 'En pestaña del navegador'}`);
  await cargarPreferencias();
  aplicarTema();

  prepararHoja();
  prepararAjustes();
  prepararBienvenida({ terminado: irABiblioteca });
  await prepararBiblioteca({ abrirLibro });
  prepararPantallaLector({ cerrar: () => history.back() });
  prepararSincronizacion({
    terminado: async () => {
      mostrarMensaje('');
      if (!$('pantalla-biblioteca').hidden) await pintarBiblioteca();
    },
  });
  $('btn-ajustes').addEventListener('click', abrirAjustes);
  $('btn-volver-ajustes').addEventListener('click', () => history.back());

  alCambiarPreferencias((_, tipo) => {
    aplicarTema();
    if (tipo === 'dispositivo' && !$('pantalla-biblioteca').hidden) pintarBiblioteca();
  });
  alCambiarModoSistema(aplicarTema);

  if (preferencias().dispositivo.bienvenidaCompleta) {
    await irABiblioteca();
  } else {
    mostrarPantalla('bienvenida');
    mostrarBienvenida();
  }

  const persistencia = await pedirPersistencia();
  registrar(`navigator.storage.persist(): ${persistencia}`);

  if ('serviceWorker' in navigator) {
    // Si ya había una versión instalada y se activa otra, se recarga para usar
    // el código nuevo. Si se está leyendo, se espera a la próxima apertura.
    const habiaVersion = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!habiaVersion) return;
      registrar('Versión nueva de la app disponible');
      if (!lectorAbierto()) location.reload();
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then((r) => r?.update())
      .catch((e) => registrar(`Service worker no registrado: ${e.message}`, 'error'));
  }

  await iniciarSesionGoogle();
  pintarDiagnostico();
}

iniciar().catch((e) => registrar(`Error al iniciar: ${e.message}`, 'error'));
