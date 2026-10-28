// Lista "Quiero leer" (punto 6): los próximos libros, en el orden que elija
// el usuario. Viaja en biblioteca.json (campo quieroLeer) y se fusiona libro a
// libro (ver fusionarQuieroLeer): añadir o quitar un libro en un dispositivo no
// borra lo que se haya hecho en el otro.

import { leerAjuste, escribirVarios, leerYEscribir } from './almacen.js';
import { fusionarQuieroLeer } from '../sync/fusion.js';
import { marcarExtrasPendientes } from './colecciones.js';
import { fechaPosterior } from './reloj.js';

const CLAVE = 'quieroLeer';

export async function leerQuieroLeer() {
  return (await leerAjuste(CLAVE)) || { ids: [], fecha: null, entradas: {} };
}

// Lo fusionado en una sincronización se vuelve a fusionar con lo actual, por
// si la lista ha cambiado mientras se sincronizaba.
export async function guardarQuieroLeerFusionado(lista) {
  await leerYEscribir(['ajustes'], 'ajustes', CLAVE, (actual) => ({
    operaciones: [{ almacen: 'ajustes', valor: fusionarQuieroLeer(actual, lista), clave: CLAVE }],
  }));
}

// cambio: { id, quitado } al añadir o quitar un libro; sin él, solo cambia el orden.
async function guardar(lista, ids, cambio = null) {
  const fecha = fechaPosterior(lista.fecha, cambio && lista.entradas?.[cambio.id]?.fecha);
  const entradas = { ...(lista.entradas || {}) };
  // Listas anteriores sin entradas: se anotan los que ya estaban.
  for (const id of lista.ids) if (!entradas[id]) entradas[id] = { fecha: lista.fecha || fecha, quitado: false };
  if (cambio) entradas[cambio.id] = { fecha, quitado: cambio.quitado };
  await escribirVarios([{ almacen: 'ajustes', valor: { ids, fecha, entradas }, clave: CLAVE }]);
  await marcarExtrasPendientes();
}

export async function estaEnQuieroLeer(libroId) {
  return (await leerQuieroLeer()).ids.includes(libroId);
}

// Añade al final o quita. Devuelve true si queda en la lista.
export async function alternarQuieroLeer(libroId) {
  const lista = await leerQuieroLeer();
  const dentro = lista.ids.includes(libroId);
  await guardar(lista, dentro ? lista.ids.filter((id) => id !== libroId) : [...lista.ids, libroId], { id: libroId, quitado: dentro });
  return !dentro;
}

// Intercambia el libro con su vecino visible (la lista puede guardar ids de
// libros eliminados o aún no recibidos, que no se muestran).
export async function moverEnQuieroLeer(libroId, vecinoId) {
  const lista = await leerQuieroLeer();
  const i = lista.ids.indexOf(libroId);
  const j = lista.ids.indexOf(vecinoId);
  if (i < 0 || j < 0 || i === j) return;
  const nuevos = [...lista.ids];
  [nuevos[i], nuevos[j]] = [nuevos[j], nuevos[i]];
  await guardar(lista, nuevos);
}
