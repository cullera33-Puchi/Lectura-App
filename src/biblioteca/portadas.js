// Portadas y textos de estado de un libro, comunes a la biblioteca y a
// "Leyendo ahora".

import { urlPortada } from '../datos/libros.js';
import { svgIcono } from '../ui/iconos.js';

// Colores para las portadas generadas de los libros que no traen una.
const COLORES = ['#7a4b2a', '#3f5a4c', '#5b4a72', '#8a3b3b', '#2f4f6f', '#6b5b3e', '#4a5568', '#7b5e3b'];

function colorDe(texto) {
  let h = 0;
  for (const c of texto || '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORES[h % COLORES.length];
}

export async function crearPortada(libro) {
  const url = await urlPortada(libro.id);
  if (url) {
    const img = document.createElement('img');
    img.className = 'portada';
    img.src = url;
    img.alt = '';
    img.loading = 'lazy';
    return img;
  }
  const div = document.createElement('div');
  div.className = 'portada portada-sin-imagen';
  div.style.background = colorDe(libro.titulo);
  const titulo = document.createElement('span');
  titulo.className = 'p-titulo';
  titulo.textContent = libro.titulo;
  const autor = document.createElement('span');
  autor.className = 'p-autor';
  autor.textContent = libro.autor || '';
  div.append(titulo, autor);
  return div;
}

export function estadoDe(libro) {
  return libro.progreso?.estado || 'pendiente';
}

export function porcentajeDe(libro) {
  const p = libro.progreso?.porcentaje;
  return p != null ? Math.round(p * 100) : null;
}

export function fechaCorta(iso) {
  const fecha = new Date(iso);
  const opciones = { day: 'numeric', month: 'short' };
  if (fecha.getFullYear() !== new Date().getFullYear()) opciones.year = 'numeric';
  return fecha.toLocaleDateString('es-ES', opciones).replace('.', '');
}

// Texto largo: avance, último dispositivo y fecha.
export function textoEstado(libro) {
  const p = libro.progreso;
  const estado = estadoDe(libro);
  if (estado === 'pendiente' || !p) return 'Sin empezar';
  const pct = porcentajeDe(libro);
  const avance = estado === 'terminado' ? 'Terminado' : (pct != null ? `${pct} %` : 'Leyendo');
  const donde = p.dispositivo ? ` en ${p.dispositivo}` : '';
  // Una posición provisional (abierto sin pasar página) no tiene fecha.
  return p.fecha ? `${avance}${donde}, ${fechaCorta(p.fecha)}` : `${avance}${donde}`;
}

// Línea corta bajo la portada, como en Libros de Apple. Devuelve HTML seguro
// (solo iconos propios y números).
export function estadoCorto(libro, { descargando } = {}) {
  if (descargando) return { html: `${svgIcono('descargar')} Descargando`, clase: '' };
  if (libro.noDisponible) return { html: 'No disponible', clase: '' };
  const estado = estadoDe(libro);
  const nube = !libro.descargado ? `${svgIcono('nube')} ` : '';
  const envio = libro.descargado && libro.pendienteSubir ? `${svgIcono('subir')} ` : '';
  if (estado === 'terminado') return { html: `${nube}${envio}${svgIcono('terminado')} Terminado`, clase: '' };
  if (estado === 'pendiente') return { html: `${nube}${envio}NUEVO`, clase: nube ? '' : 'nuevo' };
  const pct = porcentajeDe(libro);
  return { html: `${nube}${envio}${pct != null ? `${pct} %` : 'Leyendo'}`, clase: '' };
}
