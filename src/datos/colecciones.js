// Colecciones manuales y objetivo anual de lectura (v2). Se guardan en local y
// viajan en biblioteca.json; cada cambio queda pendiente de sincronizar.

import { leerAjuste, escribirVarios, leerYEscribir } from './almacen.js';
import { fusionarColecciones, fusionarObjetivos } from '../sync/fusion.js';
import { fechaPosterior } from './reloj.js';

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

// Guarda lo fusionado en una sincronización. Se vuelve a fusionar con lo que
// haya ahora, en la misma transacción: un cambio hecho mientras se
// sincronizaba no se pierde (gana la fecha más reciente).
export async function guardarColeccionesFusionadas(colecciones) {
  await leerYEscribir(['ajustes'], 'ajustes', 'colecciones', (actuales) => ({
    operaciones: [{ almacen: 'ajustes', valor: fusionarColecciones(actuales || [], colecciones), clave: 'colecciones' }],
  }));
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
  const nuevas = actuales.map((c) => (c.id === id ? { ...c, ...cambios, fechaModificacion: fechaPosterior(c.fechaModificacion) } : c));
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
    const nuevo = { ...libro, colecciones: [...actuales], fechaModificacion: fechaPosterior(libro.fechaModificacion) };
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
  await leerYEscribir(['ajustes'], 'ajustes', 'objetivos', (actuales) => ({
    operaciones: [{ almacen: 'ajustes', valor: fusionarObjetivos(actuales || {}, objetivos), clave: 'objetivos' }],
  }));
}

export async function fijarObjetivo(anio, libros) {
  const actuales = await leerObjetivos();
  const fecha = fechaPosterior(actuales[anio]?.fecha);
  const objetivos = { ...actuales, [anio]: { libros, fecha } };
  await escribirVarios([{ almacen: 'ajustes', valor: objetivos, clave: 'objetivos' }, pendiente(fecha)]);
}

// Meta diaria de minutos: va con los objetivos, en la clave "diario", y se
// fusiona igual (gana la fecha más reciente). minutos null la quita.
export async function fijarMetaDiaria(minutos) {
  const actuales = await leerObjetivos();
  const fecha = fechaPosterior(actuales.diario?.fecha);
  const objetivos = { ...actuales, diario: { minutos: minutos || null, fecha } };
  await escribirVarios([{ almacen: 'ajustes', valor: objetivos, clave: 'objetivos' }, pendiente(fecha)]);
}
