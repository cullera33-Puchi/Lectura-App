// Catálogo local de libros.

import {
  leer, leerTodos, leerClaves, escribirVarios, leerYEscribir,
} from './almacen.js';

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

// Todos los registros, incluidos los eliminados (para la sincronización).
export function todosLosLibros() {
  return leerTodos('libros');
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

export function idsConPortada() {
  return leerClaves('portadas');
}

export function idsDescargados() {
  return leerClaves('archivos');
}

// Se guarda la promesa, no la URL, para que dos peticiones simultáneas de la
// misma portada compartan una sola URL de objeto.
const urlsPortada = new Map();

export function urlPortada(id) {
  if (!urlsPortada.has(id)) {
    urlsPortada.set(id, leerPortada(id).then((blob) => (blob ? URL.createObjectURL(blob) : null)));
  }
  return urlsPortada.get(id);
}

function olvidarPortada(id) {
  const promesa = urlsPortada.get(id);
  urlsPortada.delete(id);
  promesa?.then((url) => url && URL.revokeObjectURL(url));
}

// Alta de un libro importado. Si estaba eliminado, se recupera: también se
// anula su baja pendiente, para que la sincronización no borre en Drive el
// archivo que se va a subir o reutilizar.
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
    { almacen: 'pendientes', clave: `bajaLibro:${libro.id}`, borrar: true },
  ];
  if (portada) operaciones.push({ almacen: 'portadas', valor: portada, clave: libro.id });
  else operaciones.push({ almacen: 'portadas', clave: libro.id, borrar: true });
  olvidarPortada(libro.id);
  await escribirVarios(operaciones);
  return registro;
}

// Baja: se conserva el registro con eliminado: true para que llegue al otro
// dispositivo al sincronizar. Se borran el archivo, la portada y la caché.
export async function eliminarLibro(id) {
  olvidarPortada(id);
  const ahora = new Date().toISOString();
  await leerYEscribir(['libros', 'archivos', 'portadas', 'ubicaciones', 'pendientes'], 'libros', id, (libro) => {
    if (!libro) return null;
    return {
      operaciones: [
        { almacen: 'libros', valor: { ...libro, eliminado: true, fechaModificacion: ahora } },
        { almacen: 'archivos', clave: id, borrar: true },
        { almacen: 'portadas', clave: id, borrar: true },
        { almacen: 'ubicaciones', clave: id, borrar: true },
        { almacen: 'pendientes', clave: `subirLibro:${id}`, borrar: true },
        { almacen: 'pendientes', valor: { clave: `bajaLibro:${id}`, tipo: 'bajaLibro', id, fecha: ahora } },
      ],
    };
  });
}

// Cambia campos de un libro en una sola transacción.
export function actualizarLibro(id, cambios) {
  return leerYEscribir(['libros'], 'libros', id, (libro) => {
    if (!libro) return null;
    const nuevo = { ...libro, ...cambios };
    return { operaciones: [{ almacen: 'libros', valor: nuevo }], resultado: nuevo };
  });
}

// Aplica en local un registro llegado de Drive, conservando los campos locales.
// Si el registro local ha cambiado después (por ejemplo, el usuario lo ha
// eliminado durante la sincronización), gana el local y no se toca.
export function aplicarLibroRemoto(registro) {
  const id = registro.id;
  return leerYEscribir(['libros', 'archivos', 'portadas', 'ubicaciones', 'pendientes'], 'libros', id, (local) => {
    if (local && (local.fechaModificacion || '') > (registro.fechaModificacion || '')) return null;
    const nuevo = { ...(local || {}), ...registro };
    // Un archivo nuevo en Drive hace que el libro vuelva a estar disponible.
    if (local?.noDisponible && registro.archivoDriveId && registro.archivoDriveId !== local.archivoDriveId) {
      nuevo.noDisponible = false;
    }
    const operaciones = [{ almacen: 'libros', valor: nuevo }];
    if (registro.eliminado) {
      operaciones.push(
        { almacen: 'archivos', clave: id, borrar: true },
        { almacen: 'portadas', clave: id, borrar: true },
        { almacen: 'ubicaciones', clave: id, borrar: true },
        { almacen: 'pendientes', clave: `subirLibro:${id}`, borrar: true },
      );
    }
    return { operaciones, resultado: nuevo };
  }).then((resultado) => {
    if (registro.eliminado) olvidarPortada(id);
    return resultado;
  });
}

// Solo si el libro sigue en la biblioteca: se puede haber eliminado durante la
// descarga (aquí o desde el otro dispositivo). Devuelve si se ha guardado.
export async function guardarArchivoDescargado(id, datos) {
  const guardado = await leerYEscribir(['libros', 'archivos'], 'libros', id, (libro) => (
    !libro || libro.eliminado ? null : { operaciones: [{ almacen: 'archivos', valor: datos, clave: id }], resultado: true }
  ));
  return guardado === true;
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

export function leerUbicaciones(id) {
  return leer('ubicaciones', id);
}

export function guardarUbicaciones(id, json) {
  return escribirVarios([{ almacen: 'ubicaciones', valor: json, clave: id }]);
}

// Pone en cola la subida de un libro cuyo archivo ya no está en Drive.
export async function volverASubir(id) {
  const fecha = new Date().toISOString();
  await leerYEscribir(['libros', 'pendientes'], 'libros', id, (libro) => {
    if (!libro || libro.eliminado) return null;
    return {
      operaciones: [
        { almacen: 'libros', valor: { ...libro, archivoDriveId: null, portadaDriveId: null } },
        { almacen: 'pendientes', valor: { clave: `subirLibro:${id}`, tipo: 'subirLibro', id, fecha } },
      ],
    };
  });
}

// Cambia los datos de un libro editados a mano. Quedan pendientes de enviar a
// biblioteca.json.
export function editarMetadatos(id, cambios) {
  const fecha = new Date().toISOString();
  return leerYEscribir(['libros', 'pendientes'], 'libros', id, (libro) => {
    if (!libro) return null;
    const nuevo = { ...libro, ...cambios, fechaModificacion: fecha };
    return {
      operaciones: [
        { almacen: 'libros', valor: nuevo },
        { almacen: 'pendientes', valor: { clave: `metadatos:${id}`, tipo: 'metadatos', id, fecha } },
      ],
      resultado: nuevo,
    };
  });
}

// Portada cambiada a mano: se guarda en local y queda pendiente de subir.
export async function cambiarPortada(id, blob) {
  olvidarPortada(id);
  const fecha = new Date().toISOString();
  await escribirVarios([
    { almacen: 'portadas', valor: blob, clave: id },
    { almacen: 'pendientes', valor: { clave: `subirPortada:${id}`, tipo: 'subirPortada', id, fecha } },
  ]);
}

// Datos de la edición leídos del EPUB (sinopsis, editorial...). No cambia
// fechaModificacion: al fusionar con la misma fecha se completan los campos
// que faltan, así no se pisa una edición hecha en el otro dispositivo.
export function guardarEdicion(id, edicion) {
  const fecha = new Date().toISOString();
  return leerYEscribir(['libros', 'pendientes'], 'libros', id, (libro) => {
    if (!libro || libro.eliminado || libro.edicion) return null;
    return {
      operaciones: [
        { almacen: 'libros', valor: { ...libro, edicion } },
        { almacen: 'pendientes', valor: { clave: `metadatos:${id}`, tipo: 'metadatos', id, fecha } },
      ],
    };
  });
}

// Valoración personal (punto 5): estrellas de 1 a 5 y una nota breve. Viaja
// en biblioteca.json con el resto de datos del libro.
export function valorarLibro(id, cambios) {
  const fecha = new Date().toISOString();
  return leerYEscribir(['libros', 'pendientes'], 'libros', id, (libro) => {
    if (!libro) return null;
    const valoracion = { ...(libro.valoracion || {}), ...cambios, fecha };
    const nuevo = { ...libro, valoracion, fechaModificacion: fecha };
    return {
      operaciones: [
        { almacen: 'libros', valor: nuevo },
        { almacen: 'pendientes', valor: { clave: `metadatos:${id}`, tipo: 'metadatos', id, fecha } },
      ],
      resultado: nuevo,
    };
  });
}
