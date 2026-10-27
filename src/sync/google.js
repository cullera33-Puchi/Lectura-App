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
const MARGEN_CADUCIDAD_MS = 60 * 1000;

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
  try {
    await cargarGis();
    clienteToken = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.clientId,
      scope: PERMISO_DRIVE,
      callback: alRecibirRespuestaGis,
      error_callback: alFallarGis,
    });
    estado.gisCargada = true;
    registrar('Google Identity Services cargado');
  } catch (e) {
    registrar(`No se pudo cargar Google Identity Services: ${e.message}`, 'error');
  }
  avisar();
}

function cargarGis() {
  return new Promise((resolver, rechazar) => {
    if (window.google?.accounts?.oauth2) return resolver();
    const script = document.createElement('script');
    script.src = URL_GIS;
    script.async = true;
    script.onload = () => resolver();
    script.onerror = () => rechazar(new Error('sin conexión o bloqueado'));
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
    return Promise.reject(new Error('No se ha podido cargar el login de Google. Comprueba la conexión y recarga la página.'));
  }
  if (peticionEnCurso) peticionEnCurso.rechazar(new Error('Sustituida por una nueva petición'));
  const promesa = new Promise((resolver, rechazar) => {
    peticionEnCurso = { resolver, rechazar };
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
