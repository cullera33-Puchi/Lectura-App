// Detalle de un mes (mejora 21): al tocar una barra de los gráficos de meses,
// una hoja con el tiempo, los días y las páginas del mes, los libros leídos
// con el tiempo de cada uno y los terminados. Suma los dos dispositivos. Cada
// libro abre su ficha.

import { todasLasSesiones, librosTerminados } from './datos.js';
import { detalleMes, formatoDuracion } from './calculo.js';
import { todosLosLibros } from '../datos/libros.js';
import { crearPortada } from '../biblioteca/portadas.js';
import { abrirFicha } from '../ui/ficha.js';
import { svgIcono } from '../ui/iconos.js';
import { registrar } from '../ui/registro.js';

function el(etiqueta, clase, texto) {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const fechaCorta = (iso) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });

function cifra(valor, texto) {
  const bloque = el('div', 'cifra');
  bloque.append(el('strong', '', valor), el('span', '', texto));
  return bloque;
}

// La ficha del libro se carga al tocar, para no cargar la biblioteca aquí.
async function abrirFichaDe(id) {
  const { librosParaMostrar, verFicha } = await import('../biblioteca/biblioteca.js');
  const libro = (await librosParaMostrar()).find((l) => l.id === id);
  if (libro) await verFicha(libro);
}

export async function mostrarDetalleMes(anio, mes) {
  const [sesiones, terminados, libros] = await Promise.all([todasLasSesiones(), librosTerminados(), todosLosLibros()]);
  const porId = new Map(libros.map((l) => [l.id, l]));
  const d = detalleMes({ sesiones, terminados, anio, mes });
  const titulo = `${mayuscula(d.nombre)} de ${anio}`;
  registrar(`Estadísticas: detalle de ${d.nombre} de ${anio}`);
  const partes = [];

  if (!d.ms && !d.libros.length) {
    partes.push(el('p', 'tarjeta-texto', `No hay lecturas registradas en ${d.nombre} de ${anio}.`));
    abrirFicha(titulo, partes);
    return;
  }

  const cifras = el('div', 'resumen-anio-cifras');
  cifras.append(
    cifra(formatoDuracion(d.ms), 'de lectura'),
    cifra(String(d.dias), d.dias === 1 ? 'día con lectura' : 'días con lectura'),
    cifra(String(d.paginas), 'páginas pasadas'),
    cifra(String(d.terminados), d.terminados === 1 ? 'libro terminado' : 'libros terminados'),
  );
  partes.push(cifras);

  partes.push(el('h3', 'cabecera-grupo', d.libros.length === 1 ? 'Libro del mes' : 'Libros del mes'));
  const lista = el('div', 'grupo lista-terminados lista-mes');
  for (const l of d.libros) {
    const libro = porId.get(l.libroId);
    const disponible = libro && !libro.eliminado;
    const fila = el(disponible ? 'button' : 'div', 'fila fila-libro-mes');
    if (disponible) {
      fila.type = 'button';
      fila.addEventListener('click', () => abrirFichaDe(l.libroId));
    }
    const texto = el('div', 't-texto');
    const tiempo = [l.ms ? formatoDuracion(l.ms) : null, l.paginas ? plural(l.paginas, 'página', 'páginas') : null]
      .filter(Boolean).join(', ');
    texto.append(el('div', 't-titulo', libro?.titulo || 'Libro eliminado'));
    if (tiempo) texto.append(el('div', 't-fecha', tiempo));
    if (l.terminado) {
      const estrellas = libro?.valoracion?.estrellas;
      texto.append(el('div', 't-fecha', `Terminado el ${fechaCorta(l.terminado)}${estrellas ? `. ${'★'.repeat(estrellas)}` : ''}`));
    }
    fila.append(await crearPortada(libro || { id: l.libroId, titulo: 'Libro eliminado' }), texto);
    if (disponible) fila.insertAdjacentHTML('beforeend', svgIcono('avanzar', 'chevron'));
    lista.appendChild(fila);
  }
  partes.push(lista);

  const dispositivos = d.dispositivos.filter((x) => x.ms >= 60000);
  if (dispositivos.length > 1) {
    const total = dispositivos.reduce((t, x) => t + x.ms, 0) || 1;
    const grupo = el('div', 'grupo');
    for (const x of dispositivos) {
      const fila = el('div', 'fila fila-dato');
      fila.append(el('span', '', x.nombre), el('span', 'valor', `${formatoDuracion(x.ms)} (${Math.round((x.ms / total) * 100)} %)`));
      grupo.appendChild(fila);
    }
    partes.push(el('h3', 'cabecera-grupo', 'Por dispositivo'), grupo);
  }

  abrirFicha(titulo, partes);
}
