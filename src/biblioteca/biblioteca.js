// Pantalla de biblioteca (punto 7 del diseño).

import { listarLibros, urlPortada, eliminarLibro } from '../datos/libros.js';
import { cambiarEstado } from '../datos/progreso.js';
import { leerAjuste, guardarAjuste } from '../datos/almacen.js';
import { perfilActual, nombreDispositivo } from '../datos/preferencias.js';
import { importarArchivo } from './importar.js';
import { mostrarHoja } from '../ui/hoja.js';
import { registrar } from '../ui/registro.js';

const $ = (id) => document.getElementById(id);

const vista = { orden: 'ultimo', filtro: 'todos' };
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

async function crearElementoLibro(libro, enLista) {
  const elemento = document.createElement('article');
  elemento.className = 'libro';

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

  abrir.append(portada, texto);
  abrir.addEventListener('click', () => alAbrirLibro(libro.id));

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
  const todos = await listarLibros();
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
    ? 'Todavía no hay libros. Pulsa "Añadir libro" para importar un EPUB.'
    : 'No hay libros con este filtro.';
}

function mostrarMensaje(texto, esError = false) {
  const caja = $('mensaje-biblioteca');
  caja.textContent = texto;
  caja.classList.toggle('error', esError);
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
  if (resumen.importados) lineas.push(resumen.importados === 1 ? '1 libro añadido.' : `${resumen.importados} libros añadidos.`);
  for (const t of resumen.duplicados) lineas.push(`"${t}" ya está en la biblioteca. No se ha duplicado.`);
  lineas.push(...resumen.errores);
  mostrarMensaje(lineas.join('\n'), resumen.errores.length > 0);
  await pintarBiblioteca();
}

async function accionesLibro(libro) {
  const terminado = estadoDe(libro) === 'terminado';
  const eleccion = await mostrarHoja(`${libro.titulo}\n${libro.autor || ''}`.trim(), [
    { id: 'abrir', texto: 'Abrir' },
    { id: 'terminado', texto: terminado ? 'Marcar como no terminado' : 'Marcar como terminado', secundario: true },
    { id: 'eliminar', texto: 'Eliminar de la biblioteca', secundario: true },
    { id: null, texto: 'Cancelar', secundario: true },
  ]);
  if (eleccion === 'abrir') {
    alAbrirLibro(libro.id);
  } else if (eleccion === 'terminado') {
    const nuevo = terminado ? (libro.progreso?.cfi ? 'leyendo' : 'pendiente') : 'terminado';
    await cambiarEstado(libro.id, nuevo, nombreDispositivo());
    registrar(`"${libro.titulo}" marcado como ${nuevo}`);
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
      mostrarMensaje(`"${libro.titulo}" eliminado.`);
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
}
