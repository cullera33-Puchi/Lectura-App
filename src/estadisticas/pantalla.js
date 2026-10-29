// Pestaña Estadísticas (v2): hoy y racha, objetivo anual, semana, año, libros
// terminados, desglose por dispositivo y años anteriores. Suma los dos
// dispositivos con los datos de la última sincronización.

import { obtenerEstadisticas } from './datos.js';
import { mostrarResumenAnual } from './resumen.js';
import { mostrarDetalleMes } from './mes.js';
import { formatoDuracion, escalaEje } from './calculo.js';
import { fijarObjetivo, fijarMetaDiaria } from '../datos/colecciones.js';
import { pedirNumero } from '../ui/hoja.js';
import { registrar } from '../ui/registro.js';
import { svgIcono } from '../ui/iconos.js';

const $ = (id) => document.getElementById(id);
let alCambiarDatos = () => pintarEstadisticas();

// alCambiar: repinta la pestaña visible y marca las demás (el objetivo
// también aparece en "Leyendo ahora").
export function configurarEstadisticas({ alCambiar }) {
  alCambiarDatos = alCambiar;
}

function el(etiqueta, clase, texto) {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
}

function cabecera(texto) {
  return el('h2', 'cabecera-grupo', texto);
}

// Marca del eje: corta para que quepa a la izquierda ("1 h 30" en vez de
// "1 h 30 min").
function etiquetaEje(valor, tipo) {
  if (tipo !== 'duracion') return String(valor);
  const minutos = Math.round(valor / 60000);
  if (minutos < 60) return `${minutos} min`;
  const m = minutos % 60;
  return m ? `${Math.floor(minutos / 60)} h ${m}` : `${minutos / 60} h`;
}

// Gráfico de barras de una serie, con un eje vertical de marcas redondas y
// líneas de guía. Tocar una barra muestra su valor en la línea de detalle;
// sin tocar, la línea muestra el resumen. alPulsar(d): además, abre el
// detalle de esa barra (los meses). tipo: 'duracion' (ms) o 'cantidad'.
function graficoBarras(datos, { resumen, formato, alPulsar, tipo = 'duracion' }) {
  const grafico = el('div', 'grafico');
  const detalle = el('p', 'grafico-detalle', resumen);
  const cuerpo = el('div', 'grafico-cuerpo');
  const eje = el('div', 'grafico-eje');
  eje.setAttribute('aria-hidden', 'true');
  const barras = el('div', 'grafico-barras');
  const etiquetas = el('div', 'grafico-etiquetas');
  const maximo = Math.max(...datos.map((d) => d.valor), 0);
  const escala = escalaEje(maximo, tipo);
  const tope = escala?.tope || maximo;
  if (maximo > 0) detalle.dataset.maximo = `Máximo: ${formato(maximo)}`;
  for (const marca of escala?.marcas || []) {
    const altura = `${(marca / tope) * 100}%`;
    const texto = el('span', '', etiquetaEje(marca, tipo));
    texto.style.bottom = altura;
    eje.appendChild(texto);
    const linea = el('span', 'grafico-guia');
    linea.style.bottom = altura;
    barras.appendChild(linea);
  }
  let seleccionada = null;

  datos.forEach((d) => {
    // Las barras que abren un detalle (meses) lo abren en cada toque, sin
    // alternar la selección.
    const abreDetalle = Boolean(alPulsar) && !d.futuro;
    const barra = el('button', `barra${d.futuro ? ' futura' : ''}${d.valor ? '' : ' vacia'}`);
    barra.type = 'button';
    barra.setAttribute('aria-label', `${d.descripcion}: ${formato(d.valor)}`);
    const relleno = el('span');
    relleno.style.height = tope ? `${Math.max(d.valor ? 3 : 0, (d.valor / tope) * 100)}%` : '0';
    barra.appendChild(relleno);
    barra.addEventListener('click', () => {
      seleccionada?.classList.remove('seleccionada');
      if (seleccionada === barra && !abreDetalle) {
        seleccionada = null;
        detalle.textContent = resumen;
        return;
      }
      seleccionada = barra;
      barra.classList.add('seleccionada');
      detalle.textContent = `${d.descripcion}: ${formato(d.valor)}`;
      if (abreDetalle) alPulsar(d);
    });
    barras.appendChild(barra);
    etiquetas.appendChild(el('span', '', d.etiqueta));
  });
  cuerpo.append(eje, barras, el('span'), etiquetas);
  grafico.append(detalle, cuerpo);
  return grafico;
}

function botonResumen(anio) {
  const boton = el('button', 'fila fila-boton boton-resumen-anio');
  boton.type = 'button';
  boton.append(el('span', '', `Resumen de ${anio}`));
  boton.insertAdjacentHTML('beforeend', svgIcono('avanzar', 'chevron'));
  boton.addEventListener('click', () => mostrarResumenAnual(anio));
  return boton;
}

// Tiempo de hoy. Con una meta aún sin cumplir se redondea hacia abajo, para
// no mostrar "30 min" junto a una meta de 30 min que todavía no se ha cumplido.
function minutosHoy(e) {
  const ms = e.metaDiaria && !e.metaDiaria.cumplida ? Math.floor(e.hoy.ms / 60000) * 60000 : e.hoy.ms;
  return formatoDuracion(ms);
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
  await alCambiarDatos();
}

async function cambiarMetaDiaria(actual) {
  const n = await pedirNumero('Minutos de lectura al día (0 para quitar la meta)', actual ?? 30, { min: 0, max: 600 });
  if (n == null) return;
  await fijarMetaDiaria(n);
  registrar(n ? `Meta diaria: ${n} min` : 'Meta diaria quitada');
  await alCambiarDatos();
}

function barraAvance(fraccion) {
  const avance = el('div', 'avance');
  const relleno = el('span');
  relleno.style.width = `${Math.min(100, fraccion * 100)}%`;
  avance.appendChild(relleno);
  return avance;
}

function seccionHoy(e) {
  const hoy = el('div', 'grupo tarjeta');
  const cifras = el('div', 'tarjeta-cifras');
  cifras.append(
    cifra(minutosHoy(e), plural(e.hoy.paginas, 'página', 'páginas')),
    cifra(plural(e.racha.actual, 'día', 'días'), `seguidos. Récord: ${plural(e.racha.record, 'día', 'días')}`),
  );
  hoy.appendChild(cifras);
  const meta = e.metaDiaria;
  if (meta) {
    hoy.appendChild(barraAvance(e.hoy.ms / (meta.minutos * 60000)));
    const falta = Math.max(1, Math.ceil(meta.minutos - e.hoy.ms / 60000));
    hoy.appendChild(el('p', 'tarjeta-texto', meta.cumplida
      ? `Meta de hoy cumplida (${meta.minutos} min).`
      : `Meta diaria: ${meta.minutos} min. ${falta === 1 ? 'Te falta 1 min' : `Te faltan ${falta} min`}.`));
  }
  const boton = el('button', 'fila fila-boton', meta ? 'Cambiar meta diaria' : 'Fijar meta diaria');
  boton.type = 'button';
  boton.addEventListener('click', () => cambiarMetaDiaria(meta?.minutos));
  hoy.appendChild(boton);
  return hoy;
}

const DIAS_PARA_PREVISION = 30;

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
    // Las primeras semanas del año, o sin ningún libro terminado, la
    // proyección no dice nada útil ("unos 182 libros" el 3 de enero).
    const hayRitmo = diasPasados >= DIAS_PARA_PREVISION && hechos > 0;
    let texto;
    if (hechos >= libros) texto = '¡Objetivo cumplido!';
    else if (hayRitmo) texto = `A este ritmo terminarás unos ${plural(ritmo, 'libro', 'libros')} este año.`;
    else texto = `Te ${libros - hechos === 1 ? 'queda 1 libro' : `quedan ${libros - hechos} libros`} para cumplirlo.`;
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
  partes.push(cabecera('Hoy'), seccionHoy(e));

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
    cifra(String(e.delAnio.paginas), e.delAnio.paginas === 1 ? 'página' : 'páginas'),
    cifra(String(e.delAnio.terminados), e.delAnio.terminados === 1 ? 'libro terminado' : 'libros terminados'),
  );
  anio.appendChild(el('p', 'grafico-titulo', 'Tiempo de lectura por mes'));
  const verMes = (d) => mostrarDetalleMes(e.anio, d.mes).catch((error) => registrar(`Detalle del mes: ${error.message}`, 'error'));
  anio.appendChild(graficoBarras(e.meses.map((m, i) => ({
    etiqueta: m.etiqueta, valor: m.ms, futuro: m.futuro, descripcion: m.nombre, mes: i,
  })), { resumen: 'Toca un mes para ver sus libros y tiempos.', formato: formatoDuracion, alPulsar: verMes }));
  anio.appendChild(el('p', 'grafico-titulo', 'Libros terminados por mes'));
  anio.appendChild(graficoBarras(e.meses.map((m, i) => ({
    etiqueta: m.etiqueta, valor: m.terminados, futuro: m.futuro, descripcion: m.nombre, mes: i,
  })), { resumen: 'Toca un mes para ver sus libros.', formato: (n) => plural(n, 'libro', 'libros'), alPulsar: verMes, tipo: 'cantidad' }));
  anio.appendChild(botonResumen(e.anio));
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
      const fila = el('button', 'fila fila-dispositivo');
      fila.type = 'button';
      fila.append(el('span', '', String(a.anio)), el('span', 'valor', `${plural(a.terminados, 'libro', 'libros')}, ${formatoDuracion(a.ms)}`));
      fila.insertAdjacentHTML('beforeend', svgIcono('avanzar', 'chevron'));
      fila.setAttribute('aria-label', `Resumen de ${a.anio}`);
      fila.addEventListener('click', () => mostrarResumenAnual(a.anio));
      grupo.appendChild(fila);
    }
    partes.push(grupo);
  }

  partes.push(el('p', 'pie-grupo', 'Suma el tiempo de todos tus dispositivos con los datos de la última sincronización. Una sesión empieza al abrir un libro y termina al cerrarlo o tras 5 minutos sin pasar página.'));
  $('contenido-estadisticas').replaceChildren(...partes);
}

// Resumen para "Leyendo ahora": hoy, racha y objetivo anual, en una tarjeta
// con fondo propio que abre la pestaña Estadísticas.
export async function crearResumenObjetivos(alPulsar) {
  const e = await obtenerEstadisticas();
  const tarjeta = el('button', 'resumen-objetivos');
  tarjeta.type = 'button';
  tarjeta.setAttribute('aria-label', 'Ver estadísticas');
  const celdas = el('div', 'resumen-celdas');
  const celda = (valor, texto) => {
    const c = el('div', 'resumen-celda');
    c.append(el('strong', '', valor), el('span', '', texto));
    return c;
  };
  celdas.append(
    celda(minutosHoy(e), e.metaDiaria ? (e.metaDiaria.cumplida ? 'Meta cumplida' : `Hoy, de ${e.metaDiaria.minutos} min`) : 'Hoy'),
    celda(plural(e.racha.actual, 'día', 'días'), 'Racha'),
    e.objetivo
      ? celda(`${e.objetivo.hechos} de ${e.objetivo.libros}`, `Objetivo ${e.anio}`)
      : celda(String(e.delAnio.terminados), `Terminados en ${e.anio}`),
  );
  tarjeta.appendChild(celdas);
  if (e.objetivo) {
    const avance = el('div', 'avance');
    const relleno = el('span');
    relleno.style.width = `${Math.min(100, (e.objetivo.hechos / e.objetivo.libros) * 100)}%`;
    avance.appendChild(relleno);
    tarjeta.appendChild(avance);
  }
  const pie = el('div', 'resumen-pie');
  pie.append(el('span', '', e.objetivo ? 'Ver estadísticas' : 'Fijar un objetivo y ver estadísticas'));
  pie.insertAdjacentHTML('beforeend', svgIcono('avanzar'));
  tarjeta.appendChild(pie);
  tarjeta.addEventListener('click', alPulsar);
  return tarjeta;
}
