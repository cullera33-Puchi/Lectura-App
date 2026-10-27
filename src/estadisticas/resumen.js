// Resumen del año (mejora 6): totales, lo más destacado, reparto por
// dispositivo y libros terminados. Se abre desde Estadísticas.

import { todasLasSesiones, librosTerminados } from './datos.js';
import { resumenAnual, formatoDuracion } from './calculo.js';
import { todosLosLibros } from '../datos/libros.js';
import { crearPortada } from '../biblioteca/portadas.js';
import { abrirFicha } from '../ui/ficha.js';

function el(etiqueta, clase, texto) {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

function cifra(valor, texto) {
  const bloque = el('div', 'cifra');
  bloque.append(el('strong', '', valor), el('span', '', texto));
  return bloque;
}

function filas(lista) {
  const grupo = el('div', 'grupo');
  for (const [etiqueta, valor] of lista) {
    if (!valor) continue;
    const fila = el('div', 'fila fila-dato');
    fila.append(el('span', '', etiqueta), el('span', 'valor', valor));
    grupo.appendChild(fila);
  }
  return grupo.children.length ? grupo : null;
}

const fechaCorta = (iso) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });

export async function mostrarResumenAnual(anio) {
  const [sesiones, terminados, libros] = await Promise.all([todasLasSesiones(), librosTerminados(), todosLosLibros()]);
  const porId = new Map(libros.map((l) => [l.id, l]));
  const titulo = (id) => porId.get(id)?.titulo || 'Libro eliminado';
  const r = resumenAnual({ sesiones, terminados, anio });
  const partes = [];

  if (!r.ms && !r.terminados.length) {
    partes.push(el('p', 'tarjeta-texto', `No hay lecturas registradas en ${anio}.`));
    abrirFicha(`Resumen de ${anio}`, partes);
    return;
  }

  partes.push(el('p', 'tarjeta-texto resumen-intro',
    `En ${anio} has leído ${formatoDuracion(r.ms)} repartidos en ${plural(r.dias, 'día', 'días')}`
    + `${r.terminados.length ? ` y has terminado ${plural(r.terminados.length, 'libro', 'libros')}` : ''}.`));

  const cifras = el('div', 'resumen-anio-cifras');
  cifras.append(
    cifra(String(r.terminados.length), r.terminados.length === 1 ? 'libro terminado' : 'libros terminados'),
    cifra(formatoDuracion(r.ms), 'de lectura'),
    cifra(String(r.paginas), 'páginas pasadas'),
    cifra(String(r.dias), r.dias === 1 ? 'día con lectura' : 'días con lectura'),
    cifra(plural(r.rachaMasLarga, 'día', 'días'), 'de racha más larga'),
    cifra(formatoDuracion(r.mediaPorDiaMs), 'de media cada día que lees'),
  );
  partes.push(cifras);

  const destacado = filas([
    ['Mes con más lectura', r.mes ? `${r.mes.nombre}, ${formatoDuracion(r.mes.ms)}` : null],
    ['Día favorito', r.diaSemana ? `los ${r.diaSemana.nombre === 'sábado' || r.diaSemana.nombre === 'domingo' ? `${r.diaSemana.nombre}s` : r.diaSemana.nombre}` : null],
    ['Sueles leer', r.franja],
    ['Libro con más tiempo', r.libroTop ? `${titulo(r.libroTop.libroId)}, ${formatoDuracion(r.libroTop.ms)}` : null],
    ['Sesión más larga', r.sesionMasLarga?.ms ? `${formatoDuracion(r.sesionMasLarga.ms)}, ${fechaCorta(r.sesionMasLarga.fecha)}` : null],
  ]);
  if (destacado) partes.push(el('h3', 'cabecera-grupo', 'Lo más destacado'), destacado);

  const dispositivos = r.dispositivos.filter((d) => d.ms >= 60000);
  if (dispositivos.length) {
    const total = dispositivos.reduce((t, d) => t + d.ms, 0) || 1;
    partes.push(el('h3', 'cabecera-grupo', 'Por dispositivo'), filas(dispositivos.map((d) => [
      d.nombre, `${formatoDuracion(d.ms)} (${Math.round((d.ms / total) * 100)} %)`,
    ])));
  }

  if (r.terminados.length) {
    partes.push(el('h3', 'cabecera-grupo', 'Libros terminados'));
    const lista = el('div', 'grupo lista-terminados');
    for (const t of r.terminados) {
      const libro = porId.get(t.libroId) || { id: t.libroId, titulo: titulo(t.libroId) };
      const fila = el('div', 'fila');
      const texto = el('div', 't-texto');
      texto.append(el('div', 't-titulo', libro.titulo), el('div', 't-fecha', fechaCorta(t.fecha)));
      fila.append(await crearPortada(libro), texto);
      lista.appendChild(fila);
    }
    partes.push(lista);
  }

  abrirFicha(`Resumen de ${anio}`, partes);
}
