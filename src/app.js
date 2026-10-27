// Arranque y navegación entre pantallas.
//
// Dos pestañas, "Leyendo ahora" y "Biblioteca", como en Libros de Apple.
// Ajustes y el lector añaden una entrada al historial, así el botón Atrás de
// Android los cierra en lugar de salir de la app.

import { cargarPreferencias, preferencias, alCambiarPreferencias } from './datos/preferencias.js';
import { leerAjuste, guardarAjuste } from './datos/almacen.js';
import { iniciarSesionGoogle } from './sync/google.js';
import { prepararBiblioteca, pintarBiblioteca, mostrarMensaje } from './biblioteca/biblioteca.js';
import { pintarInicio } from './biblioteca/inicio.js';
import {
  prepararPantallaLector, abrirPantallaLector, cerrarPantallaLector, lectorAbierto,
} from './lector/pantalla-lector.js';
import { prepararAjustes, pintarAjustes, pintarDiagnostico } from './ui/ajustes.js';
import { prepararBienvenida, mostrarBienvenida } from './ui/bienvenida.js';
import { prepararHoja } from './ui/hoja.js';
import { prepararSincronizacion } from './ui/sincronizacion.js';
import { pintarIconos } from './ui/iconos.js';
import { aplicarTemaInterfaz, alCambiarModoSistema } from './ui/temas.js';
import { registrar } from './ui/registro.js';
import { pedirPersistencia, estaInstalada } from './ui/diagnostico.js';

const $ = (id) => document.getElementById(id);
const PANTALLAS = ['bienvenida', 'inicio', 'biblioteca', 'ajustes'];
const PESTANAS = ['inicio', 'biblioteca'];

let pestanaActual = 'inicio';

function mostrarPantalla(nombre) {
  for (const p of PANTALLAS) $(`pantalla-${p}`).hidden = p !== nombre;
  $('barra-pestanas').hidden = !PESTANAS.includes(nombre);
  document.querySelectorAll('.pestana').forEach((b) => {
    const activa = b.dataset.pestana === nombre;
    b.classList.toggle('activa', activa);
    b.setAttribute('aria-current', activa ? 'page' : 'false');
  });
  window.scrollTo(0, 0);
}

function aplicarTema() {
  const { dispositivo, lectura } = preferencias();
  aplicarTemaInterfaz(dispositivo.perfil, lectura);
}

// Repinta las dos pestañas tras cualquier cambio en la biblioteca.
async function refrescar() {
  await Promise.all([pintarBiblioteca(), pintarInicio()]);
}

async function irAPestana(nombre) {
  pestanaActual = nombre;
  mostrarPantalla(nombre);
  await guardarAjuste('pestana', nombre);
  await refrescar();
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
    mostrarMensaje(e.message, true);
  }
}

// Título grande que se reduce al desplazar, como en iOS: cuando el título
// grande sale de la vista, la barra muestra el título pequeño y se vuelve
// translúcida.
function prepararTitulosGrandes() {
  for (const pantalla of document.querySelectorAll('.pantalla')) {
    const titulo = pantalla.querySelector('.titulo-grande');
    const barra = pantalla.querySelector('.barra-nav');
    if (!titulo || !barra) continue;
    new IntersectionObserver(([entrada]) => {
      barra.classList.toggle('compacta', !entrada.isIntersecting);
    }, { rootMargin: '-60px 0px 0px 0px' }).observe(titulo);
  }
}

// Errores no previstos al registro, visible en Ajustes.
window.addEventListener('error', (e) => registrar(`Error: ${e.message} (${e.filename?.split('/').pop()}:${e.lineno})`, 'error'));
window.addEventListener('unhandledrejection', (e) => registrar(`Error: ${e.reason?.message || e.reason}`, 'error'));

window.addEventListener('popstate', async () => {
  if (lectorAbierto()) {
    await cerrarPantallaLector();
    await refrescar();
  } else if (!$('pantalla-ajustes').hidden) {
    mostrarPantalla(pestanaActual);
    await refrescar();
  }
});

async function iniciar() {
  registrar(`Inicio. ${estaInstalada() ? 'App instalada (standalone)' : 'En pestaña del navegador'}`);
  pintarIconos();
  await cargarPreferencias();
  aplicarTema();

  prepararHoja();
  prepararAjustes();
  prepararBienvenida({ terminado: () => irAPestana('inicio') });
  await prepararBiblioteca({ abrirLibro, refrescar });
  prepararPantallaLector({ cerrar: () => history.back() });
  prepararSincronizacion({ terminado: refrescar });
  document.querySelectorAll('.boton-ajustes').forEach((b) => b.addEventListener('click', abrirAjustes));
  $('btn-volver-ajustes').addEventListener('click', () => history.back());
  document.querySelectorAll('.pestana').forEach((b) => {
    b.addEventListener('click', () => irAPestana(b.dataset.pestana));
  });
  prepararTitulosGrandes();

  alCambiarPreferencias((_, tipo) => {
    aplicarTema();
    if (tipo === 'dispositivo') refrescar();
  });
  alCambiarModoSistema(aplicarTema);

  if (preferencias().dispositivo.bienvenidaCompleta) {
    const guardada = await leerAjuste('pestana');
    await irAPestana(PESTANAS.includes(guardada) ? guardada : 'inicio');
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
