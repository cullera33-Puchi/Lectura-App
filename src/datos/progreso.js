// Posición de lectura local. Siempre como CFI, nunca como número de página.

import { leer, leerTodos, escribirVarios } from './almacen.js';

export function leerProgreso(id) {
  return leer('progreso', id);
}

// Guarda la posición y la marca como pendiente de sincronizar. Con
// mantenerFecha se completan datos (por ejemplo, el porcentaje) sin que cuente
// como un avance más reciente.
export async function guardarProgreso(id, datos, { mantenerFecha = false } = {}) {
  const fecha = mantenerFecha && datos.fecha ? datos.fecha : new Date().toISOString();
  const registro = { ...datos, id, fecha };
  await escribirVarios([
    { almacen: 'progreso', valor: registro },
    { almacen: 'pendientes', valor: { clave: `progreso:${id}`, tipo: 'progreso', id, fecha } },
  ]);
  return registro;
}

export async function cambiarEstado(id, estado, dispositivo) {
  const actual = (await leerProgreso(id)) || { cfi: null, porcentaje: 0, capitulo: null };
  return guardarProgreso(id, { ...actual, estado, dispositivo });
}

export function listarProgresos() {
  return leerTodos('progreso');
}
