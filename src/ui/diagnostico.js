// Diagnóstico del dispositivo, accesible desde Ajustes.

import { estadoSesion, tokenVigente } from '../sync/google.js';
import { CONFIG } from '../../config.js';
import { leerSincronizacion, contarPendientes } from '../datos/pendientes.js';
import { sincronizacionAutomaticaActiva, ultimaSincronizacionAutomatica } from './sincronizacion.js';
import { resumenRitmo } from '../lector/ritmo.js';

export const VERSION_APP = '0.5.0 (copia de seguridad)';

let resultadoPersistencia = 'sin pedir';

export async function pedirPersistencia() {
  if (!navigator.storage?.persist) {
    resultadoPersistencia = 'no disponible en este navegador';
    return resultadoPersistencia;
  }
  try {
    const concedida = await navigator.storage.persist();
    resultadoPersistencia = concedida ? 'concedido (true)' : 'denegado (false)';
  } catch (e) {
    resultadoPersistencia = `error: ${e.message}`;
  }
  return resultadoPersistencia;
}

export function estaInstalada() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function nombreNavegador(ua = navigator.userAgent) {
  if (/CriOS\//.test(ua)) return 'Chrome en iOS';
  if (/FxiOS\//.test(ua)) return 'Firefox en iOS';
  if (/iPhone|iPad|iPod/.test(ua)) return 'Safari en iOS (WebKit)';
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet';
  if (/EdgA?\//.test(ua)) return 'Edge';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/; wv\)/.test(ua)) return 'WebView de Android';
  if (/Chrome\//.test(ua)) return /Android/.test(ua) ? 'Chrome o navegador Chromium en Android' : 'Chrome o Chromium';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'desconocido';
}

function formatoBytes(n) {
  if (n == null) return '?';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function textoCaducidad(sesion) {
  if (!sesion.token) return 'sin token';
  const hora = new Date(sesion.caduca).toLocaleTimeString('es-ES');
  const minutos = Math.round((sesion.caduca - Date.now()) / 60000);
  if (minutos >= 0) return `a las ${hora} (quedan ${minutos} min)`;
  return `caducado a las ${hora} (hace ${-minutos} min)`;
}

function textoSesion(sesion) {
  if (!CONFIG.clientId) return 'falta el ID de cliente en config.js';
  if (!sesion.token) return 'sin conectar';
  const quien = sesion.email ? ` como ${sesion.email}` : '';
  return `${tokenVigente() ? 'conectada' : 'token caducado'}${quien}`;
}

function textoUltimoIntento(intento) {
  if (!intento) return 'ninguno';
  const fecha = new Date(intento.fecha).toLocaleString('es-ES');
  return `${fecha}: ${intento.resultado}`;
}

export async function datosDiagnostico() {
  const sesion = estadoSesion();
  let almacenamiento = 'no disponible';
  let persistido = 'no disponible';
  if (navigator.storage?.estimate) {
    const e = await navigator.storage.estimate();
    almacenamiento = `${formatoBytes(e.usage)} usados de ${formatoBytes(e.quota)}`;
  }
  if (navigator.storage?.persisted) {
    persistido = (await navigator.storage.persisted()) ? 'sí' : 'no';
  }
  const sw = navigator.serviceWorker?.controller ? 'activo' : 'no controla esta página';
  const hora = (f) => (f ? new Date(f).toLocaleString('es-ES') : 'nunca');
  const [ultima, pendientes, ultimaCopia] = await Promise.all([leerSincronizacion('ultima'), contarPendientes(), leerSincronizacion('ultimaCopia')]);
  const automatica = sincronizacionAutomaticaActiva()
    ? `activada. Última en esta sesión de la app: ${hora(ultimaSincronizacionAutomatica())}`
    : 'desactivada';

  return [
    ['Versión de la app', VERSION_APP],
    ['Navegador', nombreNavegador(navigator.userAgent)],
    ['Agente de usuario', navigator.userAgent],
    ['Instalada en pantalla de inicio', estaInstalada() ? 'sí (standalone)' : 'no (pestaña del navegador)'],
    ['Sesión de Google', textoSesion(sesion)],
    ['Caducidad del token', textoCaducidad(sesion)],
    ['Último intento de login', textoUltimoIntento(sesion.ultimoIntento)],
    ['Google Identity Services', sesion.gisCargada ? 'cargado' : 'no cargado'],
    ['navigator.storage.persist()', resultadoPersistencia],
    ['Almacenamiento persistente ahora', persistido],
    ['Espacio', almacenamiento],
    ['Service worker', sw],
    ['Conexión', navigator.onLine ? 'en línea' : 'sin conexión'],
    ['Pantalla', `${innerWidth} x ${innerHeight} px, densidad ${devicePixelRatio}`],
    ['Tema de la interfaz', `${document.body.dataset.tema}. Barra de estado: ${document.querySelector('meta[name="theme-color"]')?.content || 'sin color'}`],
    ['Última sincronización correcta', hora(ultima)],
    ['Sincronización automática', automatica],
    ['Cambios pendientes de sincronizar', String(pendientes)],
    ['Última copia de seguridad en Drive', ultimaCopia || 'ninguna'],
    ['Ritmo de lectura', resumenRitmo()],
  ];
}

export function diagnosticoComoTexto(filas) {
  return filas.map(([k, v]) => `${k}: ${v}`).join('\n');
}
