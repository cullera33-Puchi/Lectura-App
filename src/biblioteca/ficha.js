// Ficha del libro: portada y datos, avance, lectura (fechas, tiempo y reparto
// por dispositivo), sinopsis y datos de la edición. Todo llega sincronizado:
// las sesiones de los dos dispositivos y los datos de la edición, que se leen
// del EPUB al importarlo y viajan en biblioteca.json.

import { leerColecciones } from '../datos/colecciones.js';
import { valorarLibro } from '../datos/libros.js';
import { mostrarFormulario } from '../ui/hoja.js';
import { todasLasSesiones } from '../estadisticas/datos.js';
import { resumenLibro, formatoDuracion, previsionFin } from '../estadisticas/calculo.js';
import { completarEdicion } from './importar.js';
import { crearPortada, porcentajeDe, textoEstado } from './portadas.js';
import { abrirFicha, cerrarFicha } from '../ui/ficha.js';
import { svgIcono } from '../ui/iconos.js';
import { registrar } from '../ui/registro.js';

function el(etiqueta, clase, texto) {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
}

function fecha(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

// La fecha de publicación del EPUB puede ser un año, un año y mes o una fecha.
// Calibre escribe 0101-01-01 cuando no hay fecha: un año anterior a 1000 se
// trata como sin fecha. Con hora, se toma solo el día (a medianoche UTC,
// en España saldría el día anterior).
function fechaPublicacion(texto) {
  if (!texto) return null;
  const anio = Number(texto.slice(0, 4));
  if (!(anio >= 1000)) return null;
  if (/^\d{4}$/.test(texto)) return texto;
  if (/^\d{4}-\d{2}$/.test(texto)) {
    return new Date(`${texto}-15T12:00:00`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  }
  const dia = /^\d{4}-\d{2}-\d{2}/.exec(texto)?.[0];
  return fecha(dia ? `${dia}T12:00:00` : texto) || texto;
}

const NOMBRES_IDIOMA = { es: 'Español', en: 'Inglés', fr: 'Francés', it: 'Italiano', pt: 'Portugués', de: 'Alemán', ca: 'Catalán', pl: 'Polaco' };
// Códigos de tres letras (ISO 639-2) que usan algunos EPUB.
const TRES_LETRAS = { spa: 'es', eng: 'en', fre: 'fr', fra: 'fr', ita: 'it', por: 'pt', ger: 'de', deu: 'de', cat: 'ca', pol: 'pl' };

function idioma(codigo) {
  if (!codigo) return null;
  const c = codigo.toLowerCase().split(/[-_]/)[0];
  return NOMBRES_IDIOMA[TRES_LETRAS[c] || c] || codigo;
}

function filas(lista) {
  const grupo = el('div', 'grupo');
  for (const [etiqueta, valor] of lista) {
    if (valor == null || valor === '') continue;
    const fila = el('div', 'fila fila-dato');
    fila.append(el('span', '', etiqueta), el('span', 'valor', valor));
    grupo.appendChild(fila);
  }
  return grupo.children.length ? grupo : null;
}

// "Hacia el 12 de noviembre (alrededor de 3 h de lectura)".
function textoPrevision(prevision) {
  if (!prevision) return null;
  const minutos = Math.max(5, Math.round(prevision.msRestante / 300000) * 5);
  const lectura = `alrededor de ${formatoDuracion(minutos * 60000)} de lectura`;
  if (prevision.dias <= 1) return `Hoy o mañana (${lectura})`;
  const dia = new Date(`${prevision.fecha}T12:00:00`);
  const opciones = { day: 'numeric', month: 'long' };
  if (dia.getFullYear() !== new Date().getFullYear()) opciones.year = 'numeric';
  return `Hacia el ${dia.toLocaleDateString('es-ES', opciones)} (${lectura})`;
}

function cabecera(texto) {
  return el('h3', 'cabecera-grupo', texto);
}

// --- Valoración y nota personal (punto 5) ---

const TEXTO_ESTRELLAS = ['', 'No me ha gustado', 'Regular', 'Está bien', 'Me ha gustado', 'Me ha encantado'];

function seccionValoracion(libro, acciones) {
  const grupo = el('div', 'grupo valoracion');
  let actual = libro.valoracion || {};

  const fila = el('div', 'fila estrellas');
  const etiqueta = el('span', 'estrellas-texto');
  const pintarEstrellas = () => {
    fila.querySelectorAll('.estrella').forEach((b, i) => b.setAttribute('aria-pressed', String(i < (actual.estrellas || 0))));
    etiqueta.textContent = actual.estrellas ? TEXTO_ESTRELLAS[actual.estrellas] : 'Sin valorar';
  };
  for (let n = 1; n <= 5; n++) {
    const b = el('button', 'estrella');
    b.type = 'button';
    b.innerHTML = svgIcono('estrella');
    b.setAttribute('aria-label', `${n} ${n === 1 ? 'estrella' : 'estrellas'}`);
    b.addEventListener('click', async () => {
      // Tocar la misma estrella otra vez quita la valoración.
      const estrellas = actual.estrellas === n ? null : n;
      const nuevo = await valorarLibro(libro.id, { estrellas });
      actual = nuevo?.valoracion || actual;
      pintarEstrellas();
      acciones.cambiado?.();
    });
    fila.appendChild(b);
  }
  fila.appendChild(etiqueta);

  const nota = el('button', 'fila fila-boton nota-personal');
  nota.type = 'button';
  const pintarNota = () => {
    nota.textContent = actual.nota ? actual.nota : 'Escribir una nota';
    nota.classList.toggle('con-nota', Boolean(actual.nota));
  };
  nota.addEventListener('click', async () => {
    const campo = document.createElement('textarea');
    campo.className = 'campo-nota';
    campo.rows = 5;
    campo.maxLength = 1000;
    campo.value = actual.nota || '';
    campo.placeholder = 'Qué te ha parecido, a quién se lo recomendarías...';
    if (!(await mostrarFormulario('Tu nota sobre el libro', [campo], { enfocar: campo }))) return;
    const nuevo = await valorarLibro(libro.id, { nota: campo.value.trim() || null });
    actual = nuevo?.valoracion || actual;
    pintarNota();
    acciones.cambiado?.();
  });
  pintarEstrellas();
  pintarNota();
  grupo.append(fila, nota);
  return grupo;
}

// acciones: { abrir(libro), editar(libro), cambiado() }, que se ejecutan dentro del toque.
export async function mostrarFichaLibro(libro, acciones) {
  const [sesiones, colecciones] = await Promise.all([todasLasSesiones(), leerColecciones()]);
  const lectura = resumenLibro(sesiones.filter((s) => s.libroId === libro.id));
  // Los datos de la edición llegan sincronizados; si faltan y el EPUB está
  // aquí, se leen ahora y quedan guardados para el otro dispositivo.
  let edicion = libro.edicion || {};
  if (!libro.edicion && libro.descargado) {
    try {
      edicion = (await completarEdicion(libro)) || {};
    } catch (e) {
      registrar(`Ficha: no se pudieron leer los datos del EPUB (${e.message})`, 'error');
    }
  }

  const partes = [];

  // Portada y datos principales
  const principal = el('div', 'ficha-principal');
  const texto = el('div', 'ficha-texto');
  texto.append(el('div', 'ficha-titulo', libro.titulo), el('div', 'ficha-autor', libro.autor || 'Autor desconocido'));
  if (libro.serie) {
    texto.appendChild(el('div', 'ficha-serie', libro.numeroSerie != null ? `${libro.serie}, ${libro.numeroSerie}` : libro.serie));
  }
  const pct = porcentajeDe(libro);
  const avance = el('div', 'avance');
  const relleno = el('span');
  relleno.style.width = `${pct ?? 0}%`;
  avance.appendChild(relleno);
  texto.append(avance, el('div', 'ficha-estado', textoEstado(libro)));
  principal.append(await crearPortada(libro), texto);
  partes.push(principal);

  // Botones
  const botones = el('div', 'ficha-botones');
  const leer = el('button', 'boton-principal');
  leer.type = 'button';
  const estado = libro.progreso?.estado || 'pendiente';
  let etiqueta = estado === 'pendiente' ? 'Empezar a leer' : 'Seguir leyendo';
  if (!libro.descargado) etiqueta = 'Descargar y leer';
  leer.textContent = etiqueta;
  leer.disabled = Boolean(libro.noDisponible);
  leer.addEventListener('click', () => {
    cerrarFicha();
    acciones.abrir(libro);
  });
  const editar = el('button', 'boton-secundario');
  editar.type = 'button';
  editar.innerHTML = `${svgIcono('editar')} Editar`;
  editar.addEventListener('click', () => {
    cerrarFicha();
    acciones.editar(libro);
  });
  botones.append(leer, editar);
  partes.push(botones);

  // Tu lectura
  // Reparto solo si hay más de un dispositivo con al menos un minuto.
  const dispositivos = lectura.dispositivos.filter((d) => d.ms >= 60000);
  const porDispositivo = dispositivos.length > 1
    ? dispositivos.map((d) => `${d.nombre}: ${formatoDuracion(d.ms)}`).join('. ')
    : null;
  const tuLectura = filas([
    ['Empezado', fecha(lectura.primera)],
    ['Terminado', estado === 'terminado' ? fecha(libro.progreso?.fechaTerminado || libro.progreso?.fecha) : null],
    ['Última lectura', fecha(lectura.ultima)],
    ['Fin previsto', estado === 'leyendo' ? textoPrevision(previsionFin({
      msLibro: lectura.ms, fraccion: libro.progreso?.porcentaje, sesiones,
    })) : null],
    ['Tiempo de lectura', lectura.sesiones ? formatoDuracion(lectura.ms) : null],
    ['Sesiones', lectura.sesiones ? String(lectura.sesiones) : null],
    ['Páginas pasadas', lectura.paginas ? String(lectura.paginas) : null],
    ['Por dispositivo', porDispositivo],
  ]);
  partes.push(cabecera('Tu lectura'));
  partes.push(tuLectura || el('p', 'pie-grupo ficha-vacio', 'Todavía no hay sesiones de lectura de este libro.'));

  partes.push(cabecera('Tu valoración'), seccionValoracion(libro, acciones));

  // Sinopsis
  if (edicion.sinopsis) {
    partes.push(cabecera('Sinopsis'));
    const sinopsis = el('div', 'grupo ficha-sinopsis');
    for (const parrafo of edicion.sinopsis.split(/\n{2,}/)) sinopsis.appendChild(el('p', '', parrafo));
    partes.push(sinopsis);
  }

  // Datos del libro
  const nombresColecciones = (libro.colecciones || [])
    .map((id) => colecciones.find((c) => c.id === id)?.nombre).filter(Boolean).join(', ');
  const tamano = libro.tamanoBytes ? `${(libro.tamanoBytes / 1048576).toFixed(1).replace('.', ',')} MB` : null;
  const datos = filas([
    ['Editorial', edicion.editorial],
    ['Publicación', fechaPublicacion(edicion.fecha)],
    ['Idioma', idioma(libro.idioma)],
    ['Temas', edicion.temas?.length ? edicion.temas.slice(0, 5).join(', ') : null],
    ['Colecciones', nombresColecciones || null],
    ['En la biblioteca desde', fecha(libro.fechaAlta)],
    ['Tamaño', tamano],
    ['En este dispositivo', libro.descargado ? 'Descargado' : 'Solo en la nube'],
  ]);
  partes.push(cabecera('Datos del libro'));
  if (datos) partes.push(datos);
  if (!libro.edicion && !libro.descargado) {
    partes.push(el('p', 'pie-grupo', 'La sinopsis y los datos de la edición aparecerán cuando el libro se abra en un dispositivo que lo tenga descargado y se sincronice.'));
  }

  abrirFicha('Ficha del libro', partes);
}
