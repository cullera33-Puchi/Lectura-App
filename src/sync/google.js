// Sesión de Google con el permiso drive.file, con Google Identity Services
// (modelo de token, ventana emergente). Validado en la fase 0 en el iPhone
// instalado y en la tablet.
//
// Importante: la ventana emergente solo se abre si se pide dentro del gesto del
// usuario. Por eso asegurarToken() comprueba la caducidad de forma síncrona y
// llama a Google sin ningún await previo.

import { CONFIG } from '../../config.js';
import { leerAjuste, guardarAjuste, borrarAjuste } from '../datos/almacen.js';
import { registrar } from '../ui/registro.js';

export const PERMISO_DRIVE = 'https://www.googleapis.com/auth/drive.file';
const URL_GIS = 'https://accounts.google.com/gsi/client';
// Se renueva el token si le quedan menos de 10 minutos, para que no caduque a
// mitad de una sincronización larga (la renovación necesita el gesto del usuario).
const MARGEN_CADUCIDAD_MS = 10 * 60 * 1000;
// Si la ventana de Google se cierra sin avisar (puede pasar en iOS), la espera
// del token se corta pasado este tiempo.
const ESPERA_MAXIMA_VENTANA_MS = 3 * 60 * 1000;

const estado = {
  token: null,
  caduca: 0, // milisegundos desde época
  email: null,
  gisCargada: false,
  ultimoIntento: null, // { fecha, resultado }
};

let clienteToken = null;
let peticionEnCurso = null;
const oyentes = new Set();

export function estadoSesion() {
  return { ...estado };
}

export function suscribirSesion(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

function avisar() {
  oyentes.forEach((fn) => fn(estadoSesion()));
}

export function tokenVigente() {
  return Boolean(estado.token) && Date.now() < estado.caduca - MARGEN_CADUCIDAD_MS;
}

async function guardarSesion() {
  await guardarAjuste('sesionGoogle', {
    token: estado.token,
    caduca: estado.caduca,
    email: estado.email,
  });
}

function anotarIntento(resultado) {
  estado.ultimoIntento = { fecha: new Date(), resultado };
  guardarAjuste('ultimoIntentoGoogle', estado.ultimoIntento).catch(() => {});
}

function aceptarToken(accessToken, expiraEnSegundos) {
  estado.token = accessToken;
  estado.caduca = Date.now() + Number(expiraEnSegundos) * 1000;
  anotarIntento('correcto');
  guardarSesion().catch((e) => registrar(`No se pudo guardar la sesión: ${e}`, 'error'));
  registrar(`Token recibido. Caduca a las ${new Date(estado.caduca).toLocaleTimeString('es-ES')}`);
  avisar();
}

export async function fijarEmail(email) {
  if (!email || email === estado.email) return;
  estado.email = email;
  await guardarSesion();
  avisar();
}

// Arranque: recupera la sesión guardada y carga Google Identity Services.
export async function iniciarSesionGoogle() {
  const guardada = await leerAjuste('sesionGoogle');
  if (guardada) Object.assign(estado, guardada);
  const intento = await leerAjuste('ultimoIntentoGoogle');
  if (intento) estado.ultimoIntento = intento;

  avisar();

  if (!CONFIG.clientId) {
    registrar('Falta el ID de cliente OAuth en config.js', 'error');
    return;
  }
  await prepararClienteGis();
  // Si se arrancó sin conexión, se vuelve a intentar al recuperarla o al
  // volver a la app (en modo instalado no hay botón de recargar).
  window.addEventListener('online', prepararClienteGis);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') prepararClienteGis();
  });
}

let preparando = null;

function prepararClienteGis() {
  if (clienteToken || !CONFIG.clientId || !navigator.onLine) return Promise.resolve();
  if (preparando) return preparando;
  preparando = cargarGis()
    .then(() => {
      clienteToken = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.clientId,
        scope: PERMISO_DRIVE,
        callback: alRecibirRespuestaGis,
        error_callback: alFallarGis,
      });
      estado.gisCargada = true;
      registrar('Google Identity Services cargado');
    })
    .catch((e) => registrar(`No se pudo cargar Google Identity Services: ${e.message}`, 'error'))
    .finally(() => {
      preparando = null;
      avisar();
    });
  return preparando;
}

function cargarGis() {
  return new Promise((resolver, rechazar) => {
    if (window.google?.accounts?.oauth2) return resolver();
    const script = document.createElement('script');
    script.src = URL_GIS;
    script.async = true;
    script.onload = () => resolver();
    script.onerror = () => {
      script.remove(); // permite reintentarlo más tarde
      rechazar(new Error('sin conexión o bloqueado'));
    };
    document.head.appendChild(script);
  });
}

function alRecibirRespuestaGis(respuesta) {
  const pendiente = peticionEnCurso;
  peticionEnCurso = null;
  if (respuesta.error) {
    anotarIntento(`error: ${respuesta.error}`);
    registrar(`Google devolvió un error: ${respuesta.error} ${respuesta.error_description || ''}`, 'error');
    pendiente?.rechazar(new Error(`Google: ${respuesta.error}`));
    avisar();
    return;
  }
  if (!google.accounts.oauth2.hasGrantedAllScopes(respuesta, PERMISO_DRIVE)) {
    anotarIntento('permiso de Drive no concedido');
    registrar('No se ha concedido el permiso de Drive. Marca la casilla de Drive al autorizar.', 'error');
    pendiente?.rechazar(new Error('Permiso de Drive no concedido'));
    avisar();
    return;
  }
  aceptarToken(respuesta.access_token, respuesta.expires_in);
  pendiente?.resolver(estado.token);
}

function alFallarGis(error) {
  const pendiente = peticionEnCurso;
  peticionEnCurso = null;
  // Tipos documentados: popup_failed_to_open, popup_closed, unknown.
  anotarIntento(`fallo: ${error.type}`);
  registrar(`Fallo en la ventana de Google: ${error.type}${error.message ? ` (${error.message})` : ''}`, 'error');
  pendiente?.rechazar(new Error(`Ventana de Google: ${error.type}`));
  avisar();
}

// Abre la ventana de Google. Llamar sin ningún await previo dentro del gesto.
export function conectarConVentana() {
  if (!CONFIG.clientId) {
    return Promise.reject(new Error('Falta el ID de cliente de Google en config.js. La conexión con Drive no funcionará hasta configurarlo.'));
  }
  if (!clienteToken) {
    prepararClienteGis();
    return Promise.reject(new Error(navigator.onLine
      ? 'El login de Google todavía se está cargando. Inténtalo de nuevo en unos segundos.'
      : 'Sin conexión. Se sincronizará cuando vuelvas a pulsar con conexión.'));
  }
  if (peticionEnCurso) peticionEnCurso.rechazar(new Error('Sustituida por una nueva petición'));
  const promesa = new Promise((resolver, rechazar) => {
    const temporizador = setTimeout(() => {
      if (peticionEnCurso?.temporizador !== temporizador) return;
      peticionEnCurso = null;
      anotarIntento('sin respuesta de la ventana');
      rechazar(new Error('La ventana de Google no ha respondido. Inténtalo de nuevo.'));
      avisar();
    }, ESPERA_MAXIMA_VENTANA_MS);
    peticionEnCurso = {
      temporizador,
      resolver: (v) => { clearTimeout(temporizador); resolver(v); },
      rechazar: (e) => { clearTimeout(temporizador); rechazar(e); },
    };
  });
  registrar(estado.token ? 'Renovando el token con la ventana de Google' : 'Abriendo la ventana de Google');
  const opciones = { prompt: '' };
  if (estado.email) opciones.login_hint = estado.email;
  clienteToken.requestAccessToken(opciones);
  return promesa;
}

// Devuelve un token vigente. Si ha caducado, lo renueva. Llamar al principio
// del manejador del gesto.
export function asegurarToken() {
  if (tokenVigente()) return Promise.resolve(estado.token);
  if (estado.token) registrar('El token ha caducado. Se renueva.');
  return conectarConVentana();
}

// El token sigue en memoria pero Google lo rechaza (401).
export async function invalidarToken() {
  estado.caduca = 0;
  await guardarSesion();
  avisar();
}

export async function cerrarSesion() {
  const token = estado.token;
  if (token && window.google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(token, () => registrar('Permiso revocado en Google'));
  }
  Object.assign(estado, { token: null, caduca: 0, email: null });
  await borrarAjuste('sesionGoogle');
  registrar('Sesión cerrada en este dispositivo');
  avisar();
}
