// Pestaña "Leyendo ahora": el libro en curso destacado, el resto de lecturas
// abiertas y los añadidos recientemente, como en Libros de Apple.

import { librosParaMostrar, pulsarLibro, accionesLibro, descargando } from './biblioteca.js';
import {
  crearPortada, estadoDe, porcentajeDe, textoEstado, estadoCorto,
} from './portadas.js';
import { svgIcono } from '../ui/iconos.js';

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
  return tarjeta;
}

async function miniatura(libro) {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'miniatura libro';
  boton.dataset.id = libro.id;
  boton.setAttribute('aria-label', `Abrir ${libro.titulo}`);
  const pie = document.createElement('div');
  pie.className = 'm-pie';
  pie.innerHTML = estadoCorto(libro, { descargando: descargando.has(libro.id) }).html;
  boton.append(await crearPortada(libro), pie);
  boton.addEventListener('click', () => pulsarLibro(libro));
  boton.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    accionesLibro(libro);
  });
  return boton;
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

  const partes = [];
  if (leyendo.length) {
    partes.push(await tarjetaActual(leyendo[0]));
    if (leyendo.length > 1) partes.push(titulo('Seguir leyendo'), await carrusel(leyendo.slice(1)));
  } else if (nuevos.length) {
    partes.push(titulo('Empieza uno nuevo'));
  }
  if (nuevos.length) {
    if (leyendo.length) partes.push(titulo('Añadidos recientemente'));
    partes.push(await carrusel(nuevos));
  }
  if (terminados.length) partes.push(titulo('Terminados'), await carrusel(terminados));
  contenedor.replaceChildren(...partes);
}
