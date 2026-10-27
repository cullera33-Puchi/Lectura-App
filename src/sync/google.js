// Sesión de Google con el permiso drive.file.
//
// Método principal: Google Identity Services, modelo de token (ventana emergente).
// Método alternativo (plan B, solo para la fase 0): flujo implícito de OAuth 2.0
// por redirección de página completa, por si la ventana emergente falla con la
// app instalada en la pantalla de inicio del iPhone.
//
// Importante: la ventana emergente solo se abre si se pide dentro del gesto del
// usuario. Por eso asegurarToken() comprueba la caducidad de forma síncrona y
// llama a Google sin ningún await previo.

import { CONFIG } from '../../config.js';
import { leerAjuste, guardarAjuste, borrarAjuste } from '../datos/almacen.js';
import { registrar } from '../ui/registro.js';

export const PERMISO_DRIVE = 'https://www.googleapis.com/auth/drive.file';
const URL_GIS = 'https://accounts.google.com/gsi/client';
const URL_AUTORIZACION = 'https://accounts.google.com/o/oauth2/v2/auth';
const MARGEN_CADUCIDAD_MS = 60 * 1000;

const estado = {
  token: null,
  caduca: 0, // milisegundos desde época
  metodo: null, // 'emergente' o 'redireccion'
  email: null,
  gisCargada: false,
  ultimoIntento: null, // { fecha, metodo, resultado }
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

export function urlRedireccion() {
  // Sin index.html, sin parámetros y sin fragmento. Debe coincidir con la URI
  // registrada en Google Cloud.
  return new URL('.', location.href).href;
}

async function guardarSesion() {
  await guardarAjuste('sesionGoogle', {
    token: estado.token,
    caduca: estado.caduca,
    metodo: estado.metodo,
    email: estado.email,
  });
}

function anotarIntento(metodo, resultado) {
  estado.ultimoIntento = { fecha: new Date(), metodo, resultado };
  guardarAjuste('ultimoIntentoGoogle', estado.ultimoIntento).catch(() => {});
}

function aceptarToken(accessToken, expiraEnSegundos, metodo) {
  estado.token = accessToken;
  estado.caduca = Date.now() + Number(expiraEnSegundos) * 1000;
  estado.metodo = metodo;
  anotarIntento(metodo, 'correcto');
  guardarSesion().catch((e) => registrar(`No se pudo guardar la sesión: ${e}`, 'error'));
  registrar(`Token recibido (${metodo}). Caduca a las ${new Date(estado.caduca).toLocaleTimeString('es-ES')}`);
  avisar();
}

export async function fijarEmail(email) {
  if (!email || email === estado.email) return;
  estado.email = email;
  await guardarSesion();
  avisar();
}

// Arranque: recupera la sesión guardada, procesa el retorno de una redirección
// y carga Google Identity Services.
export async function iniciarSesionGoogle() {
  const guardada = await leerAjuste('sesionGoogle');
  if (guardada) Object.assign(estado, guardada);
  const intento = await leerAjuste('ultimoIntentoGoogle');
  if (intento) estado.ultimoIntento = intento;

  await procesarRetornoRedireccion();
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
    anotarIntento('emergente', `error: ${respuesta.error}`);
    registrar(`Google devolvió un error: ${respuesta.error} ${respuesta.error_description || ''}`, 'error');
    pendiente?.rechazar(new Error(`Google: ${respuesta.error}`));
    avisar();
    return;
  }
  if (!google.accounts.oauth2.hasGrantedAllScopes(respuesta, PERMISO_DRIVE)) {
    anotarIntento('emergente', 'permiso de Drive no concedido');
    registrar('No se ha concedido el permiso de Drive. Marca la casilla de Drive al autorizar.', 'error');
    pendiente?.rechazar(new Error('Permiso de Drive no concedido'));
    avisar();
    return;
  }
  aceptarToken(respuesta.access_token, respuesta.expires_in, 'emergente');
  pendiente?.resolver(estado.token);
}

function alFallarGis(error) {
  const pendiente = peticionEnCurso;
  peticionEnCurso = null;
  // Tipos documentados: popup_failed_to_open, popup_closed, unknown.
  anotarIntento('emergente', `fallo: ${error.type}`);
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

// Plan B: redirección de página completa. La página se descarga y vuelve con
// el token en el fragmento de la URL.
export async function conectarConRedireccion() {
  if (!CONFIG.clientId) throw new Error('Falta el ID de cliente OAuth en config.js');
  const valorEstado = crypto.getRandomValues(new Uint32Array(4)).join('-');
  await guardarAjuste('estadoOAuth', valorEstado);
  const parametros = new URLSearchParams({
    client_id: CONFIG.clientId,
    redirect_uri: urlRedireccion(),
    response_type: 'token',
    scope: PERMISO_DRIVE,
    include_granted_scopes: 'true',
    state: valorEstado,
  });
  if (estado.email) parametros.set('login_hint', estado.email);
  registrar('Redirigiendo a Google (plan B)');
  location.assign(`${URL_AUTORIZACION}?${parametros}`);
  return new Promise(() => {}); // la página se va a descargar
}

async function procesarRetornoRedireccion() {
  if (!location.hash.includes('access_token=') && !location.hash.includes('error=')) return;
  const datos = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);

  const esperado = await leerAjuste('estadoOAuth');
  await borrarAjuste('estadoOAuth');
  if (!esperado || datos.get('state') !== esperado) {
    anotarIntento('redireccion', 'estado no coincide');
    registrar('Respuesta de Google descartada: el parámetro state no coincide', 'error');
    return;
  }
  if (datos.get('error')) {
    anotarIntento('redireccion', `error: ${datos.get('error')}`);
    registrar(`Google devolvió un error: ${datos.get('error')}`, 'error');
    return;
  }
  const permisos = (datos.get('scope') || '').split(' ');
  if (!permisos.includes(PERMISO_DRIVE)) {
    anotarIntento('redireccion', 'permiso de Drive no concedido');
    registrar('No se ha concedido el permiso de Drive. Marca la casilla de Drive al autorizar.', 'error');
    return;
  }
  aceptarToken(datos.get('access_token'), datos.get('expires_in'), 'redireccion');
}

// Devuelve un token vigente. Si ha caducado, lo renueva con el mismo método
// con el que se obtuvo. Llamar al principio del manejador del gesto.
export function asegurarToken() {
  if (tokenVigente()) return Promise.resolve(estado.token);
  if (estado.token) registrar('El token ha caducado. Se renueva.');
  if (estado.metodo === 'redireccion') return conectarConRedireccion();
  return conectarConVentana();
}

// Solo para pruebas: marca el token como caducado sin esperar una hora.
export async function forzarCaducidad() {
  if (!estado.token) return;
  estado.caduca = Date.now() - 1000;
  await guardarSesion();
  registrar('Token marcado como caducado (prueba)');
  avisar();
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
  Object.assign(estado, { token: null, caduca: 0, metodo: null, email: null });
  await borrarAjuste('sesionGoogle');
  registrar('Sesión cerrada en este dispositivo');
  avisar();
}
