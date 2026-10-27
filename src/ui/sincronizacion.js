// Botón Sincronizar (biblioteca y lector) e indicador de cambios pendientes.

import {
  asegurarToken, invalidarToken, tokenVigente, estadoSesion, suscribirSesion,
} from '../sync/google.js';
import { preferencias } from '../datos/preferencias.js';
import { ErrorDrive } from '../sync/drive.js';
import { sincronizar, sincronizando, textoResumen, MENSAJE_SIN_CONEXION } from '../sync/sincronizar.js';
import { alCambiarPendientes, avisarCambioPendientes } from '../datos/pendientes.js';
import { mostrarAviso } from './aviso.js';
import { registrar } from './registro.js';

// Botones Sincronizar: barras de "Leyendo ahora" y Biblioteca, y menú del lector.
const botones = () => document.querySelectorAll('.boton-sincronizar');
let alTerminar = () => {};

let pendientes = 0;

// Indicador del botón: número de cambios pendientes y, si la sesión de Google
// ha caducado, un aviso de que el siguiente toque abrirá la ventana de Google.
function pintarIndicador(n = pendientes) {
  pendientes = n;
  const caducada = Boolean(estadoSesion().token) && !tokenVigente();
  for (const b of botones()) {
    const indicador = b.querySelector('.indicador');
    indicador.textContent = n > 99 ? '99+' : (n ? String(n) : '!');
    indicador.hidden = n === 0 && !caducada;
    b.classList.toggle('sesion-caducada', caducada);
    const partes = [];
    if (n) partes.push(`${n} cambios pendientes`);
    if (caducada) partes.push('sesión de Google caducada');
    b.setAttribute('aria-label', partes.length ? `Sincronizar (${partes.join(', ')})` : 'Sincronizar');
    b.title = caducada ? 'La sesión de Google ha caducado. Pulsa para renovarla.' : '';
  }
}

function botonesOcupados(ocupados) {
  for (const b of botones()) {
    b.disabled = ocupados;
    b.classList.toggle('girando', ocupados);
  }
}

// Ejecuta la sincronización con una promesa de token ya pedida.
export async function ejecutarSincronizacion(promesaToken) {
  botonesOcupados(true);
  try {
    mostrarAviso('Conectando con Google...', 60000);
    const token = await promesaToken;
    const resumen = await sincronizar(token, { alEstado: (texto) => mostrarAviso(texto, 60000) });
    mostrarAviso(textoResumen(resumen));
    await alTerminar(resumen);
    return resumen;
  } catch (e) {
    // Sesión rechazada por Google (caducada o revocada): se marca para que el
    // siguiente toque la renueve en lugar de repetir el mismo token.
    if (e instanceof ErrorDrive && e.estadoHttp === 401) await invalidarToken();
    mostrarAviso(e.message, 8000);
    registrar(`Sincronización: ${e.message}`, 'error');
    return null;
  } finally {
    botonesOcupados(false);
    avisarCambioPendientes();
  }
}

export function sincronizacionAutomaticaActiva() {
  return preferencias().dispositivo.sincronizacionAutomatica !== false;
}

const HAY_CAMBIOS = (r) => r.subidos || r.nuevos || r.bajas || r.posiciones || r.avisos.length;
let ultimaAutomatica = 0;

// Sincronización automática (v3): al abrir la app, al volver a ella y al
// cerrar un libro. Solo si está activada, hay conexión y la sesión de Google
// sigue vigente (renovarla exige un toque). No muestra nada si no hay cambios.
export async function sincronizarAutomaticamente(motivo) {
  let motivoNo = null;
  if (!sincronizacionAutomaticaActiva()) motivoNo = 'está desactivada en Ajustes';
  else if (sincronizando()) motivoNo = 'ya hay una sincronización en curso';
  else if (!navigator.onLine) motivoNo = 'no hay conexión';
  else if (!estadoSesion().token) motivoNo = 'no hay sesión de Google';
  else if (!tokenVigente()) motivoNo = 'la sesión de Google ha caducado (pulsa Sincronizar para renovarla)';
  if (motivoNo) {
    registrar(`Sincronización automática (${motivo}) no lanzada: ${motivoNo}`);
    return null;
  }
  ultimaAutomatica = Date.now();
  registrar(`Sincronización automática (${motivo}): empieza`);
  botonesOcupados(true);
  try {
    const resumen = await sincronizar(await asegurarToken());
    registrar(`Sincronización automática (${motivo}): terminada`);
    if (HAY_CAMBIOS(resumen)) mostrarAviso(textoResumen(resumen));
    await alTerminar(resumen);
    return resumen;
  } catch (e) {
    if (e instanceof ErrorDrive && e.estadoHttp === 401) await invalidarToken();
    registrar(`Sincronización automática: ${e.message}`, 'error');
    return null;
  } finally {
    botonesOcupados(false);
    avisarCambioPendientes();
  }
}

export function ultimaSincronizacionAutomatica() {
  return ultimaAutomatica ? new Date(ultimaAutomatica) : null;
}

export function minutosDesdeAutomatica() {
  return (Date.now() - ultimaAutomatica) / 60000;
}

// Manejador del botón. Todo lo que precede a asegurarToken() es síncrono para
// que la ventana de Google, si hace falta, se abra dentro del gesto.
function alPulsar() {
  if (sincronizando()) return;
  if (!navigator.onLine) {
    mostrarAviso(MENSAJE_SIN_CONEXION, 6000);
    return;
  }
  ejecutarSincronizacion(asegurarToken());
}

export function prepararSincronizacion({ terminado }) {
  alTerminar = terminado;
  for (const b of botones()) b.addEventListener('click', alPulsar);
  alCambiarPendientes(pintarIndicador);
  avisarCambioPendientes();
  // La caducidad no avisa por sí sola: se comprueba cada minuto y al volver a la app.
  suscribirSesion(() => pintarIndicador());
  setInterval(() => pintarIndicador(), 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pintarIndicador();
  });
}
