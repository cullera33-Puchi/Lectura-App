// Pantalla de Ajustes: perfil, nombre, cuenta de Google, diagnóstico y registro.

import { preferencias, cambiarDispositivo, tipoDispositivo } from '../datos/preferencias.js';
import {
  estadoSesion, tokenVigente, conectarConVentana, asegurarToken, invalidarToken, cerrarSesion,
  suscribirSesion,
} from '../sync/google.js';
import { ErrorDrive } from '../sync/drive.js';
import { prepararCarpeta } from '../sync/carpeta.js';
import { registrar, suscribirRegistro, entradasRegistro, horaCorta, registroComoTexto } from './registro.js';
import { datosDiagnostico, diagnosticoComoTexto, pedirPersistencia } from './diagnostico.js';
import { pintarCopias } from './copias.js';

const $ = (id) => document.getElementById(id);
const MAX_LINEAS_REGISTRO = 150;

let operandoDrive = false;

function mostrarDrive(texto, esError = false) {
  const caja = $('resultado-drive');
  caja.textContent = texto;
  caja.classList.toggle('error', esError);
}

// Al abrir Ajustes no se muestra el resultado de una operación anterior.
export function limpiarResultadoDrive() {
  if (!operandoDrive) mostrarDrive('');
}

export function textoSesion() {
  const s = estadoSesion();
  if (!s.token) return 'Sin conectar.';
  if (tokenVigente()) return `Conectado${s.email ? ` como ${s.email}` : ''}.`;
  return 'La sesión ha caducado. Se renovará al usar Drive.';
}

function pintarSesion() {
  $('estado-sesion').textContent = textoSesion();
  $('btn-cerrar-sesion').disabled = !estadoSesion().token;
}

let pintando = false;
let repetir = false;

// Si llega una petición mientras se pinta, se repite al terminar para no
// mostrar datos desactualizados (por ejemplo, la caducidad del token).
export async function pintarDiagnostico() {
  if ($('pantalla-ajustes').hidden) return;
  if (pintando) {
    repetir = true;
    return;
  }
  pintando = true;
  try {
    const dl = $('tabla-diagnostico');
    dl.replaceChildren();
    for (const [clave, valor] of await datosDiagnostico()) {
      const dt = document.createElement('dt');
      dt.textContent = clave;
      const dd = document.createElement('dd');
      dd.textContent = valor;
      dl.append(dt, dd);
    }
  } finally {
    pintando = false;
    if (repetir) {
      repetir = false;
      pintarDiagnostico();
    }
  }
}

function pintarEntrada(entrada) {
  const li = document.createElement('li');
  li.textContent = `${horaCorta(entrada.fecha)} ${entrada.texto}`;
  if (entrada.tipo === 'error') li.className = 'error';
  const lista = $('lista-registro');
  lista.prepend(li);
  while (lista.children.length > MAX_LINEAS_REGISTRO) lista.lastElementChild.remove();
}

export function pintarAjustes() {
  const { dispositivo } = preferencias();
  const tipo = tipoDispositivo();
  document.querySelectorAll('input[name="perfil"]').forEach((r) => {
    r.checked = r.value === tipo;
  });
  $('nombre-dispositivo').value = dispositivo.dispositivo;
  $('sincronizacion-automatica').checked = dispositivo.sincronizacionAutomatica !== false;
  pintarSesion();
  pintarCopias().catch(() => {});
  pintarDiagnostico();
}

// Operación de Drive iniciada por un gesto. asegurarToken() va sin await
// previo para que la ventana de Google se abra dentro del gesto.
function conDrive(promesaToken, operacion) {
  (async () => {
    operandoDrive = true;
    try {
      mostrarDrive('Conectando con Google...');
      const token = await promesaToken;
      mostrarDrive(await operacion(token));
    } catch (e) {
      if (e instanceof ErrorDrive && e.estadoHttp === 401) {
        await invalidarToken();
        mostrarDrive('Google ha rechazado la sesión. Pulsa de nuevo para renovarla.', true);
      } else {
        mostrarDrive(e.message, true);
      }
      registrar(e.message, 'error');
    } finally {
      operandoDrive = false;
      pintarDiagnostico();
    }
  })();
}

export function prepararAjustes() {
  document.querySelectorAll('input[name="perfil"]').forEach((r) => {
    r.addEventListener('change', async () => {
      await cambiarDispositivo({ tipo: r.value });
      registrar(`Dispositivo: ${{ movil: 'Móvil', tinta: 'Tinta electrónica', ordenador: 'Ordenador' }[r.value]}`);
      pintarAjustes();
    });
  });

  $('nombre-dispositivo').addEventListener('change', async (e) => {
    const nombre = e.target.value.trim();
    if (!nombre) {
      e.target.value = preferencias().dispositivo.dispositivo;
      return;
    }
    await cambiarDispositivo({ dispositivo: nombre, nombreEditado: true });
    registrar(`Nombre del dispositivo: ${nombre}`);
  });

  $('sincronizacion-automatica').addEventListener('change', async (e) => {
    await cambiarDispositivo({ sincronizacionAutomatica: e.target.checked });
    registrar(`Sincronización automática ${e.target.checked ? 'activada' : 'desactivada'}`);
  });

  $('btn-conectar').addEventListener('click', () => {
    conDrive(conectarConVentana(), prepararCarpeta);
  });

  $('btn-probar-drive').addEventListener('click', () => {
    const renovando = Boolean(estadoSesion().token) && !tokenVigente();
    conDrive(asegurarToken(), async (token) => {
      const texto = await prepararCarpeta(token);
      return renovando ? `Sesión renovada. ${texto}` : texto;
    });
  });

  $('btn-cerrar-sesion').addEventListener('click', async () => {
    await cerrarSesion();
    mostrarDrive('Sesión cerrada en este dispositivo.');
  });

  entradasRegistro().reverse().forEach(pintarEntrada);
  suscribirRegistro(pintarEntrada);

  $('btn-actualizar-diagnostico').addEventListener('click', pintarDiagnostico);
  $('btn-prueba-guiada').addEventListener('click', async () => {
    const { abrirPruebaGuiada } = await import('./prueba-guiada.js');
    await abrirPruebaGuiada();
  });

  $('btn-persistir').addEventListener('click', async () => {
    const resultado = await pedirPersistencia();
    registrar(`navigator.storage.persist(): ${resultado}`);
    pintarDiagnostico();
  });

  $('btn-copiar').addEventListener('click', async () => {
    const texto = `${diagnosticoComoTexto(await datosDiagnostico())}\n\nRegistro:\n${registroComoTexto()}`;
    try {
      await navigator.clipboard.writeText(texto);
      registrar('Diagnóstico copiado al portapapeles');
    } catch {
      const area = $('texto-copiar');
      area.value = texto;
      area.hidden = false;
      area.select();
      registrar('No se pudo copiar automáticamente. Selecciona el texto del recuadro.');
    }
  });

  suscribirSesion(() => {
    pintarSesion();
    pintarDiagnostico();
    // Sesión renovada (por ejemplo, con el botón Sincronizar): fuera el error antiguo.
    if (tokenVigente() && $('resultado-drive').classList.contains('error')) limpiarResultadoDrive();
  });
}
