// Cola de cambios pendientes de sincronizar y datos de la última sincronización.

import { leer, leerTodos, guardar, borrar, alEscribir } from './almacen.js';

const oyentes = new Set();

export function listarPendientes() {
  return leerTodos('pendientes');
}

export async function borrarPendiente(clave) {
  await borrar('pendientes', clave);
}

export async function contarPendientes() {
  return (await listarPendientes()).length;
}

// La interfaz pinta el indicador del botón Sincronizar al recibir este aviso.
export function avisarCambioPendientes() {
  contarPendientes().then((n) => oyentes.forEach((fn) => fn(n)));
}

export function alCambiarPendientes(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

alEscribir((almacenes) => {
  if (almacenes.includes('pendientes') && oyentes.size) avisarCambioPendientes();
});

export function leerSincronizacion(clave) {
  return leer('sincronizacion', clave);
}

export function guardarSincronizacion(clave, valor) {
  return guardar('sincronizacion', valor, clave);
}
