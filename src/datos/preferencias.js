// Preferencias del dispositivo (perfil y nombre) y ajustes de lectura.
// Son por dispositivo y no se sincronizan.

import { leerAjuste, guardarAjuste } from './almacen.js';
import { ajustesLecturaIniciales } from '../ui/temas.js';

export const NOMBRE_PROPUESTO = { movil: 'iPhone', tinta: 'Note Air 4C' };

const estado = {
  dispositivo: null, // { perfil, dispositivo, nombreEditado, bienvenidaCompleta }
  lectura: null,
};
const oyentes = new Set();

export async function cargarPreferencias() {
  const dispositivo = await leerAjuste('dispositivo');
  const perfilPropuesto = /Android/.test(navigator.userAgent) ? 'tinta' : 'movil';
  estado.dispositivo = {
    perfil: perfilPropuesto,
    dispositivo: NOMBRE_PROPUESTO[perfilPropuesto],
    nombreEditado: false,
    bienvenidaCompleta: false,
    ...(dispositivo || {}),
  };
  estado.lectura = { ...ajustesLecturaIniciales(), ...((await leerAjuste('lectura')) || {}) };
  return preferencias();
}

export function preferencias() {
  return { dispositivo: { ...estado.dispositivo }, lectura: { ...estado.lectura } };
}

export function perfilActual() {
  return estado.dispositivo.perfil;
}

export function nombreDispositivo() {
  return estado.dispositivo.dispositivo;
}

function avisar(tipo) {
  const actuales = preferencias();
  oyentes.forEach((fn) => fn(actuales, tipo));
}

export function alCambiarPreferencias(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

export async function cambiarDispositivo(cambios) {
  const nuevo = { ...estado.dispositivo, ...cambios };
  if (cambios.perfil && !nuevo.nombreEditado && !('dispositivo' in cambios)) {
    nuevo.dispositivo = NOMBRE_PROPUESTO[cambios.perfil];
  }
  estado.dispositivo = nuevo;
  await guardarAjuste('dispositivo', nuevo);
  avisar('dispositivo');
}

export async function cambiarLectura(cambios) {
  estado.lectura = { ...estado.lectura, ...cambios };
  await guardarAjuste('lectura', estado.lectura);
  avisar('lectura');
}
