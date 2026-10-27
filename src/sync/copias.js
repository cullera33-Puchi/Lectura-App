// Copias de seguridad de avances y estadísticas (no de los EPUB).
//
// Una copia es un JSON con los datos de libros, colecciones, objetivos,
// posiciones y sesiones de todos los dispositivos, tal como los conoce este
// dispositivo tras la última sincronización.
// - Automática: cada día, en la primera sincronización, se crea en la
//   subcarpeta "copias" de Drive un copia-AAAA-MM-DD.json. Nunca se
//   sobrescribe. Se conservan las 30 últimas diarias y la primera de cada mes
//   durante 12 meses; las demás van a la papelera de Drive.
// - Manual: desde Ajustes se descarga el mismo archivo.
// - Restaurar: la copia se fusiona con lo actual entrada a entrada y gana lo
//   más reciente, así que nunca se pierde un avance posterior a la copia.

import {
  localizarSubcarpeta, buscarPorPrefijo, crearJson, leerJson, enviarAPapelera,
} from './drive.js';
import {
  libroRemoto, normalizarProgreso, fusionarProgreso, fusionarColecciones, fusionarObjetivos,
} from './fusion.js';
import { todosLosLibros, leerLibro, aplicarLibroRemoto } from '../datos/libros.js';
import { listarProgresos, progresoMasReciente, guardarProgreso } from '../datos/progreso.js';
import { sesionesParaExportar, restaurarSesiones } from '../datos/sesiones.js';
import {
  leerColecciones, leerObjetivos, guardarColeccionesFusionadas, guardarObjetivosFusionados,
  marcarExtrasPendientes,
} from '../datos/colecciones.js';
import { leerSincronizacion, guardarSincronizacion } from '../datos/pendientes.js';
import { idDispositivo, nombreDispositivo } from '../datos/preferencias.js';
import { registrar } from '../ui/registro.js';

export const TIPO_COPIA = 'lector-epub-copia';
export const VERSION_COPIA = 1;
export const PREFIJO_COPIA = 'copia-';
const DIARIAS = 30;
const MESES = 12;
const NOMBRE = /^copia-(\d{4}-\d{2}-\d{2})\.json$/;

const esObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

// Fecha local en formato AAAA-MM-DD.
export function diaLocal(fecha = new Date()) {
  const dos = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

export function nombreCopia(fecha = new Date()) {
  return `${PREFIJO_COPIA}${diaLocal(fecha)}.json`;
}

// Archivos de copia que sobran: se conservan las DIARIAS fechas más recientes
// y la primera de cada uno de los últimos MESES meses. Si hay dos archivos del
// mismo día, se conserva el más reciente. Pura, para poder probarla.
export function copiasABorrar(archivos, hoy = diaLocal()) {
  const porDia = new Map();
  const sobrantes = [];
  const ordenados = [...archivos].sort((a, b) => (b.modifiedTime || '').localeCompare(a.modifiedTime || ''));
  for (const a of ordenados) {
    const m = NOMBRE.exec(a.name);
    if (!m) continue; // otros archivos de la carpeta no se tocan
    if (porDia.has(m[1])) sobrantes.push(a);
    else porDia.set(m[1], a);
  }
  const dias = [...porDia.keys()].sort().reverse();
  const conservar = new Set(dias.slice(0, DIARIAS));
  const [anioHoy, mesHoy] = hoy.split('-').map(Number);
  const indiceMes = (dia) => {
    const [a, m] = dia.split('-').map(Number);
    return (anioHoy - a) * 12 + (mesHoy - m);
  };
  const primeraDelMes = new Map();
  for (const dia of [...dias].reverse()) {
    const mes = dia.slice(0, 7);
    if (!primeraDelMes.has(mes)) primeraDelMes.set(mes, dia);
  }
  for (const dia of primeraDelMes.values()) {
    if (indiceMes(dia) < MESES) conservar.add(dia);
  }
  for (const [dia, a] of porDia) if (!conservar.has(dia)) sobrantes.push(a);
  return sobrantes;
}

// Copia con lo que sabe este dispositivo: sus datos locales y la última copia
// de Drive del otro dispositivo.
export async function construirCopia() {
  const [libros, colecciones, objetivos, progresos, progresoRemoto, propias, remotas] = await Promise.all([
    todosLosLibros(),
    leerColecciones({ incluirEliminadas: true }),
    leerObjetivos(),
    listarProgresos(),
    leerSincronizacion('progresoRemoto'),
    sesionesParaExportar(),
    leerSincronizacion('sesionesRemotas'),
  ]);
  const progreso = fusionarProgreso(progresos, normalizarProgreso(progresoRemoto)).progreso.progreso;
  const propio = idDispositivo();
  const sesiones = { [propio]: { dispositivo: nombreDispositivo(), sesiones: propias } };
  for (const [id, copia] of Object.entries(remotas || {})) {
    if (id !== propio) sesiones[id] = { dispositivo: copia.dispositivo || id, sesiones: copia.sesiones || [] };
  }
  return {
    tipo: TIPO_COPIA,
    version: VERSION_COPIA,
    fecha: new Date().toISOString(),
    origen: { dispositivoId: propio, dispositivo: nombreDispositivo() },
    libros: libros.filter((l) => !l.eliminado).map(libroRemoto),
    colecciones,
    objetivos,
    progreso,
    sesiones,
  };
}

// Resumen legible de una copia, para confirmar antes de restaurar.
export function resumenCopia(copia) {
  const fecha = new Date(copia.fecha).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });
  const sesiones = Object.values(copia.sesiones).reduce((t, d) => t + d.sesiones.length, 0);
  const dispositivos = Object.values(copia.sesiones).map((d) => d.dispositivo).join(' y ');
  const n = (cuenta, uno, varios) => `${cuenta} ${cuenta === 1 ? uno : varios}`;
  return `Copia del ${fecha}, hecha en ${copia.origen?.dispositivo || 'otro dispositivo'}: `
    + `${n(copia.libros.length, 'libro', 'libros')}, ${n(Object.keys(copia.progreso).length, 'posición', 'posiciones')} `
    + `y ${n(sesiones, 'sesión de lectura', 'sesiones de lectura')}${dispositivos ? ` (${dispositivos})` : ''}.`;
}

export function normalizarCopia(datos) {
  if (!esObjeto(datos) || datos.tipo !== TIPO_COPIA) throw new Error('Este archivo no es una copia de seguridad del lector.');
  if ((Number(datos.version) || 1) > VERSION_COPIA) {
    throw new Error('La copia es de una versión más nueva de la app. Actualiza la app en este dispositivo.');
  }
  const sesiones = {};
  for (const [id, d] of Object.entries(esObjeto(datos.sesiones) ? datos.sesiones : {})) {
    if (esObjeto(d)) sesiones[id] = { dispositivo: d.dispositivo || id, sesiones: Array.isArray(d.sesiones) ? d.sesiones.filter(esObjeto) : [] };
  }
  return {
    ...datos,
    libros: (Array.isArray(datos.libros) ? datos.libros : []).filter((l) => esObjeto(l) && typeof l.id === 'string'),
    colecciones: Array.isArray(datos.colecciones) ? datos.colecciones : [],
    objetivos: esObjeto(datos.objetivos) ? datos.objetivos : {},
    progreso: esObjeto(datos.progreso) ? datos.progreso : {},
    sesiones,
  };
}

// Fusiona una copia con los datos actuales. Lo restaurado queda pendiente de
// sincronizar y llega al otro dispositivo. Las sesiones de otro dispositivo no
// se escriben aquí (cada dispositivo solo escribe su archivo de sesiones): se
// recuperan restaurando la misma copia en ese dispositivo.
export async function restaurarCopia(datos) {
  const copia = normalizarCopia(datos);
  const r = { libros: 0, posiciones: 0, sesiones: 0, extras: false, otrosDispositivos: [] };

  for (const libro of copia.libros) {
    if (libro.eliminado) continue;
    const local = await leerLibro(libro.id);
    if (local && (local.fechaModificacion || '') >= (libro.fechaModificacion || '')) continue;
    if (await aplicarLibroRemoto(libro)) r.libros += 1;
  }

  const colecciones = await leerColecciones({ incluirEliminadas: true });
  const objetivos = await leerObjetivos();
  const nuevasColecciones = fusionarColecciones(colecciones, copia.colecciones);
  const nuevosObjetivos = fusionarObjetivos(objetivos, copia.objetivos);
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (!igual(nuevasColecciones, fusionarColecciones(colecciones, [])) || !igual(nuevosObjetivos, fusionarObjetivos(objetivos, {}))) {
    await guardarColeccionesFusionadas(nuevasColecciones);
    await guardarObjetivosFusionados(nuevosObjetivos);
    await marcarExtrasPendientes();
    r.extras = true;
  }

  for (const [id, entrada] of Object.entries(copia.progreso)) {
    if (!esObjeto(entrada) || !entrada.fecha) continue;
    const actual = await progresoMasReciente(id);
    if (actual && (actual.fecha || '') >= entrada.fecha) continue;
    await guardarProgreso(id, entrada, { mantenerFecha: true });
    r.posiciones += 1;
  }

  const propio = idDispositivo();
  for (const [id, d] of Object.entries(copia.sesiones)) {
    if (id === propio) r.sesiones += await restaurarSesiones(d.sesiones, nombreDispositivo());
    else if (d.sesiones.length) r.otrosDispositivos.push(d.dispositivo);
  }
  registrar(`Copia restaurada: ${r.libros} libros, ${r.posiciones} posiciones, ${r.sesiones} sesiones${r.extras ? ', colecciones u objetivos' : ''}`);
  return r;
}

export function textoRestauracion(r) {
  const partes = [];
  if (r.libros) partes.push(`${r.libros} ${r.libros === 1 ? 'libro' : 'libros'}`);
  if (r.posiciones) partes.push(`${r.posiciones} ${r.posiciones === 1 ? 'posición' : 'posiciones'}`);
  if (r.sesiones) partes.push(`${r.sesiones} ${r.sesiones === 1 ? 'sesión de lectura' : 'sesiones de lectura'}`);
  if (r.extras) partes.push('colecciones u objetivos');
  const lineas = [partes.length
    ? `Recuperado: ${partes.join(', ')}. Sincroniza para enviarlo a Drive.`
    : 'No había nada que recuperar: los datos actuales ya incluyen todo lo de la copia o son más recientes.'];
  const otros = r.otrosDispositivos.filter((n) => n !== nombreDispositivo());
  if (otros.length) lineas.push(`Las sesiones de ${otros.join(' y ')} se recuperan restaurando esta copia también en ese dispositivo.`);
  return lineas.join('\n');
}

// --- Drive ---

export async function carpetaCopias(token, raiz) {
  return (await localizarSubcarpeta(token, raiz, 'copias')).id;
}

export async function listarCopiasDrive(token, raiz) {
  const carpeta = await carpetaCopias(token, raiz);
  const archivos = await buscarPorPrefijo(token, carpeta, PREFIJO_COPIA);
  return archivos.filter((a) => NOMBRE.test(a.name)).sort((a, b) => b.name.localeCompare(a.name));
}

export function leerCopiaDrive(token, archivoId) {
  return leerJson(token, archivoId);
}

// Copia del día. Se llama al final de cada sincronización; solo trabaja en la
// primera de cada día. Si el otro dispositivo ya la ha hecho, no se repite.
export async function copiaDiaria(token, raiz) {
  const hoy = diaLocal();
  if ((await leerSincronizacion('ultimaCopia')) === hoy) return null;
  const carpeta = await carpetaCopias(token, raiz);
  const archivos = await buscarPorPrefijo(token, carpeta, PREFIJO_COPIA);
  const nombre = nombreCopia();
  let creada = false;
  if (!archivos.some((a) => a.name === nombre)) {
    const archivo = await crearJson(token, carpeta, nombre, await construirCopia());
    archivos.push({ ...archivo, name: nombre, modifiedTime: new Date().toISOString() });
    creada = true;
    registrar(`Copia de seguridad guardada en Drive: ${nombre}`);
  }
  for (const sobrante of copiasABorrar(archivos, hoy)) {
    await enviarAPapelera(token, sobrante.id);
    registrar(`Copia antigua a la papelera de Drive: ${sobrante.name}`);
  }
  await guardarSincronizacion('ultimaCopia', hoy);
  return creada ? nombre : null;
}
