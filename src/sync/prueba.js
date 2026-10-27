// prueba.json de la fase 0. Cada dispositivo escribe solo su entrada y el
// archivo remoto se lee y se fusiona antes de escribir, igual que harán
// biblioteca.json y progreso.json.

import { buscarArchivo, leerJson, crearJson, actualizarJson } from './drive.js';

export const NOMBRE_PRUEBA = 'prueba.json';
const VERSION = 1;

function normalizar(datos) {
  if (!datos || typeof datos !== 'object') return { version: VERSION, escrituras: {} };
  return { version: datos.version ?? VERSION, escrituras: { ...(datos.escrituras || {}) } };
}

export async function escribirPrueba(token, carpetaId, entrada) {
  const existente = await buscarArchivo(token, carpetaId, NOMBRE_PRUEBA);
  const remoto = existente ? normalizar(await leerJson(token, existente.id)) : normalizar(null);
  remoto.escrituras[entrada.dispositivo] = entrada;
  if (existente) await actualizarJson(token, existente.id, remoto);
  else await crearJson(token, carpetaId, NOMBRE_PRUEBA, remoto);
  return remoto;
}

export async function leerPrueba(token, carpetaId) {
  const existente = await buscarArchivo(token, carpetaId, NOMBRE_PRUEBA);
  if (!existente) return null;
  return { archivo: existente, datos: normalizar(await leerJson(token, existente.id)) };
}
