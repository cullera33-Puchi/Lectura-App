// Sincronización manual con Google Drive (punto 10 del diseño).
//
// Orden de los pasos:
//   1. Localizar la carpeta de la app y sus subcarpetas.
//   2. Leer biblioteca.json y progreso.json. Se leen antes de subir para no
//      subir un libro que ya está en Drive con la misma huella.
//   3. Volver a poner en cola los libros cuyo archivo ya no está en Drive.
//   4. Subir los libros pendientes y sus portadas, y enviar a la papelera los
//      archivos de los libros eliminados.
//   5. Fusionar la biblioteca (por id, gana la fechaModificacion más reciente)
//      y el progreso (libro a libro, gana la fecha más reciente).
//   6. Escribir los JSON en Drive solo si han cambiado. Justo antes se
//      comprueba que nadie los ha cambiado mientras tanto; si es así, se
//      vuelven a leer y fusionar.
//   7. Actualizar los datos locales y descargar las portadas que falten.
//
// Si algo falla a mitad, lo no subido sigue en la cola de pendientes.

import {
  localizarCarpeta, localizarSubcarpeta, buscarArchivos, leerJson, crearJson, actualizarJson,
  subirArchivo, descargarArchivo, enviarAPapelera, nombresEnCarpeta, obtenerMetadatos, renombrar,
  ErrorDrive, ErrorJsonIlegible,
} from './drive.js';
import {
  normalizarBiblioteca, normalizarProgreso, fusionarBiblioteca, fusionarProgreso, posicionesNuevas,
  unirBibliotecas, unirProgresos,
} from './fusion.js';
import {
  todosLosLibros, leerLibro, leerArchivo, leerPortada, actualizarLibro, aplicarLibroRemoto,
  guardarPortadaDescargada, guardarArchivoDescargado, idsConPortada, idsDescargados, volverASubir,
} from '../datos/libros.js';
import { listarProgresos } from '../datos/progreso.js';
import {
  listarPendientes, borrarPendiente, leerSincronizacion, guardarSincronizacion,
} from '../datos/pendientes.js';
import { leer } from '../datos/almacen.js';
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
  return { raiz: carpeta.id, libros: libros.id, portadas: portadas.id };
}

// Lee todas las copias de un JSON. Las que no se pueden interpretar se
// renombran (no se sobrescriben) para no perder su contenido, y se avisa.
async function leerRemoto(token, carpetaId, nombre, normalizar, unir, avisos) {
  const archivos = await buscarArchivos(token, carpetaId, nombre);
  const validos = [];
  const contenidos = [];
  for (const archivo of archivos) {
    try {
      contenidos.push(normalizar(await leerJson(token, archivo.id)));
      validos.push(archivo);
    } catch (e) {
      if (!(e instanceof ErrorJsonIlegible)) throw e;
      const apartado = nombre.replace('.json', `.danado-${new Date().toISOString().slice(0, 10)}.json`);
      await renombrar(token, archivo.id, apartado);
      avisos.push(`${nombre} estaba dañado en Drive. Se ha apartado como ${apartado} y se ha rehecho con los datos de este dispositivo.`);
      registrar(`${nombre} dañado (id ${archivo.id}), renombrado a ${apartado}`, 'error');
    }
  }
  return {
    datos: contenidos.length > 1 ? unir(contenidos) : (contenidos[0] || normalizar(null)),
    archivo: validos[0] || null,
    duplicados: validos.slice(1),
  };
}

async function escribirJson(token, carpetaId, archivo, nombre, datos) {
  if (archivo) await actualizarJson(token, archivo.id, datos);
  else await crearJson(token, carpetaId, nombre, datos);
}

async function subirLibro(token, carpetas, pendiente, remotoPorId, nombresLibros) {
  const libro = await leerLibro(pendiente.id);
  if (!libro || libro.eliminado) return 'descartado';
  const remoto = remotoPorId.get(pendiente.id);

  // El otro dispositivo lo eliminó después de que se importara aquí: no se
  // sube y la fusión aplicará la baja.
  if (remoto?.eliminado && (remoto.fechaModificacion || '') > (libro.fechaModificacion || '')) return 'descartado';

  // Ya está en Drive con la misma huella (por ejemplo, importado también en el
  // otro dispositivo): se reutiliza.
  if (remoto?.archivoDriveId && !remoto.eliminado && nombresLibros.has(`${libro.id}.epub`)) {
    await actualizarLibro(pendiente.id, {
      archivoDriveId: remoto.archivoDriveId,
      portadaDriveId: remoto.portadaDriveId ?? libro.portadaDriveId ?? null,
    });
    return 'existente';
  }

  // Una sincronización anterior pudo subirlo y fallar antes de escribir el JSON.
  let archivoId = null;
  if (nombresLibros.has(`${libro.id}.epub`)) {
    archivoId = (await buscarArchivos(token, carpetas.libros, `${libro.id}.epub`))[0]?.id || null;
  }
  if (!archivoId) {
    const datos = await leerArchivo(libro.id);
    if (!datos) return 'sin-archivo';
    archivoId = (await subirArchivo(token, carpetas.libros, `${libro.id}.epub`, datos,
      'application/epub+zip', { libro: libro.id })).id;
  }

  let portadaId = null;
  const portada = await leerPortada(libro.id);
  if (portada) {
    portadaId = (await buscarArchivos(token, carpetas.portadas, `${libro.id}.jpg`))[0]?.id
      || (await subirArchivo(token, carpetas.portadas, `${libro.id}.jpg`, portada, 'image/jpeg', { libro: libro.id })).id;
  }

  await actualizarLibro(libro.id, {
    archivoDriveId: archivoId,
    portadaDriveId: portadaId,
    fechaModificacion: new Date().toISOString(),
  });
  return 'subido';
}

async function darDeBaja(token, pendiente, remotoPorId) {
  const local = await leerLibro(pendiente.id);
  // Si el libro se ha vuelto a importar, ya no está eliminado: no se borra nada.
  if (!local?.eliminado) return;
  const remoto = remotoPorId.get(pendiente.id);
  // Si el otro dispositivo lo ha recuperado después, gana su versión.
  if (remoto && !remoto.eliminado && (remoto.fechaModificacion || '') > (local.fechaModificacion || '')) return;
  const ids = new Set([local.archivoDriveId, local.portadaDriveId, remoto?.archivoDriveId, remoto?.portadaDriveId]);
  ids.delete(null);
  ids.delete(undefined);
  for (const id of ids) await enviarAPapelera(token, id);
}

// Libros con el EPUB en este dispositivo cuyo archivo ya no está en Drive (por
// ejemplo, porque se vació la carpeta): se vuelven a poner en cola de subida.
async function repararAusentes(nombresLibros, pendientes) {
  const enCola = new Set(pendientes.filter((p) => p.tipo === 'subirLibro').map((p) => p.id));
  const descargados = new Set(await idsDescargados());
  let n = 0;
  for (const libro of await todosLosLibros()) {
    if (libro.eliminado || enCola.has(libro.id) || !descargados.has(libro.id) || !libro.archivoDriveId) continue;
    if (!nombresLibros.has(`${libro.id}.epub`)) {
      await volverASubir(libro.id);
      n += 1;
    }
  }
  if (n) registrar(`${n} libros sin archivo en Drive vuelven a la cola de subida`);
  return n;
}

// Libros locales que deben figurar en biblioteca.json: los ya subidos, los
// eliminados y los que el otro dispositivo ya conoce. Un libro que no se ha
// podido subir no se publica, porque el otro dispositivo no podría descargarlo.
function librosPublicables(locales, remotoPorId) {
  return locales.filter((l) => l.eliminado || l.archivoDriveId || remotoPorId.has(l.id));
}

async function ejecutar(token, alEstado) {
  const estado = (texto) => alEstado?.(texto);
  const resumen = { subidos: 0, nuevos: 0, bajas: 0, posiciones: 0, avisos: [] };

  estado('Buscando la carpeta en Drive...');
  const carpetas = await localizarCarpetas(token);

  estado('Leyendo la biblioteca de Drive...');
  const leerJsons = () => Promise.all([
    leerRemoto(token, carpetas.raiz, NOMBRE_BIBLIOTECA, normalizarBiblioteca, unirBibliotecas, resumen.avisos),
    leerRemoto(token, carpetas.raiz, NOMBRE_PROGRESO, normalizarProgreso, unirProgresos, resumen.avisos),
    nombresEnCarpeta(token, carpetas.libros),
  ]);
  let [remotoBiblioteca, remotoProgreso, nombresLibros] = await leerJsons();
  let remotoPorId = new Map(remotoBiblioteca.datos.libros.map((l) => [l.id, l]));

  await repararAusentes(nombresLibros, await listarPendientes());
  const pendientes = await listarPendientes();

  const paraSubir = pendientes.filter((p) => p.tipo === 'subirLibro');
  let n = 0;
  for (const p of paraSubir) {
    n += 1;
    estado(`Subiendo libros (${n} de ${paraSubir.length})...`);
    try {
      const resultado = await subirLibro(token, carpetas, p, remotoPorId, nombresLibros);
      if (resultado === 'subido') resumen.subidos += 1;
      if (resultado !== 'sin-archivo') await borrarPendiente(p.clave);
    } catch (e) {
      if (e instanceof ErrorDrive && e.motivo === 'storageQuotaExceeded') {
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

  // Fusión y escritura. Si alguien ha escrito los JSON mientras se subían los
  // libros, se vuelven a leer y se fusiona otra vez (una sola vez).
  let fusionBiblioteca;
  let fusionProgreso;
  let progresosLocales;
  for (let intento = 1; ; intento += 1) {
    estado('Fusionando...');
    progresosLocales = await listarProgresos();
    fusionBiblioteca = fusionarBiblioteca(librosPublicables(await todosLosLibros(), remotoPorId), remotoBiblioteca.datos);
    fusionProgreso = fusionarProgreso(progresosLocales, remotoProgreso.datos);

    const cambiados = await Promise.all([remotoBiblioteca.archivo, remotoProgreso.archivo].map(async (a) => {
      if (!a) return false;
      return (await obtenerMetadatos(token, a.id)).modifiedTime !== a.modifiedTime;
    }));
    if (intento === 1 && cambiados.some(Boolean)) {
      registrar('Los JSON de Drive han cambiado durante la sincronización. Se vuelven a leer.');
      [remotoBiblioteca, remotoProgreso] = await leerJsons();
      remotoPorId = new Map(remotoBiblioteca.datos.libros.map((l) => [l.id, l]));
      continue;
    }
    break;
  }
  const copiaAnterior = await leerSincronizacion('progresoRemoto');
  resumen.posiciones = posicionesNuevas(fusionProgreso.progreso, progresosLocales, copiaAnterior);

  estado('Guardando en Drive...');
  const duplicados = [...remotoBiblioteca.duplicados, ...remotoProgreso.duplicados];
  if (fusionBiblioteca.escribirRemoto || remotoBiblioteca.duplicados.length) {
    await escribirJson(token, carpetas.raiz, remotoBiblioteca.archivo, NOMBRE_BIBLIOTECA, fusionBiblioteca.biblioteca);
  }
  if (fusionProgreso.escribirRemoto || remotoProgreso.duplicados.length) {
    await escribirJson(token, carpetas.raiz, remotoProgreso.archivo, NOMBRE_PROGRESO, fusionProgreso.progreso);
  }
  // Las copias duplicadas ya están fusionadas en el archivo principal.
  for (const d of duplicados) await enviarAPapelera(token, d.id);

  // Cambios de progreso ya enviados. Si alguno ha cambiado durante la
  // sincronización, se queda en la cola para la próxima.
  for (const p of pendientes.filter((x) => x.tipo === 'progreso')) {
    const actual = await leer('pendientes', p.clave);
    if (actual && actual.fecha === p.fecha) await borrarPendiente(p.clave);
  }

  estado('Actualizando este dispositivo...');
  for (const cambio of fusionBiblioteca.cambiosLocales) {
    const aplicado = await aplicarLibroRemoto(cambio.libro);
    if (!aplicado) continue; // cambiado en local durante la sincronización
    if (cambio.tipo === 'nuevo' || cambio.tipo === 'recuperado') resumen.nuevos += 1;
    if (cambio.tipo === 'baja') resumen.bajas += 1;
  }
  await guardarSincronizacion('progresoRemoto', fusionProgreso.progreso);
  await guardarSincronizacion('bibliotecaRemota', fusionBiblioteca.biblioteca);
  await guardarSincronizacion('ultima', new Date().toISOString());

  // Portadas de los libros que este dispositivo aún no tiene.
  const conPortada = new Set(await idsConPortada());
  const sinPortada = fusionBiblioteca.biblioteca.libros
    .filter((l) => !l.eliminado && l.portadaDriveId && !conPortada.has(l.id));
  for (const libro of sinPortada) {
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
  const lineas = partes.length ? [`${partes.join(', ')}.`] : [];
  if (!partes.length && !r.avisos.length) lineas.push('Todo al día.');
  return [...lineas, ...r.avisos].join('\n');
}

// Sincroniza con un token ya vigente. Si ya hay una sincronización en curso en
// esta página, devuelve la misma. Entre pestañas o con la app instalada a la
// vez, un bloqueo del navegador evita que dos sincronizaciones se solapen.
export function sincronizar(token, { alEstado } = {}) {
  if (enCurso) return enCurso;
  if (!navigator.onLine) return Promise.reject(new ErrorSinConexion());
  const inicio = performance.now();
  const tarea = () => ejecutar(token, alEstado);
  const conBloqueo = navigator.locks?.request ? navigator.locks.request('lector-epub-sincronizar', tarea) : tarea();
  enCurso = conBloqueo
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
