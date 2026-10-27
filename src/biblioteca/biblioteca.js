// Pantalla de biblioteca (punto 7 del diseño).

import {
  listarLibros, urlPortada, eliminarLibro, quitarArchivoLocal,
} from '../datos/libros.js';
import { cambiarEstado } from '../datos/progreso.js';
import { leerAjuste, guardarAjuste } from '../datos/almacen.js';
import { listarPendientes, leerSincronizacion } from '../datos/pendientes.js';
import { perfilActual, nombreDispositivo } from '../datos/preferencias.js';
import { asegurarToken } from '../sync/google.js';
import { descargarLibro, MENSAJE_SIN_CONEXION } from '../sync/sincronizar.js';
import { importarArchivo } from './importar.js';
import { mostrarHoja } from '../ui/hoja.js';
import { registrar } from '../ui/registro.js';

const $ = (id) => document.getElementById(id);

const vista = { orden: 'ultimo', filtro: 'todos' };
const descargando = new Map(); // id -> avance de 0 a 1
let alAbrirLibro = () => {};

function estadoDe(libro) {
  return libro.progreso?.estado || 'pendiente';
}

function fechaCorta(iso) {
  const fecha = new Date(iso);
  const opciones = { day: 'numeric', month: 'short' };
  if (fecha.getFullYear() !== new Date().getFullYear()) opciones.year = 'numeric';
  return fecha.toLocaleDateString('es-ES', opciones);
}

function textoEstado(libro) {
  const p = libro.progreso;
  const estado = estadoDe(libro);
  if (estado === 'pendiente' || !p) return 'Sin empezar';
  const avance = estado === 'terminado'
    ? 'Terminado'
    : (p.porcentaje != null ? `${Math.round(p.porcentaje * 100)} %` : 'Leyendo');
  const donde = p.dispositivo ? `${p.dispositivo}, ` : '';
  return `${avance}. ${donde}${fechaCorta(p.fecha)}`;
}

function comparar(a, b) {
  const texto = (x) => (x || '').toLocaleLowerCase('es');
  if (vista.orden === 'titulo') return texto(a.titulo).localeCompare(texto(b.titulo), 'es');
  if (vista.orden === 'autor') {
    return texto(a.autor).localeCompare(texto(b.autor), 'es') || texto(a.titulo).localeCompare(texto(b.titulo), 'es');
  }
  const fecha = (l) => l.progreso?.fecha || l.fechaAlta;
  return fecha(b).localeCompare(fecha(a));
}

// Libros con el progreso más reciente entre el local y el último sincronizado,
// y con su estado de descarga.
async function librosParaMostrar() {
  const [libros, copiaRemota, pendientes] = await Promise.all([
    listarLibros(),
    leerSincronizacion('progresoRemoto'),
    listarPendientes(),
  ]);
  const remoto = copiaRemota?.progreso || {};
  const porSubir = new Set(pendientes.filter((p) => p.tipo === 'subirLibro').map((p) => p.id));
  return libros.map((l) => {
    const r = remoto[l.id];
    const progreso = r && (!l.progreso || (r.fecha || '') > (l.progreso.fecha || '')) ? { ...r, id: l.id } : l.progreso;
    return { ...l, progreso, pendienteSubir: porSubir.has(l.id) };
  });
}

function insignia(libro) {
  if (descargando.has(libro.id)) return null;
  if (libro.noDisponible) return 'No disponible';
  if (!libro.descargado) return '☁ En la nube';
  if (libro.pendienteSubir) return '↑ Pendiente de subir';
  return null;
}

async function crearElementoLibro(libro, enLista) {
  const elemento = document.createElement('article');
  elemento.className = 'libro';
  elemento.dataset.id = libro.id;
  if (!libro.descargado) elemento.classList.add('en-nube');
  if (libro.noDisponible) elemento.classList.add('no-disponible');

  const abrir = document.createElement('button');
  abrir.type = 'button';
  abrir.className = 'libro-abrir';
  abrir.setAttribute('aria-label', `Abrir ${libro.titulo}`);

  const url = await urlPortada(libro.id);
  let portada;
  if (url) {
    portada = document.createElement('img');
    portada.src = url;
    portada.alt = '';
    portada.loading = 'lazy';
  } else {
    portada = document.createElement('div');
    portada.textContent = enLista ? '' : libro.titulo;
    portada.classList.add('portada-sin-imagen');
  }
  portada.classList.add('portada');

  const texto = document.createElement('div');
  texto.className = 'libro-texto';
  const titulo = document.createElement('div');
  titulo.className = 'libro-titulo';
  titulo.textContent = libro.titulo;
  const autor = document.createElement('div');
  autor.className = 'libro-autor';
  autor.textContent = libro.autor || 'Autor desconocido';
  const estado = document.createElement('div');
  estado.className = 'libro-estado';
  estado.textContent = textoEstado(libro);
  texto.append(titulo, autor, estado);

  const textoInsignia = insignia(libro);
  if (textoInsignia) {
    const marca = document.createElement('span');
    marca.className = 'insignia';
    marca.textContent = textoInsignia;
    texto.appendChild(marca);
  }
  if (descargando.has(libro.id)) {
    const barra = document.createElement('div');
    barra.className = 'barra-descarga';
    barra.setAttribute('aria-label', 'Descargando');
    const relleno = document.createElement('span');
    relleno.style.width = `${Math.round(descargando.get(libro.id) * 100)}%`;
    barra.appendChild(relleno);
    texto.appendChild(barra);
  }

  abrir.append(portada, texto);
  abrir.addEventListener('click', () => pulsarLibro(libro));

  const mas = document.createElement('button');
  mas.type = 'button';
  mas.className = 'libro-mas';
  mas.textContent = '⋯';
  mas.setAttribute('aria-label', `Acciones de ${libro.titulo}`);
  mas.addEventListener('click', () => accionesLibro(libro));

  elemento.append(abrir, mas);
  return elemento;
}

export async function pintarBiblioteca() {
  const enLista = perfilActual() === 'tinta';
  const todos = await librosParaMostrar();
  const visibles = todos
    .filter((l) => vista.filtro === 'todos' || estadoDe(l) === vista.filtro)
    .sort(comparar);

  const lista = $('lista-libros');
  lista.className = enLista ? 'lista' : 'rejilla';
  const elementos = await Promise.all(visibles.map((l) => crearElementoLibro(l, enLista)));
  lista.replaceChildren(...elementos);

  const vacia = $('biblioteca-vacia');
  vacia.hidden = visibles.length > 0;
  vacia.textContent = todos.length === 0
    ? 'Todavía no hay libros. Pulsa "Añadir libro" para importar un EPUB, o "Sincronizar" para traer los del otro dispositivo.'
    : 'No hay libros con este filtro.';

  const enNube = todos.filter((l) => !l.descargado && !l.noDisponible && l.archivoDriveId);
  $('btn-descargar-todos').hidden = !enLista || enNube.length === 0;
}

export function mostrarMensaje(texto, esError = false) {
  const caja = $('mensaje-biblioteca');
  caja.textContent = texto;
  caja.classList.toggle('error', esError);
}

function pintarAvance(id) {
  const relleno = document.querySelector(`.libro[data-id="${id}"] .barra-descarga span`);
  if (relleno) relleno.style.width = `${Math.round((descargando.get(id) || 0) * 100)}%`;
}

// Descarga varios libros con un token obtenido dentro del gesto del usuario.
async function descargar(promesaToken, libros) {
  if (!navigator.onLine) {
    mostrarMensaje(MENSAJE_SIN_CONEXION, true);
    return false;
  }
  libros.forEach((l) => descargando.set(l.id, 0));
  await pintarBiblioteca();
  let todoBien = true;
  try {
    const token = await promesaToken;
    for (const libro of libros) {
      try {
        await descargarLibro(token, libro, (avance) => {
          descargando.set(libro.id, avance);
          pintarAvance(libro.id);
        });
      } catch (e) {
        todoBien = false;
        mostrarMensaje(e.message, true);
        registrar(e.message, 'error');
      } finally {
        descargando.delete(libro.id);
      }
    }
  } catch (e) {
    todoBien = false;
    libros.forEach((l) => descargando.delete(l.id));
    mostrarMensaje(e.message, true);
    registrar(e.message, 'error');
  }
  await pintarBiblioteca();
  return todoBien;
}

function pulsarLibro(libro) {
  if (descargando.has(libro.id)) return;
  if (libro.descargado) {
    alAbrirLibro(libro.id);
    return;
  }
  if (libro.noDisponible) {
    mostrarMensaje(`"${libro.titulo}" no está disponible en Google Drive.`, true);
    return;
  }
  // Solo en la nube: se descarga y se abre. asegurarToken() va dentro del gesto.
  const promesaToken = asegurarToken();
  descargar(promesaToken, [libro]).then((bien) => {
    if (bien) alAbrirLibro(libro.id);
  });
}

async function importar(archivos) {
  const resumen = { importados: 0, duplicados: [], errores: [] };
  let n = 0;
  for (const archivo of archivos) {
    n += 1;
    mostrarMensaje(archivos.length > 1 ? `Importando ${n} de ${archivos.length}...` : `Importando ${archivo.name}...`);
    try {
      const r = await importarArchivo(archivo);
      if (r.resultado === 'importado') {
        resumen.importados += 1;
        registrar(`Importado "${r.libro.titulo}" (${r.libro.id.slice(0, 12)})`);
      } else if (r.resultado === 'duplicado') {
        resumen.duplicados.push(r.libro.titulo);
        registrar(`"${r.libro.titulo}" ya estaba en la biblioteca`);
      } else {
        resumen.errores.push(`${archivo.name}: ${r.mensaje}`);
        registrar(`${archivo.name} no se puede importar: ${r.detalle}`, 'error');
      }
    } catch (e) {
      resumen.errores.push(`${archivo.name}: ${e.message}`);
      registrar(`Error al importar ${archivo.name}: ${e.message}`, 'error');
    }
  }
  const lineas = [];
  if (resumen.importados) {
    lineas.push(`${resumen.importados === 1 ? '1 libro añadido' : `${resumen.importados} libros añadidos`}. Se subirá a Drive al pulsar Sincronizar.`);
  }
  for (const t of resumen.duplicados) lineas.push(`"${t}" ya está en la biblioteca. No se ha duplicado.`);
  lineas.push(...resumen.errores);
  mostrarMensaje(lineas.join('\n'), resumen.errores.length > 0);
  await pintarBiblioteca();
}

async function accionesLibro(libro) {
  const terminado = estadoDe(libro) === 'terminado';
  const botones = [];
  if (libro.descargado) botones.push({ id: 'abrir', texto: 'Abrir' });
  else if (!libro.noDisponible) botones.push({ id: 'abrir', texto: 'Descargar y abrir' });
  botones.push({ id: 'terminado', texto: terminado ? 'Marcar como no terminado' : 'Marcar como terminado', secundario: true });
  if (libro.descargado && libro.archivoDriveId && !libro.pendienteSubir) {
    botones.push({ id: 'quitar', texto: 'Quitar de este dispositivo', secundario: true });
  }
  botones.push({ id: 'eliminar', texto: 'Eliminar de la biblioteca', secundario: true });
  botones.push({ id: null, texto: 'Cancelar', secundario: true });

  // La descarga necesita el gesto del usuario para la ventana de Google, así
  // que se lanza desde el propio botón de la hoja.
  const eleccion = await mostrarHoja(`${libro.titulo}\n${libro.autor || ''}`.trim(), botones, {
    alPulsar: (id) => {
      if (id === 'abrir') pulsarLibro(libro);
    },
  });

  if (eleccion === 'terminado') {
    const nuevo = terminado ? (libro.progreso?.cfi ? 'leyendo' : 'pendiente') : 'terminado';
    await cambiarEstado(libro.id, nuevo, nombreDispositivo());
    registrar(`"${libro.titulo}" marcado como ${nuevo}`);
    await pintarBiblioteca();
  } else if (eleccion === 'quitar') {
    await quitarArchivoLocal(libro.id);
    registrar(`"${libro.titulo}" quitado de este dispositivo`);
    mostrarMensaje(`"${libro.titulo}" quitado de este dispositivo. Sigue en Google Drive.`);
    await pintarBiblioteca();
  } else if (eleccion === 'eliminar') {
    const confirmar = await mostrarHoja(
      `¿Eliminar "${libro.titulo}" de la biblioteca?\nSe borrará de este dispositivo y, al sincronizar, también de Google Drive y del otro dispositivo.`,
      [
        { id: 'si', texto: 'Eliminar' },
        { id: null, texto: 'Cancelar', secundario: true },
      ],
    );
    if (confirmar === 'si') {
      await eliminarLibro(libro.id);
      registrar(`"${libro.titulo}" eliminado de la biblioteca`);
      mostrarMensaje(`"${libro.titulo}" eliminado. Pulsa Sincronizar para quitarlo también de Drive.`);
      await pintarBiblioteca();
    }
  }
}

export async function prepararBiblioteca({ abrirLibro }) {
  alAbrirLibro = abrirLibro;
  Object.assign(vista, (await leerAjuste('vistaBiblioteca')) || {});
  $('orden-biblioteca').value = vista.orden;
  $('filtro-biblioteca').value = vista.filtro;

  const alCambiarVista = async () => {
    vista.orden = $('orden-biblioteca').value;
    vista.filtro = $('filtro-biblioteca').value;
    await guardarAjuste('vistaBiblioteca', { ...vista });
    await pintarBiblioteca();
  };
  $('orden-biblioteca').addEventListener('change', alCambiarVista);
  $('filtro-biblioteca').addEventListener('change', alCambiarVista);

  $('archivo-epub').addEventListener('change', async (e) => {
    const archivos = Array.from(e.target.files || []);
    e.target.value = '';
    if (archivos.length) await importar(archivos);
  });

  $('btn-descargar-todos').addEventListener('click', async () => {
    const promesaToken = asegurarToken(); // dentro del gesto
    const todos = await librosParaMostrar();
    const enNube = todos.filter((l) => !l.descargado && !l.noDisponible && l.archivoDriveId);
    const bien = await descargar(promesaToken, enNube);
    if (bien) mostrarMensaje(enNube.length === 1 ? '1 libro descargado.' : `${enNube.length} libros descargados.`);
  });
}
