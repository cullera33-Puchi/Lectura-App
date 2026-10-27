// Cola de cambios pendientes de sincronizar y datos de la última sincronización.

import { leer, leerTodos, leerClaves, guardar, borrar, alEscribir } from './almacen.js';

const oyentes = new Set();

export function listarPendientes() {
  return leerTodos('pendientes');
}

export async function borrarPendiente(clave) {
  await borrar('pendientes', clave);
}

// Claves pendientes en el último recuento. Sirve para no recontar cuando se
// reescribe un pendiente que ya estaba (cada página pasada reescribe el de
// progreso del libro).
let clavesContadas = null;

export async function contarPendientes() {
  const claves = await leerClaves('pendientes');
  clavesContadas = new Set(claves);
  return claves.length;
}

export function pendienteYaContado(clave) {
  return Boolean(clavesContadas?.has(clave));
}

// La interfaz pinta el indicador del botón Sincronizar al recibir este aviso.
// Solo se avisa si el número ha cambiado (cada página pasada reescribe el
// mismo pendiente de progreso).
let ultimoNumero = null;

export function avisarCambioPendientes() {
  contarPendientes().then((n) => {
    if (n === ultimoNumero) return;
    ultimoNumero = n;
    oyentes.forEach((fn) => fn(n));
  });
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
