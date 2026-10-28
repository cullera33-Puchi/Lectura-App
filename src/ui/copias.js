// Ajustes, Copia de seguridad: descargar una copia y restaurarla desde Drive o
// desde un archivo.

import {
  construirCopia, diaLocal, normalizarCopia, resumenCopia, restaurarCopia, textoRestauracion,
  listarCopiasDrive, leerCopiaDrive,
} from '../sync/copias.js';
import { localizarCarpeta, ErrorDrive } from '../sync/drive.js';
import { asegurarToken, invalidarToken } from '../sync/google.js';
import { leerSincronizacion, avisarCambioPendientes } from '../datos/pendientes.js';
import { mostrarHoja } from './hoja.js';
import { mostrarAviso, ocultarAviso } from './aviso.js';
import { registrar } from './registro.js';
import { conTrabajo } from './actividad.js';

const $ = (id) => document.getElementById(id);
const MAX_COPIAS_EN_LISTA = 45;
let alRestaurar = () => {};
// Copia preparada al abrir Ajustes: en iOS, compartir un archivo exige
// hacerlo justo al tocar, sin esperas previas.
let preparada = null;

function fechaLarga(dia) {
  return new Date(`${dia}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

async function archivoCopia() {
  const datos = await construirCopia();
  const nombre = `lector-epub-copia-${diaLocal()}.json`;
  return new File([JSON.stringify(datos, null, 2)], nombre, { type: 'application/json' });
}

// Se vuelve a preparar tras cada cambio con Ajustes abierto (restaurar,
// sincronizar). Una preparación antigua que termine tarde no pisa la nueva.
let generacion = 0;

export async function pintarCopias() {
  const g = ++generacion;
  preparada = null;
  archivoCopia().then((f) => { if (g === generacion) preparada = f; }).catch(() => {});
  const ultima = await leerSincronizacion('ultimaCopia');
  if (g !== generacion) return;
  $('ultima-copia').textContent = ultima ? `Última copia en Drive: ${fechaLarga(ultima)}.` : 'Todavía no hay ninguna copia en Drive: se hará en la próxima sincronización.';
}

function descargarConEnlace(archivo) {
  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = archivo.name;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function descargar() {
  const archivo = preparada || await archivoCopia();
  const esIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (esIos && navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: archivo.name });
      registrar(`Copia de seguridad compartida: ${archivo.name}`);
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // el usuario ha cerrado la hoja
      registrar(`No se pudo compartir la copia (${e.name}). Se descarga.`, 'error');
    }
  }
  descargarConEnlace(archivo);
  registrar(`Copia de seguridad descargada: ${archivo.name}`);
  mostrarAviso(`Copia descargada: ${archivo.name}`);
}

async function confirmarYRestaurar(datos) {
  let copia;
  try {
    copia = normalizarCopia(datos);
  } catch (e) {
    mostrarAviso(e.message, 8000);
    return;
  }
  const eleccion = await mostrarHoja(
    `${resumenCopia(copia)}\nSe fusiona con lo actual: solo se recupera lo que falte aquí o sea más antiguo. No se borra nada.`,
    [{ id: 'si', texto: 'Restaurar' }],
  );
  if (eleccion !== 'si') return;
  await conTrabajo(async () => { // sin recargas a mitad
    const r = await restaurarCopia(copia);
    pintarCopias().catch(() => {}); // la copia para descargar ya incluye lo restaurado
    avisarCambioPendientes();
    mostrarAviso(textoRestauracion(r), 10000);
    await alRestaurar();
  });
}

async function restaurarDesdeDrive(promesaToken) {
  try {
    mostrarAviso('Buscando copias en Drive...', 60000);
    const token = await promesaToken;
    const { carpeta } = await localizarCarpeta(token);
    const copias = await listarCopiasDrive(token, carpeta.id);
    if (!copias.length) {
      mostrarAviso('No hay copias en Drive todavía. Se crea una al sincronizar.', 6000);
      return;
    }
    ocultarAviso();
    const eleccion = await mostrarHoja('Elige la copia que quieres restaurar', copias.slice(0, MAX_COPIAS_EN_LISTA).map((a) => ({
      id: a.id, texto: fechaLarga(a.name.slice('copia-'.length, -'.json'.length)),
    })));
    if (!eleccion) return;
    mostrarAviso('Leyendo la copia...', 60000);
    const datos = await leerCopiaDrive(token, eleccion);
    ocultarAviso();
    await confirmarYRestaurar(datos);
  } catch (e) {
    if (e instanceof ErrorDrive && e.estadoHttp === 401) {
      await invalidarToken();
      mostrarAviso('La sesión de Google ha caducado. Vuelve a pulsar para renovarla.', 8000);
    } else {
      mostrarAviso(e.message, 8000);
    }
    registrar(`Restaurar desde Drive: ${e.message}`, 'error');
  }
}

export function prepararCopias({ restaurado }) {
  alRestaurar = restaurado;
  $('btn-descargar-copia').addEventListener('click', () => {
    descargar().catch((e) => {
      mostrarAviso(`No se pudo preparar la copia: ${e.message}`, 8000);
      registrar(`Descargar copia: ${e.message}`, 'error');
    });
  });
  $('btn-restaurar-copia').addEventListener('click', async () => {
    let promesaToken = null;
    // La ventana de Google y el selector de archivos se abren dentro del gesto.
    const eleccion = await mostrarHoja('Restaurar una copia de seguridad', [
      { id: 'drive', texto: 'Desde Google Drive' },
      { id: 'archivo', texto: 'Desde un archivo' },
    ], {
      alPulsar: (id) => {
        if (id === 'drive') promesaToken = asegurarToken();
        if (id === 'archivo') $('archivo-copia').click();
      },
    });
    if (eleccion === 'drive') restaurarDesdeDrive(promesaToken);
  });
  $('archivo-copia').addEventListener('change', async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    try {
      await confirmarYRestaurar(JSON.parse(await archivo.text()));
    } catch (err) {
      mostrarAviso(err instanceof SyntaxError ? 'El archivo no es un JSON válido.' : err.message, 8000);
      registrar(`Restaurar desde archivo: ${err.message}`, 'error');
    }
  });
}
