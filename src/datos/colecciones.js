// Colecciones manuales y objetivo anual de lectura (v2). Se guardan en local y
// viajan en biblioteca.json; cada cambio queda pendiente de sincronizar.

import { leerAjuste, escribirVarios, leerYEscribir } from './almacen.js';

const PENDIENTE_EXTRAS = { clave: 'biblioteca:extras', tipo: 'extras' };

function pendiente(fecha) {
  return { almacen: 'pendientes', valor: { ...PENDIENTE_EXTRAS, fecha } };
}

export async function leerColecciones({ incluirEliminadas = false } = {}) {
  const todas = (await leerAjuste('colecciones')) || [];
  return incluirEliminadas ? todas : todas.filter((c) => !c.eliminado);
}

// Deja colecciones y objetivos pendientes de enviar (tras restaurar una copia).
export async function marcarExtrasPendientes() {
  await escribirVarios([pendiente(new Date().toISOString())]);
}

export async function guardarColeccionesFusionadas(colecciones) {
  await escribirVarios([{ almacen: 'ajustes', valor: colecciones, clave: 'colecciones' }]);
}

export async function crearColeccion(nombre) {
  const fecha = new Date().toISOString();
  const nueva = {
    id: crypto.randomUUID ? crypto.randomUUID() : `c-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    nombre: nombre.trim(),
    fechaModificacion: fecha,
    eliminado: false,
  };
  const actuales = await leerColecciones({ incluirEliminadas: true });
  await escribirVarios([{ almacen: 'ajustes', valor: [...actuales, nueva], clave: 'colecciones' }, pendiente(fecha)]);
  return nueva;
}

async function cambiarColeccion(id, cambios) {
  const fecha = new Date().toISOString();
  const actuales = await leerColecciones({ incluirEliminadas: true });
  const nuevas = actuales.map((c) => (c.id === id ? { ...c, ...cambios, fechaModificacion: fecha } : c));
  await escribirVarios([{ almacen: 'ajustes', valor: nuevas, clave: 'colecciones' }, pendiente(fecha)]);
}

export function renombrarColeccion(id, nombre) {
  return cambiarColeccion(id, { nombre: nombre.trim() });
}

// La colección queda marcada como eliminada para que la baja llegue al otro
// dispositivo. Los libros no se tocan: simplemente dejan de mostrarla.
export function eliminarColeccion(id) {
  return cambiarColeccion(id, { eliminado: true });
}

// Añade o quita un libro de una colección. Cambia el registro del libro.
export function alternarLibroEnColeccion(libroId, coleccionId) {
  const fecha = new Date().toISOString();
  return leerYEscribir(['libros', 'pendientes'], 'libros', libroId, (libro) => {
    if (!libro) return null;
    const actuales = new Set(libro.colecciones || []);
    if (actuales.has(coleccionId)) actuales.delete(coleccionId);
    else actuales.add(coleccionId);
    const nuevo = { ...libro, colecciones: [...actuales], fechaModificacion: fecha };
    return {
      operaciones: [
        { almacen: 'libros', valor: nuevo },
        { almacen: 'pendientes', valor: { clave: `metadatos:${libroId}`, tipo: 'metadatos', id: libroId, fecha } },
      ],
      resultado: nuevo,
    };
  });
}

// --- Objetivo anual ---

export async function leerObjetivos() {
  return (await leerAjuste('objetivos')) || {};
}

export async function guardarObjetivosFusionados(objetivos) {
  await escribirVarios([{ almacen: 'ajustes', valor: objetivos, clave: 'objetivos' }]);
}

export async function fijarObjetivo(anio, libros) {
  const fecha = new Date().toISOString();
  const objetivos = { ...(await leerObjetivos()), [anio]: { libros, fecha } };
  await escribirVarios([{ almacen: 'ajustes', valor: objetivos, clave: 'objetivos' }, pendiente(fecha)]);
}
