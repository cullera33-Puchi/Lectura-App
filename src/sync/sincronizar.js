// Sincronización manual con Google Drive (punto 10 del diseño).
//
// Orden de los pasos:
//   1. Localizar la carpeta de la app y sus subcarpetas.
//   2. Descargar biblioteca.json y progreso.json. Se leen antes de subir para
//      no subir un libro que ya está en Drive con la misma huella.
//   3. Subir los libros pendientes y sus portadas, y enviar a la papelera los
//      archivos de los libros eliminados.
//   4. Fusionar la biblioteca (por id, gana la fechaModificacion más reciente)
//      y el progreso (libro a libro, gana la fecha más reciente).
//   5. Escribir los JSON en Drive solo si han cambiado.
//   6. Actualizar los datos locales y descargar las portadas que falten.
//
// Si algo falla a mitad, lo no subido sigue en la cola de pendientes.

import {
  localizarCarpeta, localizarSubcarpeta, buscarArchivo, leerJson, crearJson, actualizarJson,
  subirArchivo, descargarArchivo, enviarAPapelera, ErrorDrive,
} from './drive.js';
import {
  normalizarBiblioteca, normalizarProgreso, fusionarBiblioteca, fusionarProgreso, posicionesNuevas,
} from './fusion.js';
import {
  todosLosLibros, leerLibro, leerArchivo, leerPortada, actualizarLibro, aplicarLibroRemoto,
  guardarPortadaDescargada, guardarArchivoDescargado,
} from '../datos/libros.js';
import { listarProgresos } from '../datos/progreso.js';
import {
  listarPendientes, borrarPendiente, leerSincronizacion, guardarSincronizacion,
} from '../datos/pendientes.js';
import { leer, guardarAjuste } from '../datos/almacen.js';
import { huella } from '../biblioteca/importar.js';
import { registrar } from '../ui/registro.js';

export const NOMBRE_BIBLIOTECA = 'biblioteca.json';
export const NOMBRE_PROGRESO = 'progreso.json';
export const MENSAJE_SIN_CONEXION = 'Sin conexión. Se sincronizará cuando vuelvas a pulsar con conexión.';
const MENSAJE_CUOTA = 'La cuota de Google Drive está llena. Los libros quedan pendientes de subir.';

export class ErrorSinConexion extends Error {
  constructor() {
    super(MENSAJE_SIN_CONEXION);
  }
}

let enCurso = null;

export function sincronizando() {
  return Boolean(enCurso);
}

async function localizarCarpetas(token) {
  const { carpeta } = await localizarCarpeta(token);
  const [libros, portadas] = await Promise.all([
    localizarSubcarpeta(token, carpeta.id, 'libros'),
    localizarSubcarpeta(token, carpeta.id, 'portadas'),
  ]);
  const carpetas = { raiz: carpeta.id, libros: libros.id, portadas: portadas.id };
  await guardarSincronizacion('carpetas', carpetas);
  await guardarAjuste('carpetaId', carpeta.id);
  return carpetas;
}

async function escribirJson(token, carpetaId, archivo, nombre, datos) {
  if (archivo) await actualizarJson(token, archivo.id, datos);
  else await crearJson(token, carpetaId, nombre, datos);
}

async function subirLibro(token, carpetas, pendiente, remotoPorId) {
  const libro = await leerLibro(pendiente.id);
  if (!libro || libro.eliminado) return 'descartado';

  // Ya está en Drive con la misma huella (por ejemplo, importado también en el
  // otro dispositivo): se reutiliza.
  const remoto = remotoPorId.get(pendiente.id);
  if (remoto?.archivoDriveId && !remoto.eliminado) {
    await actualizarLibro(pendiente.id, {
      archivoDriveId: remoto.archivoDriveId,
      portadaDriveId: remoto.portadaDriveId ?? libro.portadaDriveId ?? null,
    });
    return 'existente';
  }

  let archivoId = libro.archivoDriveId;
  if (!archivoId) {
    // Una sincronización anterior pudo subirlo y fallar antes de escribir el JSON.
    const existente = await buscarArchivo(token, carpetas.libros, `${libro.id}.epub`);
    if (existente) {
      archivoId = existente.id;
    } else {
      const datos = await leerArchivo(libro.id);
      if (!datos) return 'sin-archivo';
      archivoId = (await subirArchivo(token, carpetas.libros, `${libro.id}.epub`, datos,
        'application/epub+zip', { libro: libro.id })).id;
    }
  }

  let portadaId = libro.portadaDriveId;
  const portada = await leerPortada(libro.id);
  if (!portadaId && portada) {
    const existente = await buscarArchivo(token, carpetas.portadas, `${libro.id}.jpg`);
    portadaId = existente?.id
      || (await subirArchivo(token, carpetas.portadas, `${libro.id}.jpg`, portada, 'image/jpeg', { libro: libro.id })).id;
  }

  await actualizarLibro(libro.id, {
    archivoDriveId: archivoId,
    portadaDriveId: portadaId || null,
    fechaModificacion: new Date().toISOString(),
  });
  return 'subido';
}

async function darDeBaja(token, pendiente, remotoPorId) {
  const local = await leerLibro(pendiente.id);
  const remoto = remotoPorId.get(pendiente.id);
  // Si el otro dispositivo lo ha recuperado después, gana su versión y no se borra nada.
  if (remoto && !remoto.eliminado && (remoto.fechaModificacion || '') > (local?.fechaModificacion || '')) return;
  const ids = new Set([local?.archivoDriveId, local?.portadaDriveId, remoto?.archivoDriveId, remoto?.portadaDriveId]);
  ids.delete(null);
  ids.delete(undefined);
  for (const id of ids) await enviarAPapelera(token, id);
}

async function ejecutar(token, alEstado) {
  const estado = (texto) => alEstado?.(texto);
  const resumen = { subidos: 0, nuevos: 0, bajas: 0, posiciones: 0, avisos: [] };

  estado('Buscando la carpeta en Drive...');
  const carpetas = await localizarCarpetas(token);

  estado('Leyendo la biblioteca de Drive...');
  const [archivoBiblioteca, archivoProgreso] = await Promise.all([
    buscarArchivo(token, carpetas.raiz, NOMBRE_BIBLIOTECA),
    buscarArchivo(token, carpetas.raiz, NOMBRE_PROGRESO),
  ]);
  const remotoBiblioteca = normalizarBiblioteca(archivoBiblioteca ? await leerJson(token, archivoBiblioteca.id) : null);
  const remotoProgreso = normalizarProgreso(archivoProgreso ? await leerJson(token, archivoProgreso.id) : null);
  const remotoPorId = new Map(remotoBiblioteca.libros.map((l) => [l.id, l]));

  const pendientes = await listarPendientes();

  const paraSubir = pendientes.filter((p) => p.tipo === 'subirLibro');
  let n = 0;
  for (const p of paraSubir) {
    n += 1;
    estado(`Subiendo libros (${n} de ${paraSubir.length})...`);
    try {
      const resultado = await subirLibro(token, carpetas, p, remotoPorId);
      if (resultado === 'subido') resumen.subidos += 1;
      if (resultado !== 'sin-archivo') await borrarPendiente(p.clave);
    } catch (e) {
      if (e instanceof ErrorDrive && e.detalle?.error?.errors?.[0]?.reason === 'storageQuotaExceeded') {
        resumen.avisos.push(MENSAJE_CUOTA);
        break;
      }
      throw e;
    }
  }

  for (const p of pendientes.filter((x) => x.tipo === 'bajaLibro')) {
    await darDeBaja(token, p, remotoPorId);
    await borrarPendiente(p.clave);
  }

  estado('Fusionando...');
  const progresosLocales = await listarProgresos();
  const fusionBiblioteca = fusionarBiblioteca(await todosLosLibros(), remotoBiblioteca);
  const fusionProgreso = fusionarProgreso(progresosLocales, remotoProgreso);
  const copiaAnterior = await leerSincronizacion('progresoRemoto');
  resumen.posiciones = posicionesNuevas(fusionProgreso.progreso, progresosLocales, copiaAnterior);

  estado('Guardando en Drive...');
  if (fusionBiblioteca.escribirRemoto) {
    await escribirJson(token, carpetas.raiz, archivoBiblioteca, NOMBRE_BIBLIOTECA, fusionBiblioteca.biblioteca);
  }
  if (fusionProgreso.escribirRemoto) {
    await escribirJson(token, carpetas.raiz, archivoProgreso, NOMBRE_PROGRESO, fusionProgreso.progreso);
  }

  // Cambios de progreso ya enviados. Si alguno ha cambiado durante la
  // sincronización, se queda en la cola para la próxima.
  for (const p of pendientes.filter((x) => x.tipo === 'progreso')) {
    const actual = await leer('pendientes', p.clave);
    if (actual && actual.fecha === p.fecha) await borrarPendiente(p.clave);
  }

  estado('Actualizando este dispositivo...');
  for (const cambio of fusionBiblioteca.cambiosLocales) {
    await aplicarLibroRemoto(cambio.libro);
    if (cambio.tipo === 'nuevo' || cambio.tipo === 'recuperado') resumen.nuevos += 1;
    if (cambio.tipo === 'baja') resumen.bajas += 1;
  }
  await guardarSincronizacion('progresoRemoto', fusionProgreso.progreso);
  await guardarSincronizacion('ultima', new Date().toISOString());

  // Portadas de los libros que este dispositivo aún no tiene.
  const conPortadaRemota = fusionBiblioteca.biblioteca.libros.filter((l) => !l.eliminado && l.portadaDriveId);
  for (const libro of conPortadaRemota) {
    if (await leerPortada(libro.id)) continue;
    try {
      const datos = await descargarArchivo(token, libro.portadaDriveId);
      await guardarPortadaDescargada(libro.id, new Blob([datos], { type: 'image/jpeg' }));
    } catch (e) {
      registrar(`No se pudo descargar la portada de "${libro.titulo}": ${e.message}`, 'error');
    }
  }
  return resumen;
}

export function textoResumen(r) {
  const partes = [];
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  if (r.subidos) partes.push(plural(r.subidos, 'libro subido', 'libros subidos'));
  if (r.nuevos) partes.push(plural(r.nuevos, 'libro nuevo', 'libros nuevos'));
  if (r.bajas) partes.push(plural(r.bajas, 'libro eliminado', 'libros eliminados'));
  if (r.posiciones) partes.push(plural(r.posiciones, 'posición actualizada', 'posiciones actualizadas'));
  const texto = partes.length ? `${partes.join(', ')}.` : 'Todo al día.';
  return [texto, ...r.avisos].join('\n');
}

// Sincroniza con un token ya vigente. Si ya hay una sincronización en curso,
// devuelve la misma.
export function sincronizar(token, { alEstado } = {}) {
  if (enCurso) return enCurso;
  if (!navigator.onLine) return Promise.reject(new ErrorSinConexion());
  const inicio = performance.now();
  enCurso = ejecutar(token, alEstado)
    .then((resumen) => {
      registrar(`Sincronización completada en ${Math.round(performance.now() - inicio)} ms: ${textoResumen(resumen)}`);
      return resumen;
    })
    .catch((e) => {
      if (e instanceof ErrorDrive && e.estadoHttp === 0 && !navigator.onLine) throw new ErrorSinConexion();
      throw e;
    })
    .finally(() => {
      enCurso = null;
    });
  return enCurso;
}

// Descarga el EPUB de un libro que está solo en la nube.
export async function descargarLibro(token, libro, alAvanzar) {
  if (!libro.archivoDriveId) throw new Error('Este libro todavía no se ha subido a Drive desde el otro dispositivo.');
  let datos;
  try {
    datos = await descargarArchivo(token, libro.archivoDriveId, libro.tamanoBytes, alAvanzar);
  } catch (e) {
    if (e instanceof ErrorDrive && e.estadoHttp === 404) {
      await actualizarLibro(libro.id, { noDisponible: true });
      throw new Error(`"${libro.titulo}" ya no está en Google Drive. Se ha marcado como no disponible.`);
    }
    throw e;
  }
  if ((await huella(datos)) !== libro.id) {
    throw new Error(`El archivo de "${libro.titulo}" en Drive no coincide con el original. No se ha guardado.`);
  }
  await guardarArchivoDescargado(libro.id, datos);
  if (libro.noDisponible) await actualizarLibro(libro.id, { noDisponible: false });
  registrar(`Descargado "${libro.titulo}"`);
}
