// Posición de lectura local. Siempre como CFI, nunca como número de página.

import { leer, leerTodos, escribirVarios } from './almacen.js';
import { leerSincronizacion } from './pendientes.js';
import { nombreDispositivo, idDispositivo } from './preferencias.js';

export function leerProgreso(id) {
  return leer('progreso', id);
}

export function listarProgresos() {
  return leerTodos('progreso');
}

// Guarda la posición y la marca como pendiente de sincronizar.
// - mantenerFecha: se completan datos (por ejemplo, el porcentaje) sin que
//   cuente como un avance más reciente.
// - provisional: posición sin fecha (abrir un libro sin pasar página). La
//   fusión ignora las entradas sin fecha, así no pisa la posición del otro
//   dispositivo.
export async function guardarProgreso(id, datos, { mantenerFecha = false, provisional = false } = {}) {
  let fecha = new Date().toISOString();
  if (provisional) fecha = null;
  else if (mantenerFecha && datos.fecha) fecha = datos.fecha;
  const registro = { ...datos, id, fecha };
  const operaciones = [{ almacen: 'progreso', valor: registro }];
  if (fecha) operaciones.push({ almacen: 'pendientes', valor: { clave: `progreso:${id}`, tipo: 'progreso', id, fecha } });
  await escribirVarios(operaciones);
  return registro;
}

// La entrada más reciente entre la local y la última copia sincronizada.
export async function progresoMasReciente(id) {
  const [local, copia] = await Promise.all([leerProgreso(id), leerSincronizacion('progresoRemoto')]);
  const remota = copia?.progreso?.[id];
  if (remota && (remota.fecha || '') > (local?.fecha || '')) return { ...remota, id };
  return local || null;
}

// Cambia solo el estado, conservando la posición más reciente conocida.
export async function cambiarEstado(id, estado) {
  const base = (await progresoMasReciente(id)) || { cfi: null, porcentaje: null, capitulo: null };
  return guardarProgreso(id, { ...base, estado, dispositivo: nombreDispositivo(), dispositivoId: idDispositivo() });
}
