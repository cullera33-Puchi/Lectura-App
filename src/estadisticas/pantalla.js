// Pestaña Estadísticas (v2): hoy y racha, objetivo anual, semana, año, libros
// terminados, desglose por dispositivo y años anteriores. Suma los dos
// dispositivos con los datos de la última sincronización.

import { obtenerEstadisticas } from './datos.js';
import { formatoDuracion } from './calculo.js';
import { fijarObjetivo } from '../datos/colecciones.js';
import { pedirNumero } from '../ui/hoja.js';
import { registrar } from '../ui/registro.js';

const $ = (id) => document.getElementById(id);

function el(etiqueta, clase, texto) {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
}

function cabecera(texto) {
  return el('h2', 'cabecera-grupo', texto);
}

// Gráfico de barras de una serie. Tocar una barra muestra su valor en la línea
// de detalle; sin tocar, la línea muestra el resumen.
function graficoBarras(datos, { resumen, formato }) {
  const grafico = el('div', 'grafico');
  const detalle = el('p', 'grafico-detalle', resumen);
  const barras = el('div', 'grafico-barras');
  const etiquetas = el('div', 'grafico-etiquetas');
  const maximo = Math.max(...datos.map((d) => d.valor), 0);
  if (maximo > 0) detalle.dataset.maximo = `Máximo: ${formato(maximo)}`;
  let seleccionada = null;

  datos.forEach((d) => {
    const barra = el('button', `barra${d.futuro ? ' futura' : ''}${d.valor ? '' : ' vacia'}`);
    barra.type = 'button';
    barra.setAttribute('aria-label', `${d.descripcion}: ${formato(d.valor)}`);
    const relleno = el('span');
    relleno.style.height = maximo ? `${Math.max(d.valor ? 3 : 0, (d.valor / maximo) * 100)}%` : '0';
    barra.appendChild(relleno);
    barra.addEventListener('click', () => {
      seleccionada?.classList.remove('seleccionada');
      if (seleccionada === barra) {
        seleccionada = null;
        detalle.textContent = resumen;
        return;
      }
      seleccionada = barra;
      barra.classList.add('seleccionada');
      detalle.textContent = `${d.descripcion}: ${formato(d.valor)}`;
    });
    barras.appendChild(barra);
    etiquetas.appendChild(el('span', '', d.etiqueta));
  });
  grafico.append(detalle, barras, etiquetas);
  return grafico;
}

function cifra(valor, texto) {
  const bloque = el('div', 'cifra');
  bloque.append(el('strong', '', valor), el('span', '', texto));
  return bloque;
}

function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}

async function cambiarObjetivo(anio, actual) {
  const n = await pedirNumero(`Objetivo de libros para ${anio}`, actual || 12, { min: 1, max: 365 });
  if (!n) return;
  await fijarObjetivo(anio, n);
  registrar(`Objetivo de ${anio}: ${n} libros`);
  await pintarEstadisticas();
}

function seccionObjetivo(e, ahora) {
  const grupo = el('div', 'grupo tarjeta');
  if (!e.objetivo) {
    grupo.append(el('p', 'tarjeta-texto', `Fija cuántos libros quieres leer en ${e.anio}. Llevas ${plural(e.delAnio.terminados, 'libro terminado', 'libros terminados')}.`));
  } else {
    const { libros, hechos } = e.objetivo;
    grupo.append(cifra(`${hechos} de ${libros}`, 'libros terminados'));
    const avance = el('div', 'avance');
    const relleno = el('span');
    relleno.style.width = `${Math.min(100, (hechos / libros) * 100)}%`;
    avance.appendChild(relleno);
    grupo.appendChild(avance);
    const inicioAnio = new Date(e.anio, 0, 1);
    const diasPasados = Math.max(1, (ahora - inicioAnio) / 86400000);
    const ritmo = Math.round((hechos / diasPasados) * 365);
    const texto = hechos >= libros
      ? '¡Objetivo cumplido!'
      : `A este ritmo terminarás unos ${plural(ritmo, 'libro', 'libros')} este año.`;
    grupo.append(el('p', 'tarjeta-texto', texto));
  }
  const boton = el('button', 'fila fila-boton', e.objetivo ? 'Cambiar objetivo' : 'Fijar objetivo');
  boton.type = 'button';
  boton.addEventListener('click', () => cambiarObjetivo(e.anio, e.objetivo?.libros));
  grupo.appendChild(boton);
  return grupo;
}

export async function pintarEstadisticas() {
  const ahora = new Date();
  const e = await obtenerEstadisticas(ahora);
  const partes = [];

  // Hoy y racha
  partes.push(cabecera('Hoy'));
  const hoy = el('div', 'grupo tarjeta tarjeta-cifras');
  hoy.append(
    cifra(formatoDuracion(e.hoy.ms), plural(e.hoy.paginas, 'página', 'páginas')),
    cifra(plural(e.racha.actual, 'día', 'días'), `seguidos. Récord: ${plural(e.racha.record, 'día', 'días')}`),
  );
  partes.push(hoy);

  partes.push(cabecera(`Objetivo de ${e.anio}`), seccionObjetivo(e, ahora));

  // Semana
  partes.push(cabecera('Esta semana'));
  const semana = el('div', 'grupo tarjeta');
  const media = e.totalSemanaMs / Math.max(1, e.semana.filter((d) => !d.futuro).length);
  semana.appendChild(graficoBarras(e.semana.map((d) => ({
    etiqueta: d.etiqueta,
    valor: d.ms,
    futuro: d.futuro,
    descripcion: new Date(`${d.clave}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' }),
  })), {
    resumen: `${formatoDuracion(e.totalSemanaMs)} en total. Media diaria: ${formatoDuracion(media)}`,
    formato: formatoDuracion,
  }));
  partes.push(semana);

  // Año
  partes.push(cabecera(String(e.anio)));
  const anio = el('div', 'grupo tarjeta');
  anio.appendChild(el('div', 'tarjeta-cifras', null));
  anio.firstChild.append(
    cifra(formatoDuracion(e.delAnio.ms), 'leyendo'),
    cifra(String(e.delAnio.paginas), 'páginas'),
    cifra(String(e.delAnio.terminados), e.delAnio.terminados === 1 ? 'libro terminado' : 'libros terminados'),
  );
  anio.appendChild(el('p', 'grafico-titulo', 'Tiempo de lectura por mes'));
  anio.appendChild(graficoBarras(e.meses.map((m) => ({
    etiqueta: m.etiqueta, valor: m.ms, futuro: m.futuro, descripcion: m.nombre,
  })), { resumen: 'Toca un mes para ver su tiempo.', formato: formatoDuracion }));
  anio.appendChild(el('p', 'grafico-titulo', 'Libros terminados por mes'));
  anio.appendChild(graficoBarras(e.meses.map((m) => ({
    etiqueta: m.etiqueta, valor: m.terminados, futuro: m.futuro, descripcion: m.nombre,
  })), { resumen: 'Toca un mes para ver cuántos.', formato: (n) => plural(n, 'libro', 'libros') }));
  partes.push(anio);

  // Por dispositivo
  if (e.dispositivos.length) {
    partes.push(cabecera(`Por dispositivo en ${e.anio}`));
    const grupo = el('div', 'grupo');
    const total = e.dispositivos.reduce((t, d) => t + d.ms, 0) || 1;
    for (const d of e.dispositivos) {
      const fila = el('div', 'fila fila-dispositivo');
      fila.append(el('span', '', d.nombre), el('span', 'valor', `${formatoDuracion(d.ms)} (${Math.round((d.ms / total) * 100)} %)`));
      grupo.appendChild(fila);
    }
    partes.push(grupo);
  }

  // Años anteriores
  const anteriores = e.anios.filter((a) => a.anio !== e.anio);
  if (anteriores.length) {
    partes.push(cabecera('Años anteriores'));
    const grupo = el('div', 'grupo');
    for (const a of anteriores) {
      const fila = el('div', 'fila fila-dispositivo');
      fila.append(el('span', '', String(a.anio)), el('span', 'valor', `${plural(a.terminados, 'libro', 'libros')}, ${formatoDuracion(a.ms)}`));
      grupo.appendChild(fila);
    }
    partes.push(grupo);
  }

  partes.push(el('p', 'pie-grupo', 'Suma el tiempo de los dos dispositivos con los datos de la última sincronización. Una sesión empieza al abrir un libro y termina al cerrarlo o tras 5 minutos sin pasar página.'));
  $('contenido-estadisticas').replaceChildren(...partes);
}

// Resumen para "Leyendo ahora": hoy, racha y objetivo anual.
export async function crearResumenObjetivos(alPulsar) {
  const e = await obtenerEstadisticas();
  const tarjeta = el('button', 'grupo tarjeta resumen-objetivos');
  tarjeta.type = 'button';
  tarjeta.setAttribute('aria-label', 'Ver estadísticas');
  const fila = el('div', 'tarjeta-cifras');
  fila.append(
    cifra(formatoDuracion(e.hoy.ms), 'hoy'),
    cifra(plural(e.racha.actual, 'día', 'días'), 'de racha'),
    cifra(e.objetivo ? `${e.objetivo.hechos} de ${e.objetivo.libros}` : String(e.delAnio.terminados), `libros en ${e.anio}`),
  );
  tarjeta.appendChild(fila);
  tarjeta.addEventListener('click', alPulsar);
  return tarjeta;
}
