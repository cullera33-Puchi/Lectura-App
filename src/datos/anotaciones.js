// Anotaciones de los libros (v4): marcadores y, desde la mejora 26, subrayados
// con nota opcional. Se guardan en local como un mapa por id y viajan a Drive
// en anotaciones.json. Una baja se marca con eliminado: true para que llegue
// al otro dispositivo.

import { leerAjuste, escribirVarios, leerYEscribir } from './almacen.js';
import { fechaPosterior } from './reloj.js';

const CLAVE = 'anotaciones';
const PENDIENTE = { clave: 'anotaciones:todas', tipo: 'anotaciones' };

export async function todasLasAnotaciones() {
  return (await leerAjuste(CLAVE)) || {};
}

export async function anotacionesDeLibro(libroId, tipo) {
  return Object.values(await todasLasAnotaciones())
    .filter((a) => a.libroId === libroId && !a.eliminado && (!tipo || a.tipo === tipo));
}

async function guardarTodas(anotaciones, pendiente = true) {
  const fecha = new Date().toISOString();
  const operaciones = [{ almacen: 'ajustes', valor: anotaciones, clave: CLAVE }];
  if (pendiente) operaciones.push({ almacen: 'pendientes', valor: { ...PENDIENTE, fecha } });
  await escribirVarios(operaciones);
}

export function guardarAnotacionesFusionadas(anotaciones) {
  return guardarTodas(anotaciones, false);
}

// Cambia una anotación leyendo y escribiendo en la misma transacción, para que
// dos cambios seguidos (o uno durante una sincronización) no se pisen.
function cambiarUna(id, cambiar) {
  return leerYEscribir(['ajustes', 'pendientes'], 'ajustes', CLAVE, (todas) => {
    const nueva = cambiar((todas || {})[id]);
    if (!nueva) return null;
    const fecha = new Date().toISOString();
    return {
      resultado: nueva,
      operaciones: [
        { almacen: 'ajustes', valor: { ...(todas || {}), [id]: nueva }, clave: CLAVE },
        { almacen: 'pendientes', valor: { ...PENDIENTE, fecha } },
      ],
    };
  });
}

export async function crearMarcador(libroId, datos) {
  const id = crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return cambiarUna(id, () => ({ id, libroId, tipo: 'marcador', ...datos, fecha: new Date().toISOString(), eliminado: false }));
}

export async function eliminarAnotacion(id) {
  await cambiarUna(id, (actual) => (actual ? { ...actual, eliminado: true, fecha: fechaPosterior(actual.fecha) } : null));
}

// --- Subrayados y notas (mejora 26) ---
// { id, libroId, tipo: 'subrayado', cfi (rango), texto, color, nota,
//   capitulo, seccion, porcentaje, fecha, eliminado }

export const COLORES_SUBRAYADO = ['amarillo', 'verde', 'azul', 'rosa'];

const nuevoId = (prefijo) => (crypto.randomUUID ? crypto.randomUUID() : `${prefijo}-${Date.now()}-${Math.random().toString(16).slice(2)}`);

export function crearSubrayado(libroId, datos) {
  const id = nuevoId('s');
  return cambiarUna(id, () => ({
    id, libroId, tipo: 'subrayado', color: 'amarillo', nota: null, ...datos, fecha: new Date().toISOString(), eliminado: false,
  }));
}

// Cambia el color o la nota. La fecha es posterior a la anterior (mejora 18).
export function cambiarSubrayado(id, cambios) {
  return cambiarUna(id, (actual) => (actual && !actual.eliminado
    ? { ...actual, ...cambios, fecha: fechaPosterior(actual.fecha) } : null));
}

// Todos los subrayados vivos, de todos los libros (para la cita del día).
export async function todosLosSubrayados() {
  return Object.values(await todasLasAnotaciones()).filter((a) => a.tipo === 'subrayado' && !a.eliminado);
}
