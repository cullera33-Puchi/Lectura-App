// Anotaciones de los libros (v4): de momento, marcadores. Se guardan en local
// como un mapa por id y viajan a Drive en anotaciones.json. Una baja se marca
// con eliminado: true para que llegue al otro dispositivo.

import { leerAjuste, escribirVarios } from './almacen.js';

const CLAVE = 'anotaciones';
const PENDIENTE = { clave: 'anotaciones:todas', tipo: 'anotaciones' };

export async function todasLasAnotaciones() {
  return (await leerAjuste(CLAVE)) || {};
}

export async function anotacionesDeLibro(libroId, tipo) {
  return Object.values(await todasLasAnotaciones())
    .filter((a) => a.libroId === libroId && !a.eliminado && (!tipo || a.tipo === tipo));
}

async function guardarTodas(anotaciones, pendiente = true) {
  const fecha = new Date().toISOString();
  const operaciones = [{ almacen: 'ajustes', valor: anotaciones, clave: CLAVE }];
  if (pendiente) operaciones.push({ almacen: 'pendientes', valor: { ...PENDIENTE, fecha } });
  await escribirVarios(operaciones);
}

export function guardarAnotacionesFusionadas(anotaciones) {
  return guardarTodas(anotaciones, false);
}

export async function crearMarcador(libroId, datos) {
  const todas = await todasLasAnotaciones();
  const id = crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const marcador = { id, libroId, tipo: 'marcador', ...datos, fecha: new Date().toISOString(), eliminado: false };
  await guardarTodas({ ...todas, [id]: marcador });
  return marcador;
}

export async function eliminarAnotacion(id) {
  const todas = await todasLasAnotaciones();
  if (!todas[id]) return;
  await guardarTodas({ ...todas, [id]: { ...todas[id], eliminado: true, fecha: new Date().toISOString() } });
}
