// Pestaña "Leyendo ahora": el libro en curso destacado, el resto de lecturas
// abiertas y los añadidos recientemente, como en Libros de Apple.

import {
  librosParaMostrar, pulsarLibro, accionesLibro, descargando, verFicha,
} from './biblioteca.js';
import {
  crearPortada, estadoDe, porcentajeDe, textoEstado, estadoCorto,
} from './portadas.js';
import { svgIcono } from '../ui/iconos.js';
import { crearResumenObjetivos } from '../estadisticas/pantalla.js';
import { leerQuieroLeer, moverEnQuieroLeer, alternarQuieroLeer } from '../datos/quiero-leer.js';
import { abrirFicha } from '../ui/ficha.js';
import { todosLosSubrayados } from '../datos/anotaciones.js';

let alVerEstadisticas = () => {};
let alCambiar = () => {};

export function configurarInicio({ verEstadisticas, refrescar }) {
  alVerEstadisticas = verEstadisticas;
  if (refrescar) alCambiar = refrescar;
}

// Título de sección con un enlace a la derecha (por ejemplo, "Ordenar").
function tituloConEnlace(texto, enlace, alPulsar) {
  const fila = document.createElement('div');
  fila.className = 'seccion-cabecera';
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'enlace';
  b.textContent = enlace;
  b.addEventListener('click', alPulsar);
  fila.append(titulo(texto), b);
  return fila;
}

// --- Quiero leer (punto 6): ordenar la lista ---

async function ordenarQuieroLeer() {
  const [{ ids }, libros] = await Promise.all([leerQuieroLeer(), librosParaMostrar()]);
  const porId = new Map(libros.map((l) => [l.id, l]));
  const lista = ids.map((id) => porId.get(id)).filter(Boolean);
  const grupo = document.createElement('div');
  grupo.className = 'grupo lista-ordenar';
  lista.forEach((libro, i) => {
    const fila = document.createElement('div');
    fila.className = 'fila fila-ordenar';
    const texto = document.createElement('span');
    texto.className = 'ordenar-texto';
    texto.textContent = `${i + 1}. ${libro.titulo}`;
    const botonOrden = (icono, etiqueta, accion, desactivado) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'boton-icono';
      b.innerHTML = svgIcono(icono);
      b.setAttribute('aria-label', etiqueta);
      b.disabled = desactivado;
      b.addEventListener('click', async () => {
        await accion();
        await ordenarQuieroLeer();
        alCambiar();
      });
      return b;
    };
    fila.append(
      texto,
      botonOrden('arriba', `Subir ${libro.titulo}`, () => moverEnQuieroLeer(libro.id, lista[i - 1]?.id), i === 0),
      botonOrden('abajo', `Bajar ${libro.titulo}`, () => moverEnQuieroLeer(libro.id, lista[i + 1]?.id), i === lista.length - 1),
      botonOrden('quitar', `Quitar ${libro.titulo} de Quiero leer`, () => alternarQuieroLeer(libro.id), false),
    );
    grupo.appendChild(fila);
  });
  const pie = document.createElement('p');
  pie.className = 'pie-grupo';
  pie.textContent = lista.length
    ? 'El primero es el siguiente que leerás. Añade libros desde el botón ⋯ de cada uno.'
    : 'La lista está vacía. Añade libros desde el botón ⋯ de cada uno.';
  abrirFicha('Quiero leer', lista.length ? [grupo, pie] : [pie]);
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

// Libro en curso: la portada y "Seguir leyendo" abren el libro; el título,
// el autor y el avance abren la ficha (sinopsis y datos).
async function tarjetaActual(libro) {
  const tarjeta = document.createElement('div');
  tarjeta.className = 'tarjeta-actual libro';
  tarjeta.dataset.id = libro.id;

  const portada = document.createElement('button');
  portada.type = 'button';
  portada.className = 'tarjeta-portada';
  portada.setAttribute('aria-label', `Seguir leyendo ${libro.titulo}`);
  portada.appendChild(await crearPortada(libro));
  portada.addEventListener('click', () => pulsarLibro(libro));

  const info = document.createElement('div');
  info.className = 'tarjeta-info';
  const datos = document.createElement('button');
  datos.type = 'button';
  datos.className = 'tarjeta-datos';
  datos.setAttribute('aria-label', `Ficha de ${libro.titulo}`);
  datos.addEventListener('click', () => verFicha(libro));
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
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'boton-secundario';
  boton.innerHTML = libro.descargado ? 'Seguir leyendo' : `${svgIcono('nube')} Descargar y leer`;
  boton.addEventListener('click', () => pulsarLibro(libro));
  datos.append(t, a, barraAvance(pct), detalle);
  info.append(datos, boton);

  tarjeta.append(portada, info);
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

// Una fila de portadas que cabe entera se centra en la pantalla; si no cabe,
// empieza a la izquierda y se desplaza.
function centrarCarruseles() {
  document.querySelectorAll('#contenido-inicio .carrusel').forEach((fila) => {
    fila.classList.remove('centrado');
    fila.classList.toggle('centrado', fila.scrollWidth <= fila.clientWidth + 1);
  });
}
window.addEventListener('resize', centrarCarruseles);

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
// --- Cita del día (mejora 30) ---
// Un pasaje subrayado al azar de los libros de la biblioteca, el mismo durante
// todo el día. Al tocarlo se abre el libro en ese punto.

const MAX_CITA = 280;

function citaDelDia(subrayados, porId) {
  const validos = subrayados.filter((s) => porId.has(s.libroId) && s.texto).sort((a, b) => a.id.localeCompare(b.id));
  if (!validos.length) return null;
  const hoy = new Date().toLocaleDateString('sv'); // AAAA-MM-DD, hora local
  let semilla = 0;
  for (const c of hoy) semilla = (semilla * 31 + c.charCodeAt(0)) % 1000003;
  return validos[semilla % validos.length];
}

function tarjetaCita(cita, libro) {
  const tarjeta = document.createElement('button');
  tarjeta.type = 'button';
  tarjeta.className = 'tarjeta-cita';
  const texto = document.createElement('blockquote');
  texto.textContent = cita.texto.length > MAX_CITA ? `${cita.texto.slice(0, MAX_CITA).replace(/\s+\S*$/, '')}...` : cita.texto;
  const origen = document.createElement('span');
  origen.className = 'cita-origen';
  origen.textContent = [libro.titulo, libro.autor].filter(Boolean).join(', ');
  tarjeta.append(texto, origen);
  if (cita.nota) {
    const nota = document.createElement('span');
    nota.className = 'subrayado-nota';
    nota.textContent = cita.nota;
    tarjeta.appendChild(nota);
  }
  tarjeta.setAttribute('aria-label', `Cita del día de ${libro.titulo}. Abrir el libro en este pasaje`);
  tarjeta.addEventListener('click', () => pulsarLibro(libro, cita.cfi));
  return tarjeta;
}

export async function pintarInicio(datos) {
  const libros = datos || await librosParaMostrar();
  const contenedor = $('contenido-inicio');
  if (!libros.length) {
    contenedor.replaceChildren(vacio());
    return;
  }
  const fecha = (l) => l.progreso?.fecha || '';
  const { ids: quieroIds } = await leerQuieroLeer();
  const enQuiero = new Set(quieroIds);
  const leyendo = libros.filter((l) => estadoDe(l) === 'leyendo').sort((a, b) => fecha(b).localeCompare(fecha(a)));
  // "Quiero leer": los que aún no se han empezado, en el orden de la lista.
  const porId = new Map(libros.map((l) => [l.id, l]));
  const quiero = quieroIds.map((id) => porId.get(id)).filter((l) => l && estadoDe(l) === 'pendiente');
  const nuevos = libros.filter((l) => estadoDe(l) === 'pendiente' && !enQuiero.has(l.id))
    .sort((a, b) => (b.fechaAlta || '').localeCompare(a.fechaAlta || ''));
  const terminados = libros.filter((l) => estadoDe(l) === 'terminado').sort((a, b) => fecha(b).localeCompare(fecha(a)));

  // El resumen de objetivos va justo después del libro en curso, para que se
  // vea entero sin desplazar la pantalla (al final quedaba bajo las pestañas).
  const partes = [];
  if (leyendo.length) partes.push(await tarjetaActual(leyendo[0]));
  partes.push(titulo('Objetivos de lectura'), await crearResumenObjetivos(alVerEstadisticas));
  const cita = citaDelDia(await todosLosSubrayados(), porId);
  if (cita) partes.push(titulo('Cita del día'), tarjetaCita(cita, porId.get(cita.libroId)));
  if (leyendo.length > 1) partes.push(titulo('Seguir leyendo'), await carrusel(leyendo.slice(1)));
  if (quiero.length) partes.push(tituloConEnlace('Quiero leer', 'Ordenar', ordenarQuieroLeer), await carrusel(quiero));
  if (nuevos.length) {
    partes.push(titulo(leyendo.length ? 'Añadidos recientemente' : 'Empieza uno nuevo'));
    partes.push(await carrusel(nuevos));
  }
  if (terminados.length) partes.push(titulo('Terminados'), await carrusel(terminados));
  contenedor.replaceChildren(...partes);
  centrarCarruseles();
}
