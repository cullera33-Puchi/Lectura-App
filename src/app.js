// Arranque y navegación entre pantallas.
//
// Dos pestañas, "Leyendo ahora" y "Biblioteca", como en Libros de Apple.
// Ajustes y el lector añaden una entrada al historial, así el botón Atrás de
// Android los cierra en lugar de salir de la app.

import { cargarPreferencias, preferencias, alCambiarPreferencias } from './datos/preferencias.js';
import { leerAjuste, guardarAjuste } from './datos/almacen.js';
import { iniciarSesionGoogle } from './sync/google.js';
import {
  prepararBiblioteca, pintarBiblioteca, mostrarMensaje, librosParaMostrar, descargando,
} from './biblioteca/biblioteca.js';
import { pintarInicio, configurarInicio } from './biblioteca/inicio.js';
import { pintarEstadisticas, configurarEstadisticas } from './estadisticas/pantalla.js';
import {
  prepararPantallaLector, abrirPantallaLector, cerrarPantallaLector, lectorAbierto, cerrarPanelAbierto,
  idLibroAbierto,
} from './lector/pantalla-lector.js';
import { AperturaCancelada } from './lector/lector.js';
import { leerLibro } from './datos/libros.js';
import { sincronizando } from './sync/sincronizar.js';
import { mostrarAviso } from './ui/aviso.js';
import { prepararAjustes, pintarAjustes, pintarDiagnostico } from './ui/ajustes.js';
import { prepararCopias } from './ui/copias.js';
import { completarEdicionesPendientes } from './biblioteca/importar.js';
import { prepararFicha, fichaAbierta, cerrarFicha } from './ui/ficha.js';
import { prepararDeslizarPestanas } from './ui/deslizar-pestanas.js';
import { prepararBienvenida, mostrarBienvenida } from './ui/bienvenida.js';
import { prepararHoja, hojaAbierta, cancelarHoja } from './ui/hoja.js';
import {
  prepararSincronizacion, sincronizarAutomaticamente, alEntrarEnLaApp,
} from './ui/sincronizacion.js';
import { pintarIconos } from './ui/iconos.js';
import { aplicarTemaInterfaz, alCambiarModoSistema } from './ui/temas.js';
import { registrar } from './ui/registro.js';
import { pedirPersistencia, estaInstalada } from './ui/diagnostico.js';

const $ = (id) => document.getElementById(id);
// Tiempo fuera de la app a partir del cual volver cuenta como entrar de nuevo.
const MINUTOS_FUERA = 5;
const PANTALLAS = ['bienvenida', 'inicio', 'biblioteca', 'estadisticas', 'ajustes'];
const PESTANAS = ['inicio', 'biblioteca', 'estadisticas'];

let pestanaActual = 'inicio';
let abriendo = false; // apertura de un libro en curso
let scrollAntesDeLeer = 0;
let recargaPendiente = false;

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

// Repintado tras cualquier cambio en la biblioteca. Los datos se leen una vez
// y solo se pinta la pestaña visible; la otra se pinta al entrar en ella. Si
// llega un refresco más reciente mientras se leen los datos, este se descarta.
let numeroPintado = 0;
const pestanasPorPintar = new Set(PESTANAS);

function pestanaVisible() {
  return PESTANAS.find((p) => !$(`pantalla-${p}`).hidden) || null;
}

async function pintarPestana(nombre, libros) {
  pestanasPorPintar.delete(nombre);
  if (nombre === 'inicio') await pintarInicio(libros);
  else if (nombre === 'biblioteca') await pintarBiblioteca(libros);
  else await pintarEstadisticas();
}

async function refrescar() {
  const numero = ++numeroPintado;
  const libros = await librosParaMostrar();
  if (numero !== numeroPintado) return;
  PESTANAS.forEach((p) => pestanasPorPintar.add(p));
  const visible = pestanaVisible();
  if (visible) await pintarPestana(visible, libros);
}

async function irAPestana(nombre) {
  pestanaActual = nombre;
  mostrarPantalla(nombre);
  await guardarAjuste('pestana', nombre);
  if (pestanasPorPintar.has(nombre)) await pintarPestana(nombre);
}

function abrirAjustes() {
  history.pushState({ pantalla: 'ajustes' }, '');
  mostrarPantalla('ajustes');
  pintarAjustes();
}

// Vuelve atrás solo si la entrada actual es la indicada (evita salir de la app
// con dos toques seguidos en Cerrar o Atrás).
function volverDesde(pantalla) {
  if (history.state?.pantalla === pantalla) history.back();
}

async function abrirLibro(id) {
  if (abriendo) return; // doble toque en una portada
  abriendo = true;
  scrollAntesDeLeer = window.scrollY;
  history.pushState({ pantalla: 'lector' }, '');
  try {
    await abrirPantallaLector(id);
  } catch (e) {
    if (!(e instanceof AperturaCancelada)) {
      registrar(e.message, 'error');
      mostrarMensaje(e.message, true);
    }
    volverDesde('lector');
  } finally {
    abriendo = false;
  }
}

async function alCerrarLector() {
  const habiaLibro = lectorAbierto();
  await cerrarPantallaLector();
  await refrescar();
  window.scrollTo(0, scrollAntesDeLeer);
  if (habiaLibro) sincronizarAutomaticamente('al cerrar un libro');
}

// Si se sincroniza con un libro abierto y el otro dispositivo lo ha eliminado,
// se cierra el lector.
async function comprobarLibroAbierto() {
  const id = idLibroAbierto();
  if (!id) return;
  const libro = await leerLibro(id);
  if (!libro || libro.eliminado) {
    mostrarAviso('Este libro se ha eliminado de la biblioteca desde el otro dispositivo.', 6000);
    volverDesde('lector');
  }
}

// Recarga con la versión nueva solo si no hay nada en curso.
function appOciosa() {
  return !lectorAbierto() && !abriendo && !sincronizando() && !hojaAbierta() && !fichaAbierta() && descargando.size === 0
    && $('pantalla-bienvenida').hidden;
}

function recargarSiProcede() {
  if (recargaPendiente && appOciosa()) location.reload();
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

// Botón Atrás (Android): primero cierra la hoja o el panel abiertos; después,
// el lector o Ajustes.
window.addEventListener('popstate', async () => {
  const pantallaAbierta = lectorAbierto() ? 'lector' : (!$('pantalla-ajustes').hidden ? 'ajustes' : null);
  if (hojaAbierta()) {
    cancelarHoja();
    if (abriendo) {
      await cerrarPantallaLector(); // cancela la apertura en curso
    } else if (pantallaAbierta) {
      history.pushState({ pantalla: pantallaAbierta }, '');
    }
    return;
  }
  if (fichaAbierta()) {
    cerrarFicha();
    if (pantallaAbierta) history.pushState({ pantalla: pantallaAbierta }, '');
    return;
  }
  if (lectorAbierto() && cerrarPanelAbierto()) {
    history.pushState({ pantalla: 'lector' }, '');
    return;
  }
  if (lectorAbierto() || abriendo) {
    await alCerrarLector();
  } else if (!$('pantalla-ajustes').hidden) {
    mostrarPantalla(pestanaActual);
    if (pestanasPorPintar.has(pestanaActual)) await pintarPestana(pestanaActual);
  }
});

async function iniciar() {
  registrar(`Inicio. ${estaInstalada() ? 'App instalada (standalone)' : 'En pestaña del navegador'}`);
  pintarIconos();
  await cargarPreferencias();
  // Si la app ya estaba configurada al abrirla, al terminar de arrancar se
  // sincroniza o se pide conectar. En el primer arranque no: la bienvenida ya
  // ofrece conectar, y el aviso aparecería por sorpresa a mitad de ella.
  const configuradaAlAbrir = preferencias().dispositivo.bienvenidaCompleta;
  aplicarTema();

  prepararHoja();
  prepararFicha();
  prepararAjustes();
  prepararCopias({ restaurado: refrescar });
  prepararBienvenida({ terminado: () => irAPestana('inicio') });
  await prepararBiblioteca({ abrirLibro, refrescar });
  prepararPantallaLector({ cerrar: () => volverDesde('lector') });
  prepararSincronizacion({
    terminado: async () => {
      await refrescar();
      await comprobarLibroAbierto();
    },
  });
  document.querySelectorAll('.boton-ajustes').forEach((b) => b.addEventListener('click', abrirAjustes));
  $('btn-volver-ajustes').addEventListener('click', () => volverDesde('ajustes'));
  document.querySelectorAll('.pestana').forEach((b) => {
    b.addEventListener('click', () => irAPestana(b.dataset.pestana));
  });
  prepararTitulosGrandes();
  prepararDeslizarPestanas({
    pestanas: PESTANAS,
    actual: pestanaVisible,
    ir: (nombre) => irAPestana(nombre),
    permitido: () => !lectorAbierto() && !abriendo && !hojaAbierta() && !fichaAbierta(),
  });
  configurarInicio({ verEstadisticas: () => irAPestana('estadisticas') });
  configurarEstadisticas({ alCambiar: refrescar });

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
      recargaPendiente = true;
      recargarSiProcede();
    });
    // Si había algo en curso, se recarga cuando la app pasa a segundo plano.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') recargarSiProcede();
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then((r) => r?.update())
      .catch((e) => registrar(`Service worker no registrado: ${e.message}`, 'error'));
  }

  await iniciarSesionGoogle();
  pintarDiagnostico();
  // Datos de la edición de los libros importados antes de la 0.6.1.
  setTimeout(() => completarEdicionesPendientes().catch((e) => registrar(`Datos de la edición: ${e.message}`, 'error')), 8000);

  // Al abrir la app y al volver a ella tras un rato (en el iPhone la app
  // instalada rara vez se cierra del todo): sincroniza o pide conectar.
  if (configuradaAlAbrir) alEntrarEnLaApp('al abrir la app');
  let ocultaDesde = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      ocultaDesde = Date.now();
      return;
    }
    const minutosFuera = ocultaDesde ? (Date.now() - ocultaDesde) / 60000 : 0;
    if (minutosFuera >= MINUTOS_FUERA && !lectorAbierto() && $('pantalla-bienvenida').hidden) {
      alEntrarEnLaApp('al volver a la app');
    }
  });
}

iniciar().catch((e) => {
  registrar(`Error al iniciar: ${e.message}`, 'error');
  mostrarAviso(`No se ha podido iniciar la app: ${e.message}\nCierra la app y vuelve a abrirla.`, 600000);
});
