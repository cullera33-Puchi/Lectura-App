// Pantalla del lector (punto 8 del diseño): controles, índice, panel "Aa",
// guardado de la posición y registro de sesiones.

import { abrirLibro, MENSAJE_LIBRO_ILEGIBLE } from './lector.js';
import { leerLibro, leerArchivo, leerUbicaciones, guardarUbicaciones } from '../datos/libros.js';
import { leerProgreso, guardarProgreso } from '../datos/progreso.js';
import { RegistroSesiones } from '../datos/sesiones.js';
import {
  preferencias, cambiarLectura, nombreDispositivo, alCambiarPreferencias,
} from '../datos/preferencias.js';
import {
  TEMAS, TAMANOS, FUENTES, INTERLINEADOS, MARGENES, JUSTIFICACIONES, idTemaElegido, alCambiarModoSistema,
} from '../ui/temas.js';
import { registrar } from '../ui/registro.js';

const $ = (id) => document.getElementById(id);
const MARGEN_REPAGINADO_MS = 2000;

let actual = null; // { id, motor, sesiones, progreso, ultimoCfi, repaginandoHasta }
let alCerrar = () => {};

function controlesVisibles(visibles) {
  $('barra-superior').hidden = !visibles;
  $('barra-inferior').hidden = !visibles;
}

function cerrarPaneles() {
  $('panel-indice').hidden = true;
  $('panel-aa').hidden = true;
  $('fondo-panel').hidden = true;
}

function textoProgreso(info) {
  const partes = [];
  if (info.porcentaje != null) partes.push(`${Math.round(info.porcentaje * 100)} % del libro`);
  if (info.paginasRestantesCapitulo != null) {
    const n = info.paginasRestantesCapitulo;
    partes.push(n === 0 ? 'Última página del capítulo' : `${n} ${n === 1 ? 'página' : 'páginas'} hasta el final del capítulo`);
  }
  return partes.join('. ');
}

async function alCambiarPosicion(info) {
  const a = actual; // la pantalla puede cerrarse durante una escritura
  if (!a) return;
  a.info = info;
  $('info-capitulo').textContent = info.capitulo || a.titulo;
  $('info-progreso').textContent = textoProgreso(info);
  if (!$('panel-indice').hidden) pintarIndice();

  const p = a.progreso;
  const porcentaje = info.porcentaje ?? p?.porcentaje ?? null;
  const datos = (cfi, estado) => ({
    cfi, porcentaje, capitulo: info.capitulo, estado, dispositivo: nombreDispositivo(),
  });

  // Al abrir y al repaginar por un cambio de ajustes, el punto de lectura no
  // cambia aunque el CFI de inicio de página sí lo haga. No se guarda como
  // avance, para no alterar la posición que recibirá el otro dispositivo.
  const mismaPosicion = Date.now() < a.repaginandoHasta || info.cfi === a.ultimoCfi;
  if (mismaPosicion) {
    a.ultimoCfi = info.cfi; // referencia para detectar el siguiente paso de página
    if (!p) {
      a.progreso = await guardarProgreso(a.id, datos(info.cfi, 'leyendo'));
    } else if (p.estado === 'pendiente') {
      a.progreso = await guardarProgreso(a.id, { ...p, ...datos(p.cfi || info.cfi, 'leyendo') });
    } else if (porcentaje !== p.porcentaje) {
      a.progreso = await guardarProgreso(a.id, { ...p, porcentaje }, { mantenerFecha: true });
    }
    return;
  }

  a.ultimoCfi = info.cfi;
  const estado = p?.estado === 'terminado' ? 'terminado' : 'leyendo';
  a.progreso = await guardarProgreso(a.id, datos(info.cfi, estado));
  a.sesiones.paginaPasada();
}

// --- Índice ---

function pintarIndice() {
  const lista = $('lista-indice');
  lista.replaceChildren();
  const seccionActual = actual.info?.seccion ?? -1;
  // El capítulo actual es la última entrada cuya sección no supera la actual.
  let marcado = -1;
  actual.motor.indice.forEach((e, i) => {
    if (e.seccion !== null && e.seccion <= seccionActual) marcado = i;
  });
  actual.motor.indice.forEach((entrada, i) => {
    const li = document.createElement('li');
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.textContent = entrada.etiqueta;
    boton.style.paddingLeft = `${4 + entrada.nivel * 18}px`;
    if (i === marcado) {
      boton.classList.add('actual');
      boton.setAttribute('aria-current', 'true');
    }
    boton.addEventListener('click', async () => {
      cerrarPaneles();
      controlesVisibles(false);
      await actual.motor.irA(entrada.href);
    });
    li.appendChild(boton);
    lista.appendChild(li);
  });
  if (!actual.motor.indice.length) {
    const li = document.createElement('li');
    li.textContent = 'Este libro no tiene índice.';
    lista.appendChild(li);
  }
  return marcado;
}

function abrirIndice() {
  const marcado = pintarIndice();
  $('fondo-panel').hidden = false;
  $('panel-indice').hidden = false;
  if (marcado >= 0) $('lista-indice').children[marcado]?.scrollIntoView({ block: 'center' });
}

// --- Panel "Aa" ---

function grupo(titulo, opciones, valorActual, alElegir, extra) {
  const fila = document.createElement('div');
  fila.className = 'ajuste-fila';
  const etiqueta = document.createElement('span');
  etiqueta.textContent = titulo;
  const segmentos = document.createElement('div');
  segmentos.className = 'segmentos';
  for (const o of opciones) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.textContent = o.nombre;
    boton.setAttribute('aria-pressed', String(o.id === valorActual));
    extra?.(boton, o);
    boton.addEventListener('click', () => alElegir(o.id));
    segmentos.appendChild(boton);
  }
  fila.append(etiqueta, segmentos);
  return fila;
}

function pintarPanelAa() {
  const { dispositivo, lectura } = preferencias();
  const perfil = dispositivo.perfil;
  const panel = $('panel-aa');
  panel.replaceChildren();

  const claveTema = perfil === 'tinta' ? 'temaTinta' : 'temaMovil';
  panel.appendChild(grupo('Tema', TEMAS[perfil], idTemaElegido(perfil, lectura),
    (id) => cambiarLectura({ [claveTema]: id }),
    (boton, tema) => {
      if (tema.fondo) {
        boton.classList.add('muestra-tema');
        boton.style.background = tema.fondo;
        boton.style.color = tema.texto;
      }
    }));

  const filaTamano = document.createElement('div');
  filaTamano.className = 'ajuste-fila';
  const etiquetaTamano = document.createElement('span');
  etiquetaTamano.textContent = 'Tamaño de letra';
  const controles = document.createElement('div');
  controles.className = 'tamano-letra segmentos';
  const posicion = TAMANOS.indexOf(lectura.tamano);
  const menor = document.createElement('button');
  menor.type = 'button';
  menor.innerHTML = '<span style="font-size:14px">A</span>';
  menor.setAttribute('aria-label', 'Letra más pequeña');
  menor.disabled = posicion <= 0;
  menor.addEventListener('click', () => cambiarLectura({ tamano: TAMANOS[Math.max(0, posicion - 1)] }));
  const valor = document.createElement('span');
  valor.className = 'tamano-valor';
  valor.textContent = `${lectura.tamano} %`;
  const mayor = document.createElement('button');
  mayor.type = 'button';
  mayor.innerHTML = '<span style="font-size:24px">A</span>';
  mayor.setAttribute('aria-label', 'Letra más grande');
  mayor.disabled = posicion >= TAMANOS.length - 1;
  mayor.addEventListener('click', () => cambiarLectura({ tamano: TAMANOS[Math.min(TAMANOS.length - 1, posicion + 1)] }));
  controles.append(menor, valor, mayor);
  filaTamano.append(etiquetaTamano, controles);
  panel.appendChild(filaTamano);

  panel.appendChild(grupo('Fuente', FUENTES, lectura.fuente, (id) => cambiarLectura({ fuente: id }),
    (boton, f) => { if (f.familia) boton.style.fontFamily = f.familia; }));
  panel.appendChild(grupo('Interlineado', INTERLINEADOS, lectura.interlineado, (id) => cambiarLectura({ interlineado: id })));
  panel.appendChild(grupo('Márgenes', MARGENES, lectura.margenes, (id) => cambiarLectura({ margenes: id })));
  panel.appendChild(grupo('Justificación', JUSTIFICACIONES, lectura.justificacion, (id) => cambiarLectura({ justificacion: id })));
}

function abrirPanelAa() {
  pintarPanelAa();
  $('fondo-panel').hidden = false;
  $('panel-aa').hidden = false;
}

function aplicarPreferencias() {
  if (!actual) return;
  const { dispositivo, lectura } = preferencias();
  actual.repaginandoHasta = Date.now() + MARGEN_REPAGINADO_MS;
  actual.motor.aplicarAjustes(dispositivo.perfil, lectura);
  if (!$('panel-aa').hidden) pintarPanelAa();
}

// --- Abrir y cerrar ---

export async function abrirPantallaLector(id) {
  if (actual) await cerrarPantallaLector();
  const [libro, datos, progreso, ubicaciones] = await Promise.all([
    leerLibro(id), leerArchivo(id), leerProgreso(id), leerUbicaciones(id),
  ]);
  if (!libro || !datos) throw new Error('El archivo de este libro no está en el dispositivo.');

  document.body.classList.add('leyendo');
  $('lector').hidden = false;
  controlesVisibles(false);
  cerrarPaneles();
  $('titulo-libro').textContent = libro.titulo;
  $('info-capitulo').textContent = libro.titulo;
  $('info-progreso').textContent = '';

  const sesiones = new RegistroSesiones(id, nombreDispositivo());
  actual = {
    id,
    titulo: libro.titulo,
    motor: null,
    sesiones,
    progreso: progreso || null,
    ultimoCfi: progreso?.cfi || null,
    repaginandoHasta: Infinity, // hasta que termine la apertura
    info: null,
  };
  const { dispositivo, lectura } = preferencias();
  try {
    actual.motor = await abrirLibro($('visor'), datos, {
      perfil: dispositivo.perfil,
      ajustes: lectura,
      cfiInicial: progreso?.cfi || null,
      ubicaciones: ubicaciones || null,
      avisos: {
        alCambiarPosicion,
        alTocarCentro: () => {
          if (!$('panel-aa').hidden || !$('panel-indice').hidden) cerrarPaneles();
          else controlesVisibles($('barra-superior').hidden);
        },
        alDeslizarAbajo: () => alCerrar(),
        alGenerarUbicaciones: (json) => guardarUbicaciones(id, json),
      },
    });
  } catch (e) {
    actual = null;
    $('visor').replaceChildren();
    $('lector').hidden = true;
    document.body.classList.remove('leyendo');
    throw new Error(e.message || MENSAJE_LIBRO_ILEGIBLE);
  }
  actual.repaginandoHasta = Date.now() + 500;
  sesiones.iniciar();
}

export async function cerrarPantallaLector() {
  if (!actual) return;
  const cerrado = actual;
  actual = null;
  cerrarPaneles();
  cerrado.motor?.destruir();
  $('visor').replaceChildren();
  $('lector').hidden = true;
  document.body.classList.remove('leyendo');
  await cerrado.sesiones.cerrar();
  registrar(`Libro cerrado: "${cerrado.titulo}"`);
}

export function lectorAbierto() {
  return Boolean(actual);
}

export function prepararPantallaLector({ cerrar }) {
  alCerrar = cerrar;
  $('btn-cerrar-libro').addEventListener('click', () => alCerrar());
  $('btn-indice').addEventListener('click', abrirIndice);
  $('btn-cerrar-indice').addEventListener('click', cerrarPaneles);
  $('btn-aa').addEventListener('click', abrirPanelAa);
  $('fondo-panel').addEventListener('click', cerrarPaneles);
  alCambiarPreferencias((_, tipo) => {
    if (tipo === 'lectura') aplicarPreferencias();
  });
  alCambiarModoSistema(() => {
    if (preferencias().lectura.temaMovil === 'automatico') aplicarPreferencias();
  });
}
