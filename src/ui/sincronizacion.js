// Botón Sincronizar (biblioteca y lector) e indicador de cambios pendientes.

import { asegurarToken } from '../sync/google.js';
import { sincronizar, sincronizando, textoResumen, MENSAJE_SIN_CONEXION } from '../sync/sincronizar.js';
import { alCambiarPendientes, avisarCambioPendientes } from '../datos/pendientes.js';
import { mostrarAviso } from './aviso.js';
import { registrar } from './registro.js';

const BOTONES = ['btn-sincronizar', 'btn-sincronizar-lector'];
let alTerminar = () => {};

function pintarIndicador(n) {
  for (const id of BOTONES) {
    const indicador = document.querySelector(`#${id} .indicador`);
    indicador.textContent = n > 99 ? '99+' : String(n);
    indicador.hidden = n === 0;
    document.getElementById(id).setAttribute('aria-label', n ? `Sincronizar (${n} cambios pendientes)` : 'Sincronizar');
  }
}

function botonesOcupados(ocupados) {
  for (const id of BOTONES) document.getElementById(id).disabled = ocupados;
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
    mostrarAviso(e.message, 8000);
    registrar(`Sincronización: ${e.message}`, 'error');
    return null;
  } finally {
    botonesOcupados(false);
    avisarCambioPendientes();
  }
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
  for (const id of BOTONES) document.getElementById(id).addEventListener('click', alPulsar);
  alCambiarPendientes(pintarIndicador);
  avisarCambioPendientes();
}
