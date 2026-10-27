// Lista "Quiero leer" (punto 6): los próximos libros, en el orden que elija
// el usuario. Viaja en biblioteca.json (campo quieroLeer) y, como la lista se
// ordena a mano, gana entera la versión más reciente.

import { leerAjuste, escribirVarios, leerYEscribir } from './almacen.js';
import { fusionarQuieroLeer } from '../sync/fusion.js';
import { marcarExtrasPendientes } from './colecciones.js';

const CLAVE = 'quieroLeer';

export async function leerQuieroLeer() {
  return (await leerAjuste(CLAVE)) || { ids: [], fecha: null };
}

// Lo fusionado en una sincronización se vuelve a fusionar con lo actual, por
// si la lista ha cambiado mientras se sincronizaba.
export async function guardarQuieroLeerFusionado(lista) {
  await leerYEscribir(['ajustes'], 'ajustes', CLAVE, (actual) => ({
    operaciones: [{ almacen: 'ajustes', valor: fusionarQuieroLeer(actual, lista), clave: CLAVE }],
  }));
}

async function guardar(ids) {
  await escribirVarios([{ almacen: 'ajustes', valor: { ids, fecha: new Date().toISOString() }, clave: CLAVE }]);
  await marcarExtrasPendientes();
}

export async function estaEnQuieroLeer(libroId) {
  return (await leerQuieroLeer()).ids.includes(libroId);
}

// Añade al final o quita. Devuelve true si queda en la lista.
export async function alternarQuieroLeer(libroId) {
  const { ids } = await leerQuieroLeer();
  const dentro = ids.includes(libroId);
  await guardar(dentro ? ids.filter((id) => id !== libroId) : [...ids, libroId]);
  return !dentro;
}

export async function moverEnQuieroLeer(libroId, paso) {
  const { ids } = await leerQuieroLeer();
  const i = ids.indexOf(libroId);
  const j = i + paso;
  if (i < 0 || j < 0 || j >= ids.length) return;
  const nuevos = [...ids];
  [nuevos[i], nuevos[j]] = [nuevos[j], nuevos[i]];
  await guardar(nuevos);
}
