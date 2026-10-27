// Ritmo de lectura (v3): con el tiempo entre pasos de página se estima lo que
// queda del capítulo y del libro. El ritmo es de este dispositivo (el tamaño de
// página no es el mismo en el iPhone que en la tablet) y no se sincroniza.

import { leerAjuste, guardarAjuste } from '../datos/almacen.js';
import { formatoDuracion } from '../estadisticas/calculo.js';

const PESO = 0.15; // media móvil exponencial
const MINIMO_MS = 1500; // menos: está pasando páginas sin leer
const MAXIMO_MS = 5 * 60 * 1000; // más: ha hecho una pausa
const MAXIMO_UBICACIONES = 4; // más: ha saltado (índice, enlace)
const MUESTRAS_MINIMAS = 8;

let ritmo = { msPorPagina: null, ubicacionesPorPagina: null, muestras: 0 };
let anterior = null; // { fecha, ubicacion }

export async function cargarRitmo() {
  ritmo = { ...ritmo, ...((await leerAjuste('ritmoLectura')) || {}) };
}

export function reiniciarReferencia() {
  anterior = null;
}

const media = (previa, valor) => (previa == null ? valor : previa + PESO * (valor - previa));

// info: posición del lector. contar: false si no es un paso de página real
// (al abrir o al repaginar); entonces solo sirve de referencia para el siguiente.
export function anotarPagina(info, { contar = true } = {}) {
  const ahora = Date.now();
  const previo = anterior;
  anterior = { fecha: ahora, ubicacion: info.ubicacion };
  if (!contar || !previo || previo.ubicacion == null || info.ubicacion == null) return;
  const ms = ahora - previo.fecha;
  const avance = info.ubicacion - previo.ubicacion;
  if (ms < MINIMO_MS || ms > MAXIMO_MS || avance < 0 || avance > MAXIMO_UBICACIONES) return;
  ritmo = {
    msPorPagina: media(ritmo.msPorPagina, ms),
    ubicacionesPorPagina: media(ritmo.ubicacionesPorPagina, avance),
    muestras: ritmo.muestras + 1,
  };
  guardarAjuste('ritmoLectura', ritmo).catch(() => {});
}

function duracion(ms) {
  return ms < 60000 ? 'menos de 1 min' : formatoDuracion(ms);
}

// Tiempo estimado que falta, en texto, o null si aún no hay datos suficientes.
export function tiempoRestante(info) {
  if (ritmo.muestras < MUESTRAS_MINIMAS || !ritmo.msPorPagina) return { capitulo: null, libro: null };
  const capitulo = info.paginasRestantesCapitulo != null
    ? duracion((info.paginasRestantesCapitulo + 1) * ritmo.msPorPagina) : null;
  let libro = null;
  if (info.ubicacion != null && info.totalUbicaciones && ritmo.ubicacionesPorPagina > 0.05) {
    const paginas = Math.max(0, info.totalUbicaciones - info.ubicacion) / ritmo.ubicacionesPorPagina;
    libro = duracion(paginas * ritmo.msPorPagina);
  }
  return { capitulo, libro };
}
