// Catálogo local de libros.

import { leer, leerTodos, leerClaves, borrar, escribirVarios } from './almacen.js';

export const ESTADOS = ['pendiente', 'leyendo', 'terminado'];

// Libros visibles (no eliminados), con su progreso y si el archivo está en el dispositivo.
export async function listarLibros() {
  const [libros, progresos, descargados] = await Promise.all([
    leerTodos('libros'),
    leerTodos('progreso'),
    leerClaves('archivos'),
  ]);
  const progresoPorId = new Map(progresos.map((p) => [p.id, p]));
  const enDispositivo = new Set(descargados);
  return libros
    .filter((l) => !l.eliminado)
    .map((l) => ({
      ...l,
      progreso: progresoPorId.get(l.id) || null,
      descargado: enDispositivo.has(l.id),
    }));
}

export function leerLibro(id) {
  return leer('libros', id);
}

export function leerArchivo(id) {
  return leer('archivos', id);
}

export function leerPortada(id) {
  return leer('portadas', id);
}

const urlsPortada = new Map();

export async function urlPortada(id) {
  if (urlsPortada.has(id)) return urlsPortada.get(id);
  const blob = await leerPortada(id);
  const url = blob ? URL.createObjectURL(blob) : null;
  urlsPortada.set(id, url);
  return url;
}

function olvidarPortada(id) {
  const url = urlsPortada.get(id);
  if (url) URL.revokeObjectURL(url);
  urlsPortada.delete(id);
}

// Alta de un libro importado. Si estaba eliminado, se recupera.
export async function guardarLibroImportado(libro, datosEpub, portada) {
  const ahora = new Date().toISOString();
  const registro = {
    archivoDriveId: null,
    portadaDriveId: null,
    ...libro,
    fechaAlta: ahora,
    eliminado: false,
    fechaModificacion: ahora,
  };
  const operaciones = [
    { almacen: 'libros', valor: registro },
    { almacen: 'archivos', valor: datosEpub, clave: libro.id },
    { almacen: 'pendientes', valor: { clave: `subirLibro:${libro.id}`, tipo: 'subirLibro', id: libro.id, fecha: ahora } },
  ];
  if (portada) operaciones.push({ almacen: 'portadas', valor: portada, clave: libro.id });
  else operaciones.push({ almacen: 'portadas', clave: libro.id, borrar: true });
  olvidarPortada(libro.id);
  await escribirVarios(operaciones);
  return registro;
}

// Baja: se conserva el registro con eliminado: true para que llegue al otro
// dispositivo al sincronizar (fase 2). Se borran el archivo, la portada y la caché.
export async function eliminarLibro(id) {
  const libro = await leer('libros', id);
  if (!libro) return;
  const ahora = new Date().toISOString();
  olvidarPortada(id);
  await escribirVarios([
    { almacen: 'libros', valor: { ...libro, eliminado: true, fechaModificacion: ahora } },
    { almacen: 'archivos', clave: id, borrar: true },
    { almacen: 'portadas', clave: id, borrar: true },
    { almacen: 'ubicaciones', clave: id, borrar: true },
    { almacen: 'pendientes', clave: `subirLibro:${id}`, borrar: true },
    { almacen: 'pendientes', valor: { clave: `bajaLibro:${id}`, tipo: 'bajaLibro', id, fecha: ahora } },
  ]);
}

export function leerUbicaciones(id) {
  return leer('ubicaciones', id);
}

export function guardarUbicaciones(id, json) {
  return escribirVarios([{ almacen: 'ubicaciones', valor: json, clave: id }]);
}

export function borrarUbicaciones(id) {
  return borrar('ubicaciones', id);
}

// Todos los registros, incluidos los eliminados (para la sincronización).
export function todosLosLibros() {
  return leerTodos('libros');
}

export async function actualizarLibro(id, cambios) {
  const libro = await leer('libros', id);
  if (!libro) return null;
  const nuevo = { ...libro, ...cambios };
  await escribirVarios([{ almacen: 'libros', valor: nuevo }]);
  return nuevo;
}

// Aplica en local un registro llegado de Drive, conservando los campos locales.
export async function aplicarLibroRemoto(registro) {
  const local = await leer('libros', registro.id);
  const nuevo = { ...(local || {}), ...registro };
  const operaciones = [{ almacen: 'libros', valor: nuevo }];
  if (registro.eliminado) {
    olvidarPortada(registro.id);
    operaciones.push(
      { almacen: 'archivos', clave: registro.id, borrar: true },
      { almacen: 'portadas', clave: registro.id, borrar: true },
      { almacen: 'ubicaciones', clave: registro.id, borrar: true },
      { almacen: 'pendientes', clave: `subirLibro:${registro.id}`, borrar: true },
    );
  }
  await escribirVarios(operaciones);
  return nuevo;
}

export async function guardarArchivoDescargado(id, datos) {
  await escribirVarios([{ almacen: 'archivos', valor: datos, clave: id }]);
}

export async function guardarPortadaDescargada(id, blob) {
  olvidarPortada(id);
  await escribirVarios([{ almacen: 'portadas', valor: blob, clave: id }]);
}

// Quitar de este dispositivo: el libro sigue en Drive y en el otro dispositivo.
export async function quitarArchivoLocal(id) {
  await escribirVarios([
    { almacen: 'archivos', clave: id, borrar: true },
    { almacen: 'ubicaciones', clave: id, borrar: true },
  ]);
}
