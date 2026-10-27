// Datos para las estadísticas: sesiones de este dispositivo (base local) y de
// los demás (copia de la última sincronización), libros terminados y objetivo.

import { listarSesiones } from '../datos/sesiones.js';
import { listarProgresos } from '../datos/progreso.js';
import { leerSincronizacion } from '../datos/pendientes.js';
import { leerObjetivos } from '../datos/colecciones.js';
import { idDispositivo, nombreDispositivo } from '../datos/preferencias.js';
import { calcularEstadisticas } from './calculo.js';
import { alEscribir } from '../datos/almacen.js';

// Sesiones de todos los dispositivos, con el nombre de cada uno. Se guardan en
// memoria hasta que cambian las sesiones o llega una sincronización: Leyendo
// ahora, Estadísticas y la ficha las piden a menudo y con mucho histórico la
// lectura completa se nota. El resultado no se debe modificar.
let enMemoria = null; // { nombre, promesa }

alEscribir((almacenes) => {
  if (almacenes.includes('sesiones') || almacenes.includes('sincronizacion')) enMemoria = null;
});

export function todasLasSesiones() {
  const nombre = nombreDispositivo();
  if (!enMemoria || enMemoria.nombre !== nombre) {
    const promesa = leerTodasLasSesiones();
    enMemoria = { nombre, promesa };
    promesa.catch(() => { if (enMemoria?.promesa === promesa) enMemoria = null; });
  }
  return enMemoria.promesa;
}

async function leerTodasLasSesiones() {
  const [propias, remotas] = await Promise.all([listarSesiones(), leerSincronizacion('sesionesRemotas')]);
  const propio = idDispositivo();
  const sesiones = propias.map((s) => ({ ...s, dispositivo: nombreDispositivo() }));
  for (const [id, copia] of Object.entries(remotas || {})) {
    if (id === propio) continue; // las propias ya están en la base local
    for (const s of copia.sesiones || []) sesiones.push({ ...s, dispositivo: copia.dispositivo });
  }
  return sesiones;
}

// Libros terminados, con el estado más reciente entre este dispositivo y el otro.
export async function librosTerminados() {
  const [progresos, copiaProgreso] = await Promise.all([listarProgresos(), leerSincronizacion('progresoRemoto')]);
  const masReciente = new Map();
  for (const [id, p] of Object.entries(copiaProgreso?.progreso || {})) masReciente.set(id, p);
  for (const p of progresos) {
    const otro = masReciente.get(p.id);
    if (!otro || (p.fecha || '') > (otro.fecha || '')) masReciente.set(p.id, p);
  }
  return [...masReciente.entries()]
    .filter(([, p]) => p.estado === 'terminado')
    .map(([libroId, p]) => ({ libroId, fecha: p.fechaTerminado || p.fecha }))
    .filter((t) => t.fecha);
}

export async function obtenerEstadisticas(ahora = new Date()) {
  const [sesiones, terminados, objetivos] = await Promise.all([todasLasSesiones(), librosTerminados(), leerObjetivos()]);
  const anio = ahora.getFullYear();
  return calcularEstadisticas({
    sesiones, terminados, objetivo: objetivos?.[anio]?.libros || null, metaDiaria: objetivos?.diario?.minutos || null, ahora,
  });
}
