// Pantalla de biblioteca (punto 7 del diseño).

import { listarLibros, eliminarLibro, quitarArchivoLocal } from '../datos/libros.js';
import { cambiarEstado } from '../datos/progreso.js';
import { leerAjuste, guardarAjuste } from '../datos/almacen.js';
import { listarPendientes, leerSincronizacion } from '../datos/pendientes.js';
import { perfilActual } from '../datos/preferencias.js';
import { lectorAbierto } from '../lector/pantalla-lector.js';
import { asegurarToken, invalidarToken } from '../sync/google.js';
import { ErrorDrive } from '../sync/drive.js';
import { descargarLibro, MENSAJE_SIN_CONEXION } from '../sync/sincronizar.js';
import { importarArchivo } from './importar.js';
import {
  crearPortada, estadoDe, textoEstado, estadoCorto,
} from './portadas.js';
import { mostrarHoja, pedirValor } from '../ui/hoja.js';
import {
  leerColecciones, crearColeccion, renombrarColeccion, eliminarColeccion, alternarLibroEnColeccion,
} from '../datos/colecciones.js';
import { editarLibro } from './editar.js';
import { mostrarFichaLibro } from './ficha.js';
import { leerQuieroLeer, alternarQuieroLeer, estaEnQuieroLeer } from '../datos/quiero-leer.js';
import { mostrarAviso } from '../ui/aviso.js';
import { svgIcono } from '../ui/iconos.js';
import { registrar } from '../ui/registro.js';

const $ = (id) => document.getElementById(id);

const ORDENES = [
  { id: 'ultimo', nombre: 'Último leído' },
  { id: 'titulo', nombre: 'Título' },
  { id: 'autor', nombre: 'Autor' },
];

// grupo: null, { tipo: 'serie', valor: nombre }, { tipo: 'coleccion', valor: id }
// o { tipo: 'quiero' } (lista "Quiero leer", en su orden)
const vista = { orden: 'ultimo', filtro: 'todos', grupo: null };
let quieroIds = [];
let busqueda = '';
export const descargando = new Map(); // id -> avance de 0 a 1
let alAbrirLibro = () => {};
let refrescar = () => pintarBiblioteca();

// Texto sin mayúsculas ni tildes, para buscar.
function normalizar(texto) {
  return (texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
}

function coincideBusqueda(libro) {
  if (!busqueda) return true;
  const buscado = normalizar(busqueda);
  return [libro.titulo, libro.autor, libro.serie].some((t) => normalizar(t).includes(buscado));
}

function enGrupo(libro) {
  const g = vista.grupo;
  if (!g) return true;
  if (g.tipo === 'serie') return libro.serie === g.valor;
  if (g.tipo === 'quiero') return quieroIds.includes(libro.id);
  return (libro.colecciones || []).includes(g.valor);
}

const numeroSerie = (l) => (Number.isFinite(Number(l.numeroSerie)) ? Number(l.numeroSerie) : Infinity);

function comparar(a, b) {
  const texto = (x) => (x || '').toLocaleLowerCase('es');
  // Una serie se muestra en orden de lectura.
  if (vista.grupo?.tipo === 'serie') return numeroSerie(a) - numeroSerie(b) || texto(a.titulo).localeCompare(texto(b.titulo), 'es');
  if (vista.grupo?.tipo === 'quiero') return quieroIds.indexOf(a.id) - quieroIds.indexOf(b.id);
  if (vista.orden === 'titulo') return texto(a.titulo).localeCompare(texto(b.titulo), 'es');
  if (vista.orden === 'autor') {
    return texto(a.autor).localeCompare(texto(b.autor), 'es') || texto(a.titulo).localeCompare(texto(b.titulo), 'es');
  }
  const fecha = (l) => l.progreso?.fecha || l.fechaAlta;
  return fecha(b).localeCompare(fecha(a));
}

// Libros con el progreso más reciente entre el local y el último sincronizado,
// y con su estado de descarga.
export async function librosParaMostrar() {
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

function barraDescarga(id) {
  const barra = document.createElement('div');
  barra.className = 'barra-descarga';
  barra.setAttribute('aria-label', 'Descargando');
  const relleno = document.createElement('span');
  relleno.style.width = `${Math.round((descargando.get(id) || 0) * 100)}%`;
  barra.appendChild(relleno);
  return barra;
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

  const texto = document.createElement('div');
  texto.className = 'libro-texto';
  const titulo = document.createElement('div');
  titulo.className = 'libro-titulo';
  const enSerie = vista.grupo?.tipo === 'serie' && libro.numeroSerie != null;
  titulo.textContent = enSerie ? `${libro.numeroSerie}. ${libro.titulo}` : libro.titulo;
  const autor = document.createElement('div');
  autor.className = 'libro-autor';
  autor.textContent = libro.autor || 'Autor desconocido';
  const estado = document.createElement('div');
  estado.className = 'libro-estado';
  if (enLista) {
    // En tinta electrónica, texto completo: avance, dispositivo y fecha.
    const marcas = [];
    if (descargando.has(libro.id)) marcas.push('Descargando');
    else if (libro.noDisponible) marcas.push('No disponible');
    else if (!libro.descargado) marcas.push('En la nube');
    else if (libro.pendienteSubir) marcas.push('Pendiente de subir');
    estado.textContent = [textoEstado(libro), ...marcas].join('. ');
  } else {
    const corto = estadoCorto(libro, { descargando: descargando.has(libro.id) });
    estado.innerHTML = corto.html;
    if (corto.clase) estado.classList.add(corto.clase);
  }
  texto.append(titulo, autor, estado);
  if (descargando.has(libro.id)) texto.appendChild(barraDescarga(libro.id));

  abrir.addEventListener('click', () => pulsarLibro(libro));
  let ficha = null;
  if (enLista) {
    // En tinta, toda la fila abre el libro (objetivo grande en la tablet).
    abrir.append(await crearPortada(libro), texto);
  } else {
    // En la rejilla, la portada abre el libro y el título abre la ficha.
    abrir.appendChild(await crearPortada(libro));
    ficha = document.createElement('button');
    ficha.type = 'button';
    ficha.className = 'libro-ficha';
    ficha.setAttribute('aria-label', `Ficha de ${libro.titulo}`);
    ficha.appendChild(texto);
    ficha.addEventListener('click', () => verFicha(libro));
  }

  const mas = document.createElement('button');
  mas.type = 'button';
  mas.className = 'libro-mas';
  mas.innerHTML = svgIcono('mas_opciones');
  mas.setAttribute('aria-label', `Acciones de ${libro.titulo}`);
  mas.addEventListener('click', () => accionesLibro(libro));

  elemento.append(...[abrir, ficha, mas].filter(Boolean));
  return elemento;
}

function pintarChips() {
  document.querySelectorAll('.chip').forEach((c) => {
    const activo = c.dataset.filtro === vista.filtro;
    c.classList.toggle('activo', activo);
    c.setAttribute('aria-selected', String(activo));
  });
}

async function pintarGrupo(colecciones) {
  const caja = $('grupo-activo');
  const g = vista.grupo;
  if (!g) {
    caja.hidden = true;
    return;
  }
  const coleccion = g.tipo === 'coleccion' ? colecciones.find((c) => c.id === g.valor) : null;
  if (g.tipo === 'coleccion' && !coleccion) {
    // La colección se ha eliminado (quizá desde el otro dispositivo).
    vista.grupo = null;
    caja.hidden = true;
    return;
  }
  $('grupo-nombre').textContent = g.tipo === 'serie' ? `Serie: ${g.valor}` : (g.tipo === 'quiero' ? 'Quiero leer' : coleccion.nombre);
  $('btn-gestionar-grupo').hidden = g.tipo !== 'coleccion';
  caja.hidden = false;
}

// libros: datos ya leídos con librosParaMostrar() (si no, se leen aquí).
export async function pintarBiblioteca(libros) {
  const enLista = perfilActual() === 'tinta';
  const [todos, colecciones, quiero] = await Promise.all([libros || librosParaMostrar(), leerColecciones(), leerQuieroLeer()]);
  quieroIds = quiero.ids;
  await pintarGrupo(colecciones);
  const visibles = todos
    .filter((l) => vista.filtro === 'todos' || estadoDe(l) === vista.filtro)
    .filter(enGrupo)
    .filter(coincideBusqueda)
    .sort(comparar);

  pintarChips();
  const lista = $('lista-libros');
  lista.className = enLista ? 'lista' : 'rejilla';
  const elementos = await Promise.all(visibles.map((l) => crearElementoLibro(l, enLista)));
  lista.replaceChildren(...elementos);

  const vacia = $('biblioteca-vacia');
  vacia.hidden = visibles.length > 0;
  if (todos.length === 0) {
    vacia.textContent = 'Todavía no hay libros. Pulsa + para importar un EPUB, o sincroniza para traer los del otro dispositivo.';
  } else if (busqueda) {
    vacia.textContent = `Ningún libro coincide con "${busqueda}".`;
  } else {
    vacia.textContent = vista.grupo ? 'No hay libros en este grupo con este filtro.' : 'No hay libros con este filtro.';
  }

  const enNube = todos.filter((l) => !l.descargado && !l.noDisponible && l.archivoDriveId);
  $('btn-descargar-todos').hidden = !enLista || enNube.length === 0;
}

// --- Series y colecciones ---

async function elegirGrupo() {
  const [libros, colecciones] = await Promise.all([librosParaMostrar(), leerColecciones()]);
  const series = new Map();
  for (const l of libros) if (l.serie) series.set(l.serie, (series.get(l.serie) || 0) + 1);
  const cuenta = (n) => (n === 1 ? '1 libro' : `${n} libros`);
  const opciones = [{ id: 'todos', texto: vista.grupo ? 'Todos los libros' : 'Todos los libros \u2713' }];
  const enQuiero = (await leerQuieroLeer()).ids.filter((id) => libros.some((l) => l.id === id)).length;
  if (enQuiero) opciones.push({ id: 'quiero', texto: `Quiero leer (${cuenta(enQuiero)})${vista.grupo?.tipo === 'quiero' ? ' \u2713' : ''}` });
  for (const c of colecciones) {
    const n = libros.filter((l) => (l.colecciones || []).includes(c.id)).length;
    const marcado = vista.grupo?.tipo === 'coleccion' && vista.grupo.valor === c.id ? ' \u2713' : '';
    opciones.push({ id: `c:${c.id}`, texto: `${c.nombre} (${cuenta(n)})${marcado}` });
  }
  for (const [nombre, n] of [...series.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))) {
    const marcado = vista.grupo?.tipo === 'serie' && vista.grupo.valor === nombre ? ' \u2713' : '';
    opciones.push({ id: `s:${nombre}`, texto: `Serie: ${nombre} (${cuenta(n)})${marcado}` });
  }
  opciones.push({ id: 'nueva', texto: 'Nueva colección...' });
  const eleccion = await mostrarHoja('Colecciones y series', opciones);
  if (!eleccion) return;
  if (eleccion === 'todos') vista.grupo = null;
  else if (eleccion === 'quiero') vista.grupo = { tipo: 'quiero' };
  else if (eleccion === 'nueva') {
    const nombre = await pedirValor('Nombre de la nueva colección', '', { textoBoton: 'Crear' });
    if (!nombre) return;
    const c = await crearColeccion(nombre);
    vista.grupo = { tipo: 'coleccion', valor: c.id };
    mostrarMensaje(`Colección "${c.nombre}" creada. Añade libros desde el botón \u22EF de cada libro.`);
  } else if (eleccion.startsWith('c:')) vista.grupo = { tipo: 'coleccion', valor: eleccion.slice(2) };
  else vista.grupo = { tipo: 'serie', valor: eleccion.slice(2) };
  await guardarAjuste('vistaBiblioteca', { ...vista });
  window.scrollTo(0, 0);
  await pintarBiblioteca();
}

async function gestionarColeccion() {
  if (vista.grupo?.tipo !== 'coleccion') return;
  const coleccion = (await leerColecciones()).find((c) => c.id === vista.grupo.valor);
  if (!coleccion) return;
  const eleccion = await mostrarHoja(coleccion.nombre, [
    { id: 'renombrar', texto: 'Cambiar el nombre' },
    { id: 'eliminar', texto: 'Eliminar la colección', destructivo: true },
  ]);
  if (eleccion === 'renombrar') {
    const nombre = await pedirValor('Nuevo nombre', coleccion.nombre);
    if (nombre) await renombrarColeccion(coleccion.id, nombre);
  } else if (eleccion === 'eliminar') {
    const confirmar = await mostrarHoja(`¿Eliminar la colección "${coleccion.nombre}"? Los libros no se borran.`, [
      { id: 'si', texto: 'Eliminar', destructivo: true },
    ]);
    if (confirmar !== 'si') return;
    await eliminarColeccion(coleccion.id);
    vista.grupo = null;
    await guardarAjuste('vistaBiblioteca', { ...vista });
  }
  await pintarBiblioteca();
}

async function elegirColeccionesDeLibro(libro) {
  const colecciones = await leerColecciones();
  const actuales = new Set(libro.colecciones || []);
  const opciones = colecciones.map((c) => ({ id: c.id, texto: actuales.has(c.id) ? `${c.nombre} \u2713` : c.nombre }));
  opciones.push({ id: 'nueva', texto: 'Nueva colección...' });
  const eleccion = await mostrarHoja(`Colecciones de "${libro.titulo}"\nToca una para añadirlo o quitarlo.`, opciones);
  if (!eleccion) return;
  let id = eleccion;
  if (eleccion === 'nueva') {
    const nombre = await pedirValor('Nombre de la nueva colección', '', { textoBoton: 'Crear' });
    if (!nombre) return;
    id = (await crearColeccion(nombre)).id;
  }
  const actualizado = await alternarLibroEnColeccion(libro.id, id);
  const nombre = (await leerColecciones()).find((c) => c.id === id)?.nombre || '';
  const dentro = (actualizado?.colecciones || []).includes(id);
  mostrarMensaje(dentro ? `Añadido a "${nombre}".` : `Quitado de "${nombre}".`);
  await refrescar();
}

// Mensajes breves: se muestran como aviso flotante, visible en cualquier pestaña.
export function mostrarMensaje(texto, esError = false) {
  if (!texto) return;
  mostrarAviso(texto, esError ? 8000 : 4500);
}

function pintarAvance(id) {
  document.querySelectorAll(`[data-id="${id}"] .barra-descarga span`).forEach((relleno) => {
    relleno.style.width = `${Math.round((descargando.get(id) || 0) * 100)}%`;
  });
}

// Descarga varios libros con un token obtenido dentro del gesto del usuario.
// Un 401 deja la sesión marcada como caducada para renovarla al volver a pulsar.
async function descargar(promesaToken, libros) {
  if (!navigator.onLine) {
    mostrarMensaje(MENSAJE_SIN_CONEXION, true);
    return false;
  }
  libros.forEach((l) => descargando.set(l.id, 0));
  await refrescar();
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
        if (e instanceof ErrorDrive && e.estadoHttp === 401) {
          await invalidarToken();
          mostrarMensaje('La sesión de Google ha caducado. Pulsa de nuevo para renovarla.', true);
          break;
        }
        mostrarMensaje(e.message, true);
        registrar(e.message, 'error');
      } finally {
        descargando.delete(libro.id);
      }
    }
  } catch (e) {
    todoBien = false;
    mostrarMensaje(e.message, true);
    registrar(e.message, 'error');
  } finally {
    // También los que no se llegaron a intentar (sesión caducada a mitad).
    libros.forEach((l) => descargando.delete(l.id));
  }
  await refrescar();
  return todoBien;
}

// Abrir un libro desde la biblioteca o desde "Leyendo ahora". Si está solo en
// la nube, se descarga primero.
export function pulsarLibro(libro) {
  if (descargando.has(libro.id)) return;
  if (libro.descargado) {
    alAbrirLibro(libro.id);
    return;
  }
  if (libro.noDisponible) {
    mostrarMensaje(`"${libro.titulo}" no está disponible en Google Drive.`, true);
    return;
  }
  const promesaToken = asegurarToken(); // dentro del gesto
  descargar(promesaToken, [libro]).then((bien) => {
    // Si mientras tanto se ha abierto otro libro, no se cambia de libro.
    if (bien && !lectorAbierto()) alAbrirLibro(libro.id);
  });
}

async function importar(archivos) {
  const resumen = { importados: 0, duplicados: [], errores: [] };
  let n = 0;
  for (const archivo of archivos) {
    n += 1;
    mostrarAviso(archivos.length > 1 ? `Importando ${n} de ${archivos.length}...` : 'Importando...', 60000);
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
    lineas.push(`${resumen.importados === 1 ? '1 libro añadido' : `${resumen.importados} libros añadidos`}. Se subirá a Drive al sincronizar.`);
  }
  for (const t of resumen.duplicados) lineas.push(`"${t}" ya está en la biblioteca. No se ha duplicado.`);
  lineas.push(...resumen.errores);
  mostrarMensaje(lineas.join('\n'), resumen.errores.length > 0);
  await refrescar();
}

// Ficha del libro: sinopsis, datos de la edición y lectura.
export function verFicha(libro) {
  return mostrarFichaLibro(libro, {
    abrir: pulsarLibro,
    editar: async (l) => {
      if (await editarLibro(l)) await refrescar();
    },
    cambiado: () => refrescar(),
  });
}

export async function accionesLibro(libro) {
  const terminado = estadoDe(libro) === 'terminado';
  const botones = [];
  if (libro.descargado) botones.push({ id: 'abrir', texto: 'Abrir' });
  else if (!libro.noDisponible) botones.push({ id: 'abrir', texto: 'Descargar y abrir' });
  botones.push({ id: 'ficha', texto: 'Ficha del libro' });
  botones.push({ id: 'terminado', texto: terminado ? 'Marcar como no terminado' : 'Marcar como terminado' });
  const enQuiero = await estaEnQuieroLeer(libro.id);
  botones.push({ id: 'quiero', texto: enQuiero ? 'Quitar de Quiero leer' : 'Añadir a Quiero leer' });
  botones.push({ id: 'colecciones', texto: 'Añadir a una colección' });
  botones.push({ id: 'editar', texto: 'Editar información' });
  if (libro.descargado && libro.archivoDriveId && !libro.pendienteSubir) {
    botones.push({ id: 'quitar', texto: 'Quitar de este dispositivo' });
  }
  botones.push({ id: 'eliminar', texto: 'Eliminar de la biblioteca', destructivo: true });

  const cabecera = [libro.titulo, libro.autor, textoEstado(libro)].filter(Boolean).join('\n');
  // La descarga necesita el gesto del usuario para la ventana de Google, así
  // que se lanza desde el propio botón de la hoja.
  const eleccion = await mostrarHoja(cabecera, botones, {
    alPulsar: (id) => {
      if (id === 'abrir') pulsarLibro(libro);
    },
  });

  if (eleccion === 'ficha') {
    await verFicha(libro);
  } else if (eleccion === 'terminado') {
    const nuevo = terminado ? (libro.progreso?.cfi ? 'leyendo' : 'pendiente') : 'terminado';
    await cambiarEstado(libro.id, nuevo);
    registrar(`"${libro.titulo}" marcado como ${nuevo}`);
    await refrescar();
  } else if (eleccion === 'quiero') {
    const dentro = await alternarQuieroLeer(libro.id);
    mostrarMensaje(dentro ? `"${libro.titulo}" añadido a Quiero leer.` : `"${libro.titulo}" quitado de Quiero leer.`);
    await refrescar();
  } else if (eleccion === 'colecciones') {
    await elegirColeccionesDeLibro(libro);
  } else if (eleccion === 'editar') {
    if (await editarLibro(libro)) await refrescar();
  } else if (eleccion === 'quitar') {
    await quitarArchivoLocal(libro.id);
    registrar(`"${libro.titulo}" quitado de este dispositivo`);
    mostrarMensaje(`"${libro.titulo}" quitado de este dispositivo. Sigue en Google Drive.`);
    await refrescar();
  } else if (eleccion === 'eliminar') {
    const confirmar = await mostrarHoja(
      `¿Eliminar "${libro.titulo}" de la biblioteca?\nSe borrará de este dispositivo y, al sincronizar, también de Google Drive y del otro dispositivo.`,
      [{ id: 'si', texto: 'Eliminar', destructivo: true }],
    );
    if (confirmar === 'si') {
      await eliminarLibro(libro.id);
      registrar(`"${libro.titulo}" eliminado de la biblioteca`);
      mostrarMensaje(`"${libro.titulo}" eliminado. Sincroniza para quitarlo también de Drive.`);
      await refrescar();
    }
  }
}

async function elegirOrden() {
  const eleccion = await mostrarHoja('Ordenar por', ORDENES.map((o) => ({
    id: o.id,
    texto: o.id === vista.orden ? `${o.nombre} ✓` : o.nombre,
  })));
  if (!eleccion) return;
  vista.orden = eleccion;
  await guardarAjuste('vistaBiblioteca', { ...vista });
  await pintarBiblioteca();
}

export async function prepararBiblioteca(opciones) {
  alAbrirLibro = opciones.abrirLibro;
  if (opciones.refrescar) refrescar = opciones.refrescar;
  Object.assign(vista, (await leerAjuste('vistaBiblioteca')) || {});

  document.querySelectorAll('.chip').forEach((c) => {
    c.addEventListener('click', async () => {
      vista.filtro = c.dataset.filtro;
      await guardarAjuste('vistaBiblioteca', { ...vista });
      await pintarBiblioteca();
    });
  });
  $('btn-ordenar').addEventListener('click', elegirOrden);
  $('btn-colecciones').addEventListener('click', elegirGrupo);
  $('btn-gestionar-grupo').addEventListener('click', gestionarColeccion);
  $('btn-quitar-grupo').addEventListener('click', async () => {
    vista.grupo = null;
    await guardarAjuste('vistaBiblioteca', { ...vista });
    await pintarBiblioteca();
  });
  let temporizadorBusqueda = null;
  const campo = $('buscar-biblioteca');
  campo.addEventListener('input', () => {
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(() => {
      busqueda = campo.value.trim();
      pintarBiblioteca();
    }, 200);
  });
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') campo.blur(); // cierra el teclado
  });
  const mostrarBusqueda = (visible) => {
    $('caja-busqueda').hidden = !visible;
    $('btn-buscar').classList.toggle('activo', visible);
    $('btn-buscar').setAttribute('aria-expanded', String(visible));
    if (visible) {
      campo.focus();
    } else if (busqueda || campo.value) {
      clearTimeout(temporizadorBusqueda);
      campo.value = '';
      busqueda = '';
      pintarBiblioteca();
    }
  };
  $('btn-buscar').addEventListener('click', () => mostrarBusqueda($('caja-busqueda').hidden));
  $('btn-cerrar-busqueda').addEventListener('click', () => mostrarBusqueda(false));

  $('archivo-epub').addEventListener('change', async (e) => {
    const archivos = Array.from(e.target.files || []);
    e.target.value = '';
    if (archivos.length) await importar(archivos);
  });

  $('btn-descargar-todos').addEventListener('click', async () => {
    if (descargando.size) return; // ya hay descargas en curso
    const promesaToken = asegurarToken(); // dentro del gesto
    const todos = await librosParaMostrar();
    const enNube = todos.filter((l) => !l.descargado && !l.noDisponible && l.archivoDriveId && !descargando.has(l.id));
    const bien = await descargar(promesaToken, enNube);
    if (bien) mostrarMensaje(enNube.length === 1 ? '1 libro descargado.' : `${enNube.length} libros descargados.`);
  });
}
