// Pestaña "Leyendo ahora": el libro en curso destacado, el resto de lecturas
// abiertas y los añadidos recientemente, como en Libros de Apple.

import { librosParaMostrar, pulsarLibro, accionesLibro, descargando } from './biblioteca.js';
import {
  crearPortada, estadoDe, porcentajeDe, textoEstado, estadoCorto,
} from './portadas.js';
import { svgIcono } from '../ui/iconos.js';
import { crearResumenObjetivos } from '../estadisticas/pantalla.js';

let alVerEstadisticas = () => {};

export function configurarInicio({ verEstadisticas }) {
  alVerEstadisticas = verEstadisticas;
}

const $ = (id) => document.getElementById(id);
const MAX_CARRUSEL = 12;

function titulo(texto) {
  const h = document.createElement('h2');
  h.className = 'seccion-titulo';
  h.textContent = texto;
  return h;
}

function barraAvance(pct) {
  const barra = document.createElement('div');
  barra.className = 'avance';
  const relleno = document.createElement('span');
  relleno.style.width = `${pct ?? 0}%`;
  barra.appendChild(relleno);
  return barra;
}

async function tarjetaActual(libro) {
  const tarjeta = document.createElement('button');
  tarjeta.type = 'button';
  tarjeta.className = 'tarjeta-actual libro';
  tarjeta.dataset.id = libro.id;
  tarjeta.setAttribute('aria-label', `Seguir leyendo ${libro.titulo}`);

  const info = document.createElement('div');
  info.className = 'tarjeta-info';
  const t = document.createElement('div');
  t.className = 't-titulo';
  t.textContent = libro.titulo;
  const a = document.createElement('div');
  a.className = 't-autor';
  a.textContent = libro.autor || '';
  const pct = porcentajeDe(libro);
  const detalle = document.createElement('div');
  detalle.className = 't-detalle';
  detalle.textContent = textoEstado(libro);
  const boton = document.createElement('span');
  boton.className = 'boton-secundario';
  boton.innerHTML = libro.descargado ? 'Seguir leyendo' : `${svgIcono('nube')} Descargar y leer`;
  info.append(t, a, barraAvance(pct), detalle, boton);

  tarjeta.append(await crearPortada(libro), info);
  tarjeta.addEventListener('click', () => pulsarLibro(libro));
  const caja = document.createElement('div');
  caja.className = 'tarjeta-actual-caja';
  caja.append(tarjeta, botonAcciones(libro));
  return caja;
}

// Botón "⋯" con las acciones del libro, como en la biblioteca.
function botonAcciones(libro) {
  const mas = document.createElement('button');
  mas.type = 'button';
  mas.className = 'libro-mas';
  mas.innerHTML = svgIcono('mas_opciones');
  mas.setAttribute('aria-label', `Acciones de ${libro.titulo}`);
  mas.addEventListener('click', () => accionesLibro(libro));
  return mas;
}

async function miniatura(libro) {
  const caja = document.createElement('div');
  caja.className = 'miniatura libro';
  caja.dataset.id = libro.id;
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'miniatura-abrir';
  boton.setAttribute('aria-label', `Abrir ${libro.titulo}`);
  boton.appendChild(await crearPortada(libro));
  boton.addEventListener('click', () => pulsarLibro(libro));
  boton.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    accionesLibro(libro);
  });
  const pie = document.createElement('div');
  pie.className = 'm-pie';
  const estado = document.createElement('span');
  estado.className = 'm-estado';
  estado.innerHTML = estadoCorto(libro, { descargando: descargando.has(libro.id) }).html;
  pie.append(estado, botonAcciones(libro));
  caja.append(boton, pie);
  return caja;
}

async function carrusel(libros) {
  const fila = document.createElement('div');
  fila.className = 'carrusel';
  fila.append(...await Promise.all(libros.slice(0, MAX_CARRUSEL).map(miniatura)));
  return fila;
}

function vacio() {
  const div = document.createElement('div');
  div.className = 'vacio-inicio';
  div.innerHTML = `${svgIcono('leyendo')}
    <h2>Nada que leer todavía</h2>
    <p>Añade un EPUB desde tus archivos o sincroniza para traer los libros del otro dispositivo.</p>
    <label class="boton-principal" for="archivo-epub" role="button">Añadir libro</label>`;
  return div;
}

// libros: datos ya leídos con librosParaMostrar() (si no, se leen aquí).
export async function pintarInicio(datos) {
  const libros = datos || await librosParaMostrar();
  const contenedor = $('contenido-inicio');
  if (!libros.length) {
    contenedor.replaceChildren(vacio());
    return;
  }
  const fecha = (l) => l.progreso?.fecha || '';
  const leyendo = libros.filter((l) => estadoDe(l) === 'leyendo').sort((a, b) => fecha(b).localeCompare(fecha(a)));
  const nuevos = libros.filter((l) => estadoDe(l) === 'pendiente').sort((a, b) => (b.fechaAlta || '').localeCompare(a.fechaAlta || ''));
  const terminados = libros.filter((l) => estadoDe(l) === 'terminado').sort((a, b) => fecha(b).localeCompare(fecha(a)));

  // El resumen de objetivos va justo después del libro en curso, para que se
  // vea entero sin desplazar la pantalla (al final quedaba bajo las pestañas).
  const partes = [];
  if (leyendo.length) partes.push(await tarjetaActual(leyendo[0]));
  partes.push(titulo('Objetivos de lectura'), await crearResumenObjetivos(alVerEstadisticas));
  if (leyendo.length > 1) partes.push(titulo('Seguir leyendo'), await carrusel(leyendo.slice(1)));
  if (nuevos.length) {
    partes.push(titulo(leyendo.length ? 'Añadidos recientemente' : 'Empieza uno nuevo'));
    partes.push(await carrusel(nuevos));
  }
  if (terminados.length) partes.push(titulo('Terminados'), await carrusel(terminados));
  contenedor.replaceChildren(...partes);
}
