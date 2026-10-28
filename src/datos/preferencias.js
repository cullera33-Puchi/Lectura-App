// Preferencias del dispositivo (perfil y nombre) y ajustes de lectura.
// Son por dispositivo y no se sincronizan.

import { leerAjuste, guardarAjuste } from './almacen.js';
import { ajustesLecturaIniciales } from '../ui/temas.js';

export const NOMBRE_PROPUESTO = { movil: 'iPhone', tinta: 'Note Air 4C' };

const estado = {
  dispositivo: null, // { perfil, dispositivo, nombreEditado, bienvenidaCompleta }
  lectura: null,
  porLibro: {}, // ajustes de lectura propios de algunos libros (punto 4)
  formatoPorLibro: {}, // libros que se leen con el formato del editor (mejora 28)
};
const oyentes = new Set();

export async function cargarPreferencias() {
  const dispositivo = await leerAjuste('dispositivo');
  const perfilPropuesto = /Android/.test(navigator.userAgent) ? 'tinta' : 'movil';
  estado.dispositivo = {
    perfil: perfilPropuesto,
    dispositivo: NOMBRE_PROPUESTO[perfilPropuesto],
    nombreEditado: false,
    bienvenidaCompleta: false,
    ...(dispositivo || {}),
  };
  // Identificador estable del dispositivo. El nombre se puede editar o
  // repetir; el identificador no. Sirve para reconocer lo escrito por el otro
  // dispositivo y, en la v2, para el archivo de sesiones de cada uno.
  if (!estado.dispositivo.id) {
    estado.dispositivo.id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await guardarAjuste('dispositivo', estado.dispositivo);
  }
  estado.lectura = { ...ajustesLecturaIniciales(), ...((await leerAjuste('lectura')) || {}) };
  estado.porLibro = (await leerAjuste('lecturaPorLibro')) || {};
  estado.formatoPorLibro = (await leerAjuste('formatoPorLibro')) || {};
  return preferencias();
}

export function preferencias() {
  return { dispositivo: { ...estado.dispositivo }, lectura: { ...estado.lectura } };
}

export function perfilActual() {
  return estado.dispositivo.perfil;
}

export function nombreDispositivo() {
  return estado.dispositivo.dispositivo;
}

export function idDispositivo() {
  return estado.dispositivo.id;
}

function avisar(tipo) {
  const actuales = preferencias();
  oyentes.forEach((fn) => fn(actuales, tipo));
}

export function alCambiarPreferencias(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

export async function cambiarDispositivo(cambios) {
  const nuevo = { ...estado.dispositivo, ...cambios };
  if (cambios.perfil && !nuevo.nombreEditado && !('dispositivo' in cambios)) {
    nuevo.dispositivo = NOMBRE_PROPUESTO[cambios.perfil];
  }
  estado.dispositivo = nuevo;
  await guardarAjuste('dispositivo', nuevo);
  avisar('dispositivo');
}

export async function cambiarLectura(cambios) {
  estado.lectura = { ...estado.lectura, ...cambios };
  await guardarAjuste('lectura', estado.lectura);
  avisar('lectura');
}

// --- Ajustes de lectura propios de un libro (punto 4) ---
// Un libro puede tener su propio tamaño, letra, interlineado, márgenes y
// justificación (por ejemplo, uno con maquetación especial). El tema y la
// doble página son comunes. Son de este dispositivo y no se sincronizan.
export const AJUSTES_POR_LIBRO = ['tamano', 'fuente', 'interlineado', 'margenes', 'justificacion'];

export function tieneAjustesPropios(libroId) {
  return Boolean(estado.porLibro[libroId]);
}

export function lecturaDeLibro(libroId) {
  return { ...estado.lectura, ...(estado.porLibro[libroId] || {}), formato: formatoDeLibro(libroId) };
}

// --- Formato del editor o el mío (mejora 28) ---
// "mio": se aplican la letra, el interlineado y la justificación de "Aa".
// "libro": se respetan los del EPUB; el tamaño, el tema y los márgenes de
// página siguen siendo los de "Aa". Siempre es de un libro concreto, de este
// dispositivo, y no se sincroniza.
export function formatoDeLibro(libroId) {
  return estado.formatoPorLibro[libroId] === 'libro' ? 'libro' : 'mio';
}

export async function fijarFormatoDeLibro(libroId, formato) {
  const { [libroId]: _, ...resto } = estado.formatoPorLibro;
  estado.formatoPorLibro = formato === 'libro' ? { ...resto, [libroId]: 'libro' } : resto;
  await guardarAjuste('formatoPorLibro', estado.formatoPorLibro);
  avisar('lectura');
}

async function guardarPorLibro() {
  await guardarAjuste('lecturaPorLibro', estado.porLibro);
  avisar('lectura');
}

// Al activar se parte de los ajustes actuales; al desactivar, el libro vuelve
// a los generales.
export async function activarAjustesPropios(libroId, activar) {
  if (activar) {
    const actuales = lecturaDeLibro(libroId);
    estado.porLibro = { ...estado.porLibro, [libroId]: Object.fromEntries(AJUSTES_POR_LIBRO.map((c) => [c, actuales[c]])) };
  } else {
    const { [libroId]: _, ...resto } = estado.porLibro;
    estado.porLibro = resto;
  }
  await guardarPorLibro();
}

// Cambia ajustes de lectura: los propios del libro van a su ficha de ajustes
// si los tiene; el resto, a los generales.
export async function cambiarLecturaDeLibro(libroId, cambios) {
  if (!libroId || !tieneAjustesPropios(libroId)) return cambiarLectura(cambios);
  const propios = Object.fromEntries(Object.entries(cambios).filter(([c]) => AJUSTES_POR_LIBRO.includes(c)));
  const generales = Object.fromEntries(Object.entries(cambios).filter(([c]) => !AJUSTES_POR_LIBRO.includes(c)));
  if (Object.keys(propios).length) {
    estado.porLibro = { ...estado.porLibro, [libroId]: { ...estado.porLibro[libroId], ...propios } };
    await guardarAjuste('lecturaPorLibro', estado.porLibro);
  }
  if (Object.keys(generales).length) await cambiarLectura(generales);
  else avisar('lectura');
}
