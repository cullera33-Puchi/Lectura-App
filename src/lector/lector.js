// Motor de lectura con epub.js.
//
// Perfil Móvil: gestor "continuous" de epub.js. El deslizamiento sigue al dedo
// y el paso de página (toque o deslizamiento) se anima desplazando el
// contenedor. No se usa el "snap" de epub.js porque su animación entra en
// conflicto con los toques.
//
// Perfil Tinta electrónica: gestor "default". rendition.next() y prev()
// cambian la página de golpe, sin animación.
//
// Los toques se capturan dentro del iframe del libro con el hook de contenido.
//
// Safari no ejecuta los manejadores de eventos en un iframe con sandbox sin
// "allow-scripts", aunque se registren desde la app. Por eso se activa
// allowScriptedContent y se neutralizan los scripts del propio libro antes de
// pintarlo: se eliminan y, además, una política CSP impide ejecutarlos.

import { cargarEpub } from './librerias.js';
import { registrar } from '../ui/registro.js';
import { curvaDesde } from '../ui/paneles.js';
import {
  cssLibro, temaEfectivo, proporcionMargenes, cambioRepagina, escalarTamanosFijos, COLORES_SUBRAYADO, colorTinta,
} from '../ui/temas.js';
import { MENSAJE_ILEGIBLE } from '../biblioteca/importar.js';

const DURACION_ANIMACION_MS = 260;
// Al soltar un arrastre, la página sigue a la velocidad del dedo y frena.
const PENDIENTE_SALIDA = 2;
const MUESTRAS_GESTO_MS = 100;
const UMBRAL_DESLIZAR_PX = 40;
const UMBRAL_MOVIMIENTO_PX = 10;
const MAX_DURACION_TOQUE_MS = 600;
const VENTANA_CLIC_TRAS_TOQUE_MS = 800;
const CARACTERES_POR_UBICACION = 1600;
const ESPERA_COMPROBACION_MS = 400;
// Mejora 20: carga del capítulo contiguo en el perfil Móvil.
const PAGINAS_PRECARGA = 3;
const ESPERA_CONTIGUO_MS = 1500;
const VIGILANCIA_POSICION_MS = 8000; // tras abrir, el capítulo aún puede crecer y mover el texto
// Plazos de apertura y de la primera página. Crecen con el tamaño del libro
// (mejora 19): un libro muy ilustrado tarda más en la tablet.
const LIMITE_APERTURA_MS = 20000;
const LIMITE_PINTADO_MS = 15000;
const MS_EXTRA_POR_MB = 300;
const ESPERA_RECURSO_MS = 8000; // una imagen, fuente u hoja de estilo del libro
const ESPERA_CAPITULO_MS = 5000; // todos los recursos de un capítulo
const URL_FUENTES = new URL('../../fonts/fuentes.css', import.meta.url).href;
const MAX_RESULTADOS = 300;
const ESPERA_RESALTADO_MS = 800;
// Subrayados (mejora 26)
const ESPERA_PULSACION_LARGA_MS = 350; // a partir de aquí, mover el dedo selecciona texto
const ESPERA_SELECCION_MS = 450; // la selección se da por terminada
const MAX_TEXTO_SUBRAYADO = 2000;
export const COLORES = COLORES_SUBRAYADO;
const CONTEXTO_FRAGMENTO = 45; // caracteres antes y después de la coincidencia

// Texto sin tildes y en minúsculas, con la posición original de cada carácter,
// para buscar sin distinguir tildes y poder señalar la coincidencia exacta.
// Los espacios de cualquier tipo (salto de línea, espacio duro, varios
// seguidos) cuentan como uno, y los invisibles (guion opcional, espacio de
// ancho cero) no cuentan: así "la triste" encuentra "la\ntriste".
const INVISIBLES = /[\u00ad\u200b\u2060\ufeff]/;

function normalizarConPosiciones(texto) {
  let normal = '';
  const posiciones = [];
  for (let i = 0; i < texto.length; i++) {
    const t = texto[i];
    if (INVISIBLES.test(t)) continue;
    if (/\s/.test(t)) {
      if (normal.endsWith(' ')) continue;
      normal += ' ';
      posiciones.push(i);
      continue;
    }
    const c = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    for (let k = 0; k < c.length; k++) {
      normal += c[k];
      posiciones.push(i);
    }
  }
  return { normal, posiciones };
}

export function normalizarBusqueda(texto) {
  return normalizarConPosiciones((texto || '').trim()).normal.trim();
}

// Descarte rápido con la misma normalización que normalizarConPosiciones.
function textoNormalizado(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u00ad\u200b\u2060\ufeff]/g, '')
    .replace(/\s+/g, ' ').toLowerCase();
}

// Coincidencias dentro de cada nodo de texto de un capítulo cargado. Cada una
// lleva su CFI y un fragmento con el texto de alrededor.
function buscarEnSeccion(seccion, buscado, maximo) {
  const doc = seccion.document;
  const cuerpo = doc?.body || doc?.documentElement;
  if (!cuerpo) return [];
  const resultados = [];
  const recorrido = doc.createTreeWalker(cuerpo, 4); // NodeFilter.SHOW_TEXT
  for (let nodo = recorrido.nextNode(); nodo && resultados.length < maximo; nodo = recorrido.nextNode()) {
    const original = nodo.nodeValue;
    if (!original || original.length < buscado.length) continue;
    // Descarte rápido: casi ningún nodo contiene lo buscado, y el mapa de
    // posiciones (carácter a carácter) solo se construye para los que sí.
    if (!textoNormalizado(original).includes(buscado)) continue;
    const { normal, posiciones } = normalizarConPosiciones(original);
    let desde = 0;
    for (let i = normal.indexOf(buscado, desde); i >= 0 && resultados.length < maximo; i = normal.indexOf(buscado, desde)) {
      const inicio = posiciones[i];
      const fin = posiciones[i + buscado.length - 1] + 1;
      const rango = doc.createRange();
      rango.setStart(nodo, inicio);
      rango.setEnd(nodo, fin);
      let cfi = null;
      try {
        cfi = seccion.cfiFromRange(rango);
      } catch {
        cfi = null;
      }
      if (cfi) {
        resultados.push({
          cfi,
          antes: original.slice(Math.max(0, inicio - CONTEXTO_FRAGMENTO), inicio).replace(/\s+/g, ' ').trimStart(),
          coincidencia: original.slice(inicio, fin),
          despues: original.slice(fin, fin + CONTEXTO_FRAGMENTO).replace(/\s+/g, ' ').trimEnd(),
          cortadoAntes: inicio > CONTEXTO_FRAGMENTO,
          cortadoDespues: fin + CONTEXTO_FRAGMENTO < original.length,
        });
      }
      desde = i + buscado.length;
    }
  }
  return resultados;
}

export const MENSAJE_LIBRO_ILEGIBLE = MENSAJE_ILEGIBLE;

// La apertura se ha cancelado (por ejemplo, el usuario cerró el libro mientras
// se abría). No es un error que haya que mostrar.
export class AperturaCancelada extends Error {}

function conTiempoLimite(promesa, ms, mensaje) {
  let temporizador;
  const limite = new Promise((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error(mensaje)), ms);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador));
}

function directorio(ruta) {
  return ruta && ruta.includes('/') ? ruta.slice(0, ruta.lastIndexOf('/') + 1) : '';
}

function unirRuta(base, relativa) {
  const partes = `${base}${relativa}`.split('/');
  const resultado = [];
  for (const p of partes) {
    if (p === '..') resultado.pop();
    else if (p !== '.') resultado.push(p);
  }
  return resultado.join('/');
}

const NS_XHTML = 'http://www.w3.org/1999/xhtml';
const POLITICA_SIN_SCRIPTS = "script-src 'none'; object-src 'none'; frame-src 'none'";

// Los elementos peligrosos se sustituyen por un <span> vacío en lugar de
// quitarlos, para no alterar la numeración de elementos en la que se basan los
// CFI de las posiciones guardadas.
function neutralizarScripts(doc) {
  for (const nombre of ['script', 'iframe', 'object', 'embed']) {
    Array.from(doc.getElementsByTagNameNS('*', nombre)).forEach((e) => {
      const vacio = doc.createElementNS(NS_XHTML, 'span');
      vacio.setAttribute('hidden', '');
      e.replaceWith(vacio);
    });
  }
  for (const elemento of Array.from(doc.getElementsByTagName('*'))) {
    for (const atributo of Array.from(elemento.attributes)) {
      const nombre = atributo.localName.toLowerCase();
      const esManejador = nombre.startsWith('on');
      const esEnlaceScript = /^\s*javascript:/i.test(atributo.value);
      if (esManejador || esEnlaceScript) elemento.removeAttributeNode(atributo);
    }
  }
  let cabecera = doc.getElementsByTagNameNS('*', 'head')[0];
  if (!cabecera && doc.documentElement) {
    cabecera = doc.createElementNS(NS_XHTML, 'head');
    doc.documentElement.insertBefore(cabecera, doc.documentElement.firstChild);
  }
  if (cabecera) {
    const meta = doc.createElementNS(NS_XHTML, 'meta');
    meta.setAttribute('http-equiv', 'Content-Security-Policy');
    meta.setAttribute('content', POLITICA_SIN_SCRIPTS);
    cabecera.insertBefore(meta, cabecera.firstChild);
  }
}

// Primer enlace dentro de una entrada sin enlace propio (los títulos de parte
// de un índice anidado), para poder ir a ella.
function decodificar(texto) {
  try {
    return decodeURIComponent(texto);
  } catch {
    return texto; // "%" suelto en un id: se usa tal cual
  }
}

function primerHref(elementos) {
  for (const e of elementos || []) {
    const h = e.href || primerHref(e.subitems);
    if (h) return h;
  }
  return '';
}

function aplanarIndice(elementos, nivel = 0, lista = []) {
  for (const e of elementos || []) {
    lista.push({ etiqueta: (e.label || '').trim() || 'Sin título', href: e.href, destino: e.href || primerHref(e.subitems), nivel });
    aplanarIndice(e.subitems, nivel + 1, lista);
  }
  return lista;
}

// --- Notas al pie emergentes (mejora 22) ---

const NS_OPS = 'http://www.idpf.org/2007/ops';
const BLOQUES = 'aside, li, p, div, dd, dt, blockquote, td, section';
const MAX_TEXTO_NOTA = 3000;

const tiposDe = (el) => `${el.getAttributeNS?.(NS_OPS, 'type') || el.getAttribute?.('epub:type') || ''} ${el.getAttribute?.('role') || ''}`;
const esTipoNota = (el) => /\b(footnote|endnote|rearnote|note|doc-footnote|doc-endnote)\b/.test(tiposDe(el));
const pareceNota = (el) => /(^|[\s_-])(foot|end)?notes?($|[\s_-]|\d)|^(fn|ftn|nota?|n)\d|footnote|endnote/i.test(`${el.id || ''} ${el.getAttribute?.('class') || ''}`);

// Texto de la llamada sin corchetes ni paréntesis: "1", "*", "iv".
const marcaDe = (enlace) => (enlace.textContent || '').replace(/[\s[\]()]/g, '');

// Primera criba, al tocar: el enlace se declara llamada de nota (EPUB 3 o
// ARIA) o tiene el aspecto de una (texto muy corto: número, asterisco...).
// Un enlace de índice o una referencia con texto largo sigue saltando.
function pareceLlamada(enlace) {
  if (/\b(noteref|doc-noteref)\b/.test(tiposDe(enlace))) return true;
  const marca = marcaDe(enlace);
  return marca.length > 0 && marca.length <= 4;
}

// Texto de la nota a la que apunta el enlace, en párrafos, o null si el
// destino no parece una nota (entonces se salta como siempre).
function textoDeNota(enlace, destino) {
  const declarada = /\b(noteref|doc-noteref)\b/.test(tiposDe(enlace));
  if (/^h[1-6]$/i.test(destino.localName)) return null;
  // El contenedor de la nota: el propio destino si es un bloque, o el bloque
  // que lo contiene (Calibre y Kindle ponen el ancla dentro del párrafo).
  let nota = null;
  for (let el = destino; el?.nodeType === 1 && !nota; el = el.parentElement) if (esTipoNota(el)) nota = el;
  let bloque = nota || (destino.matches?.(BLOQUES) ? destino : destino.closest?.(BLOQUES));
  if (!bloque || /^(body|html)$/i.test(bloque.localName)) return null;
  const senales = declarada || esTipoNota(bloque) || pareceNota(destino) || pareceNota(bloque) || pareceNota(enlace)
    || Boolean(enlace.closest('sup') || enlace.querySelector('sup'));
  if (!senales) return null;
  bloque = bloque.cloneNode(true);
  // Fuera los enlaces de vuelta a la llamada (la marca, "↩"...).
  for (const a of Array.from(bloque.querySelectorAll('a[href]'))) {
    const href = a.getAttribute('href') || '';
    const vuelta = (enlace.id && href.endsWith(`#${enlace.id}`)) || /\b(backlink|doc-backlink)\b/.test(tiposDe(a)) || /^[↩↑⤴^]+$/.test(a.textContent.trim());
    if (vuelta) a.remove();
  }
  const limpio = (t) => t.replace(/\s+/g, ' ').trim();
  const partes = bloque.querySelectorAll('p, li');
  let parrafos = (partes.length ? Array.from(partes) : [bloque]).map((e) => limpio(e.textContent)).filter(Boolean);
  // Sin la marca repetida al principio ("1.", "[1]").
  const marca = marcaDe(enlace);
  if (parrafos.length && marca) {
    const sinMarca = parrafos[0].replace(new RegExp(`^[[(]?${marca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\])]?\\.?(?=\\s|$)\\s*`), '');
    if (sinMarca) parrafos[0] = sinMarca;
  }
  const largo = parrafos.reduce((t, x) => t + x.length, 0);
  if (!largo || largo > MAX_TEXTO_NOTA) return null;
  return parrafos;
}

// --- Libros dañados y libros grandes (mejora 19) ---

const PAGINA_DANADA = `<?xml version="1.0" encoding="utf-8"?><html xmlns="${NS_XHTML}"><head><title>Parte dañada</title></head><body><p style="margin-top:3em;text-align:center;font-style:italic">Esta parte del libro no se puede mostrar porque el archivo del EPUB está dañado. Pasa página para seguir leyendo.</p></body></html>`;

// Un capítulo que falta en el archivo o con XHTML mal formado no debe
// bloquear el lector. Si el XHTML tiene errores (lo más habitual, un &nbsp;
// sin declarar), se vuelve a leer como HTML, que los tolera. Si no se puede
// leer, se muestra una página que lo explica y se sigue con el siguiente.
function cargaTolerante(libro) {
  const cargar = libro.load.bind(libro);
  const capitulos = new Set();
  libro.loaded.spine.then(() => libro.spine.each((s) => capitulos.add(s.url)));
  const xml = (texto) => new DOMParser().parseFromString(texto, 'application/xhtml+xml');
  // El capítulo se lee directamente del archivo: la carga de epub.js no
  // termina nunca si el archivo no se puede descomprimir.
  const leerCapitulo = async (ruta) => {
    const lectura = libro.archive?.getText(libro.resolve(ruta));
    if (!lectura) return cargar(ruta); // libro sin archivo comprimido
    const texto = await conTiempoLimite(lectura, ESPERA_RECURSO_MS, 'no responde');
    return /\.html?$/i.test(ruta) ? new DOMParser().parseFromString(texto, 'text/html') : xml(texto);
  };
  libro.load = async (ruta) => {
    if (!capitulos.has(ruta)) return cargar(ruta);
    try {
      const doc = await leerCapitulo(ruta);
      if (!doc?.getElementsByTagName('parsererror').length) return doc;
      registrar(`Capítulo con errores de XHTML, leído como HTML: ${ruta}`, 'error');
      const html = new DOMParser().parseFromString(await libro.archive.getText(libro.resolve(ruta)), 'text/html');
      const arreglado = document.implementation.createDocument(NS_XHTML, 'html', null);
      arreglado.replaceChild(arreglado.importNode(html.documentElement, true), arreglado.documentElement);
      return arreglado;
    } catch (e) {
      registrar(`Capítulo que no se puede leer (${e?.message || e}): ${ruta}`, 'error');
      return xml(PAGINA_DANADA);
    }
  };
  // Las ubicaciones guardan su propia copia de la función de carga.
  libro.locations.request = libro.load;
}

// Tamaños fijos de los estilos dentro de un capítulo (bloques <style> y
// atributos style), sin tocar el texto: un libro sobre CSS puede contener
// "font-size: 12px" como ejemplo.
function escalarEnCapitulo(xhtml) {
  return xhtml
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, a, css, b) => a + escalarTamanosFijos(css) + b)
    .replace(/(\sstyle\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi, (_, a, doble, simple) => (doble != null
      ? `${a}"${escalarTamanosFijos(doble)}"` : `${a}'${escalarTamanosFijos(simple)}'`));
}

// epub.js descomprime todas las imágenes y fuentes del libro antes de mostrar
// la primera página: en un libro ilustrado, cientos de MB. Aquí se crean solo
// las de cada capítulo al pintarlo. Devuelve la función que libera las hojas
// de estilo creadas.
function recursosBajoDemanda(libro) {
  // Posición del recurso -> promesa de su URL. Dos memorias: los recursos tal
  // cual (planas) y las hojas de estilo ya preparadas. Una hoja se prepara
  // solo con recursos tal cual, así nunca espera a otra hoja ni a sí misma
  // (una hoja que nombraba su propio archivo dejaba el capítulo en blanco).
  const planas = new Map();
  const preparadas = new Map();
  const propias = [];
  libro.replacements = function replacementsBajoDemanda() {
    const recursos = this.resources;
    const absoluta = (i) => recursos.settings.resolver(recursos.urls[i]);
    const sustituir = async (texto, relativas, crear) => {
      const usadas = relativas.map((r, i) => i).filter((i) => relativas[i] && texto.includes(relativas[i]))
        .sort((a, b) => relativas[b].length - relativas[a].length);
      const nuevas = await Promise.all(usadas.map(crear));
      usadas.forEach((i, k) => { if (nuevas[k]) texto = texto.split(relativas[i]).join(nuevas[k]); });
      return texto;
    };
    // epub.js no da por terminada la creación de un recurso que no se puede
    // descomprimir (su promesa no se resuelve nunca) y el capítulo se quedaría
    // en blanco esperándolo. Con un plazo, se pinta sin ese recurso.
    const conPlazo = (promesa, ruta) => conTiempoLimite(Promise.resolve(promesa), ESPERA_RECURSO_MS, 'no responde')
      .catch((e) => {
        registrar(`Lector: recurso del libro que no se puede leer (${e?.message || e}): ${ruta}`, 'error');
        return null;
      });
    // Se lee el recurso directamente del archivo (getBlob sí avisa si falla) y
    // se crea su URL aquí, en lugar de con createUrl de epub.js.
    const crearUrl = async (ruta) => {
      const lectura = recursos.settings.archive.getBlob(ruta);
      if (!lectura) throw new Error('no está en el EPUB');
      const url = URL.createObjectURL(await lectura);
      propias.push(url);
      return url;
    };
    // Recursos en preparación, para anotarlos si un capítulo tarda.
    const pendientes = new Set();
    const seguir = (ruta, promesa) => {
      pendientes.add(ruta);
      return promesa.finally(() => pendientes.delete(ruta));
    };
    const urlSimple = (i) => {
      if (!planas.has(i)) planas.set(i, seguir(absoluta(i), conPlazo(crearUrl(absoluta(i)), absoluta(i))));
      return planas.get(i);
    };
    // Una hoja de estilo, con sus fuentes e imágenes ya sustituidas.
    const urlDe = (i) => {
      if (!recursos.cssUrls.includes(recursos.urls[i])) return urlSimple(i);
      if (!preparadas.has(i)) {
        preparadas.set(i, seguir(absoluta(i), (async () => {
          const ruta = absoluta(i);
          const original = await conPlazo(recursos.settings.archive.getText(ruta), ruta);
          if (original == null) return null;
          const relativas = recursos.relativeTo(ruta);
          relativas[i] = null; // su propio nombre no se sustituye
          const texto = escalarTamanosFijos(await sustituir(original, relativas, urlSimple));
          const url = URL.createObjectURL(new Blob([texto], { type: 'text/css' }));
          propias.push(url);
          return url;
        })().catch(() => null)));
      }
      return preparadas.get(i);
    };
    // Plazo para la sustitución completa de un capítulo: si no termina, se
    // pinta tal cual (sin sus imágenes, fuentes ni estilos) y se anota qué
    // seguía pendiente. Un capítulo sin imágenes es mejor que uno en blanco.
    this.spine.hooks.serialize.register(async (salida, seccion) => {
      try {
        let plazo;
        const vencido = new Promise((resolver) => { plazo = setTimeout(() => resolver(null), ESPERA_CAPITULO_MS); });
        const sustituido = await Promise.race([sustituir(salida, recursos.relativeTo(seccion.url), urlDe), vencido]);
        clearTimeout(plazo);
        if (sustituido == null) {
          registrar(`Lector: ${seccion.href} se pinta sin sus imágenes ni estilos porque no estaban listos en ${ESPERA_CAPITULO_MS / 1000} s. Pendientes: ${[...pendientes].join(', ') || 'ninguno'}`, 'error');
          seccion.output = escalarEnCapitulo(salida);
          return;
        }
        seccion.output = escalarEnCapitulo(sustituido);
      } catch (e) {
        // Mejor el capítulo sin imágenes que un capítulo en blanco.
        registrar(`Lector: recursos de ${seccion.href} sin cargar (${e.message})`, 'error');
        seccion.output = salida;
      }
    });
    return Promise.resolve();
  };
  return () => propias.forEach((u) => URL.revokeObjectURL(u));
}

// opciones: { perfil, ajustes, cfiInicial, ubicaciones, avisos, cancelado }
// avisos: { alCambiarPosicion(info), alTocarCentro(), alDeslizarAbajo(),
//           alGenerarUbicaciones(json), alRepaginar(), alPasarPagina() }
// cancelado(): devuelve true si la apertura ya no interesa. Se comprueba tras
// cada espera; en ese caso se libera todo y se lanza AperturaCancelada.
export async function abrirLibro(contenedor, datos, opciones) {
  let { perfil, ajustes } = opciones;
  const avisos = opciones.avisos || {};
  const cancelado = opciones.cancelado || (() => false);
  const movil = perfil === 'movil';
  const inicio = performance.now();
  await cargarEpub();
  if (cancelado()) throw new AperturaCancelada();
  const libro = ePub(datos);
  libro.spine.hooks.content.register(neutralizarScripts);
  cargaTolerante(libro);
  const liberarRecursos = recursosBajoDemanda(libro);
  const megas = (datos.byteLength || datos.size || 0) / (1024 * 1024);
  const extra = Math.round(megas * MS_EXTRA_POR_MB);

  try {
    await conTiempoLimite(libro.ready, LIMITE_APERTURA_MS + extra, 'tiempo de apertura agotado');
  } catch (e) {
    liberarRecursos();
    libro.destroy();
    registrar(`No se pudo abrir el EPUB: ${e.message}`, 'error');
    throw new Error(MENSAJE_LIBRO_ILEGIBLE);
  }
  if (cancelado()) {
    liberarRecursos();
    libro.destroy();
    throw new AperturaCancelada();
  }

  const metadatos = libro.packaging.metadata;
  const rtl = metadatos.direction === 'rtl';

  // Índice y etiqueta de capítulo por sección del spine. Los enlaces del índice
  // son relativos al archivo del índice, que puede estar en una subcarpeta.
  const baseIndice = directorio(libro.packaging.navPath || libro.packaging.ncxPath);
  const resolver = (ruta) => {
    if (!ruta) return { href: '', seccion: null };
    let href = ruta;
    let seccion = libro.spine.get(href);
    if (!seccion && baseIndice) {
      href = unirRuta(baseIndice, ruta);
      seccion = libro.spine.get(href);
    }
    return { href, seccion: seccion?.index ?? null };
  };
  const indice = aplanarIndice(libro.navigation?.toc).map((e) => {
    const { href, seccion } = resolver(e.href);
    // destino: dónde lleva tocar la entrada (los títulos sin enlace, a su
    // primer capítulo); no cuenta para la etiqueta de capítulo.
    const destino = e.href ? href : resolver(e.destino).href;
    return { ...e, href, destino, seccion, ancla: href.includes('#') ? decodificar(href.split('#')[1]) : null };
  });
  const etiquetaPorSeccion = new Map();
  for (const e of indice) {
    if (e.seccion !== null && !etiquetaPorSeccion.has(e.seccion)) etiquetaPorSeccion.set(e.seccion, e.etiqueta);
  }
  function etiquetaCapitulo(indiceSeccion) {
    for (let i = indiceSeccion; i >= 0; i--) {
      if (etiquetaPorSeccion.has(i)) return etiquetaPorSeccion.get(i);
    }
    return null;
  }

  // Varias entradas del índice pueden apuntar a anclas del mismo archivo (un
  // libro en un solo XHTML, o subapartados). La entrada actual es la última
  // cuya ancla queda antes del principio de la página. Los CFI de las anclas
  // se calculan al cargar cada sección.
  const cfiAncla = new Map(); // posición en el índice -> CFI del ancla
  function anotarAnclas(contents) {
    indice.forEach((e, i) => {
      if (e.seccion !== contents.sectionIndex || !e.ancla) return;
      try {
        const el = contents.document.getElementById(e.ancla);
        if (el) cfiAncla.set(i, contents.cfiFromNode(el));
      } catch {
        // ancla que no se puede situar: cuenta como el principio de la sección
      }
    });
  }
  function entradaActual(indiceSeccion, cfiInicio) {
    let elegida = -1;
    let comparador = null;
    for (let i = 0; i < indice.length; i++) {
      if (indice[i].seccion !== indiceSeccion) continue;
      if (elegida === -1) {
        elegida = i;
        continue;
      }
      const cfi = cfiAncla.get(i);
      if (!cfi || !cfiInicio) continue;
      try {
        comparador ||= new ePub.CFI();
        if (comparador.compare(cfi, cfiInicio) <= 0) elegida = i;
      } catch {
        // CFI no comparable: se mantiene la anterior
      }
    }
    return elegida;
  }

  let css = cssLibro(perfil, ajustes);

  function calcularHueco() {
    const hueco = Math.round(contenedor.clientWidth * proporcionMargenes(ajustes));
    return hueco % 2 ? hueco + 1 : hueco;
  }

  // Doble página: solo en horizontal y en pantallas grandes (la tablet girada).
  // En el iPhone girado el alto no llega y se mantiene una sola página.
  const ANCHO_MINIMO_DOBLE = 700;
  const ALTO_MINIMO_DOBLE = 500;
  function quiereDosPaginas() {
    const ancho = contenedor.clientWidth;
    const alto = contenedor.clientHeight;
    return ajustes.dosPaginas !== false && ancho > alto && ancho >= ANCHO_MINIMO_DOBLE && alto >= ALTO_MINIMO_DOBLE;
  }
  let dosPaginas = quiereDosPaginas();

  function pintarFondo() {
    contenedor.style.background = temaEfectivo(perfil, ajustes).fondo;
  }
  pintarFondo();

  const rendition = libro.renderTo(contenedor, {
    width: '100%',
    height: '100%',
    flow: 'paginated',
    spread: dosPaginas ? 'always' : 'none',
    minSpreadWidth: 1,
    gap: calcularHueco(),
    manager: movil ? 'continuous' : 'default',
    allowScriptedContent: true, // ver nota al principio: necesario en Safari
  });

  let ultimoToque = 0;
  let destruido = false;
  let ultimaPosicion = null;

  // --- Estilos dentro del libro ---

  function instalarEstilos(contents) {
    const doc = contents.document;
    const enlace = doc.createElement('link');
    enlace.rel = 'stylesheet';
    enlace.href = URL_FUENTES;
    doc.head.appendChild(enlace);
    const estilo = doc.createElement('style');
    estilo.id = 'lector-ajustes';
    estilo.textContent = css;
    doc.head.appendChild(estilo);
  }

  // Fuerza el repaginado aunque el tamaño del visor no cambie. epub.js vuelve
  // a pintar la posición actual al terminar.
  function repaginar() {
    const manager = rendition.manager;
    if (!manager || destruido) return;
    const quiere = quiereDosPaginas();
    if (quiere !== dosPaginas) {
      dosPaginas = quiere;
      rendition.spread(dosPaginas ? 'always' : 'none', 1);
      registrar(`Lector: ${dosPaginas ? 'doble página' : 'una página'} (${contenedor.clientWidth} x ${contenedor.clientHeight} px)`);
    }
    manager.settings.gap = calcularHueco();
    rendition.settings.gap = manager.settings.gap;
    avisos.alRepaginar?.();
    manager._stageSize = undefined;
    rendition.resize();
  }

  // Aplica los ajustes "Aa". El tema solo cambia colores; el tamaño, la
  // fuente, el interlineado, los márgenes y la justificación repaginan.
  function aplicarAjustes(nuevoPerfil, nuevosAjustes) {
    const repagina = cambioRepagina(ajustes, nuevosAjustes);
    perfil = nuevoPerfil;
    ajustes = nuevosAjustes;
    css = cssLibro(perfil, ajustes);
    pintarFondo();
    for (const c of rendition.getContents()) {
      const estilo = c.document.getElementById('lector-ajustes');
      if (estilo) estilo.textContent = css;
    }
    if (datosSubrayados.length) pintarSubrayados(datosSubrayados); // colores según el tema
    if (repagina) repaginar();
  }

  // Al girar la pantalla epub.js repagina solo, pero los márgenes dependen del
  // ancho: si no coinciden, se repagina otra vez con el hueco correcto.
  rendition.on('resized', () => {
    if (destruido) return;
    avisos.alRepaginar?.();
    if (!rendition.manager) return;
    if (rendition.manager.settings.gap !== calcularHueco() || quiereDosPaginas() !== dosPaginas) repaginar();
  });

  // --- Paso de página ---

  function contenedorDesplazable() {
    return rendition.manager?.container;
  }

  function anchoPagina() {
    return rendition.manager?.layout?.delta || contenedor.clientWidth;
  }

  // Animación del perfil Móvil. En Safari, mover scrollLeft en cada fotograma
  // obliga a repintar el texto, porque el contenedor no tiene aceleración
  // gráfica. Por eso se mueven las vistas con una transformación CSS (la hace
  // la tarjeta gráfica) y, al terminar, se fija scrollLeft en un solo paso.
  // "desplazamiento" es lo que se ha avanzado visualmente respecto a scrollLeft.

  function vistas() {
    return Array.from(contenedorDesplazable()?.children || []);
  }

  function moverVistas(desplazamiento) {
    const transformacion = desplazamiento ? `translateX(${-desplazamiento}px)` : '';
    for (const v of vistas()) v.style.transform = transformacion;
  }

  // Termina al instante la animación en curso (un toque nuevo no espera).
  let terminarAnimacion = null;

  function acabarAnimacionYa() {
    terminarAnimacion?.();
  }

  // epub.js marca sus propios desplazamientos "silenciosos" para no avisar de
  // ellos; si el desplazamiento no llega a ocurrir (ya estaba en 0, o en el
  // principio o el final del libro), la marca se queda puesta y se tragaría el
  // siguiente paso de página de la app, que no se guardaría. Se quita antes de
  // desplazar para que epub.js avise siempre de la nueva posición.
  function desplazar(d, px) {
    if (rendition.manager) rendition.manager.ignore = false;
    d.scrollLeft += px;
  }

  // velocidad: px por ms del dedo al soltar (si la página venía arrastrada).
  function animarVistas(desde, hasta, velocidad = null) {
    acabarAnimacionYa();
    const d = contenedorDesplazable();
    if (!d || desde === hasta) {
      moverVistas(0);
      if (d && hasta) desplazar(d, hasta);
      return Promise.resolve();
    }
    const distancia = Math.abs(hasta - desde);
    let duracion = Math.max(120, DURACION_ANIMACION_MS * Math.min(1, distancia / anchoPagina()));
    let curva = 'cubic-bezier(0.2, 0.7, 0.3, 1)';
    if (velocidad) {
      const v = Math.max(velocidad, 0.4);
      duracion = Math.min(320, Math.max(140, (PENDIENTE_SALIDA * distancia) / v));
      curva = curvaDesde(v, distancia, duracion);
    }
    const animaciones = vistas().map((v) => v.animate(
      [{ transform: `translateX(${-desde}px)` }, { transform: `translateX(${-hasta}px)` }],
      { duration: duracion, easing: curva, fill: 'forwards' },
    ));
    return new Promise((resolver) => {
      let terminada = false;
      const terminar = () => {
        if (terminada) return;
        terminada = true;
        terminarAnimacion = null;
        // En el mismo fotograma: primero se quitan las transformaciones (si no,
        // cuentan en el área desplazable y limitan scrollLeft) y después se fija
        // la posición definitiva.
        animaciones.forEach((a) => a.cancel());
        moverVistas(0);
        if (hasta) desplazar(d, hasta);
        resolver();
      };
      terminarAnimacion = terminar;
      if (animaciones.length) animaciones[0].onfinish = terminar;
      else terminar();
    });
  }

  // Ancho del contenido cargado. Con scrollWidth no basta: Safari descuenta
  // el translateX de las vistas mientras se arrastra y, con una sola página
  // por delante, el lector creía que no había más, frenaba el arrastre y
  // devolvía la página (mejora 20). El ancho de las vistas no cambia.
  function anchoContenido(d) {
    return Math.max(d.scrollWidth, vistas().reduce((t, v) => t + v.offsetWidth, 0));
  }

  function hayMasContenido(direccion) {
    const d = contenedorDesplazable();
    if (!d) return false;
    if (direccion > 0) return d.scrollLeft + d.clientWidth + anchoPagina() <= anchoContenido(d) + 1;
    return d.scrollLeft - anchoPagina() >= -1;
  }

  // epub.js carga el capítulo siguiente al llegar a la penúltima página, justo
  // cuando se va a deslizar otra vez: en el iPhone ese trabajo coincide con el
  // gesto. Se adelanta a unas páginas antes del final, con la página quieta.
  function precargarSiguiente() {
    const d = contenedorDesplazable();
    const m = rendition.manager;
    if (destruido || !movil || rtl || !d || !m?.check) return;
    const margen = PAGINAS_PRECARGA * anchoPagina();
    const resto = anchoContenido(d) - (d.scrollLeft + d.clientWidth);
    // Con margen menor que scrollLeft, check() no carga el capítulo anterior.
    if (resto > margen || d.scrollLeft < margen) return;
    const ultima = m.views.last();
    if (!ultima?.section?.next() || ultima.section.index !== ultimaPosicion?.end?.index) return;
    Promise.resolve(m.check(margen)).catch(() => {});
  }

  // Al deslizar en la última página de un capítulo, si el contiguo aún no está
  // cargado, se espera a que lo esté (la página queda donde la dejó el dedo)
  // en lugar de devolverla a su sitio y saltar sin animación.
  async function esperarContiguo(direccion) {
    const m = rendition.manager;
    const vista = direccion > 0 ? m?.views.last() : m?.views.first();
    const contiguo = direccion > 0 ? vista?.section?.next() : vista?.section?.prev();
    if (!m?.check || !contiguo) return null; // principio o final del libro
    Promise.resolve(m.check(1)).catch(() => {});
    const hasta = performance.now() + ESPERA_CONTIGUO_MS;
    while (!destruido && performance.now() < hasta) {
      await new Promise((r) => setTimeout(r, 50));
      if (hayMasContenido(direccion)) return true;
    }
    return false;
  }

  // Lleva la página a la siguiente (1), la anterior (-1) o la de partida (0).
  // arrastre: lo que el dedo ya ha desplazado la página (perfil Móvil).
  function completarPaso(direccion, arrastre = 0, velocidad = null) {
    // En los libros de derecha a izquierda, el desplazamiento horizontal va al
    // revés: se pasa con epub.js, que ya lo tiene en cuenta (sin animación).
    if (!movil || rtl) {
      if (direccion === 0) {
        moverVistas(0);
        return Promise.resolve();
      }
      return direccion > 0 ? rendition.next() : rendition.prev();
    }
    if (direccion !== 0 && !hayMasContenido(direccion)) {
      return esperarContiguo(direccion).then((cargado) => {
        if (cargado && !destruido) return animarVistas(arrastre, direccion * anchoPagina(), velocidad);
        // Sin capítulo contiguo a tiempo (o al principio o al final del
        // libro): se recoloca la página y se pasa sin animación. El retraso
        // queda en el registro por si se repite.
        if (cargado === false) traza(`capítulo ${direccion > 0 ? 'siguiente' : 'anterior'} sin cargar al deslizar`);
        return animarVistas(arrastre, 0, velocidad).then(() => (direccion > 0 ? rendition.next() : rendition.prev()));
      });
    }
    return animarVistas(arrastre, direccion * anchoPagina(), velocidad);
  }

  function traza(texto) {
    registrar(`Lector: ${texto}`);
  }

  function huellaPosicion() {
    const d = contenedorDesplazable();
    return `${ultimaPosicion?.start?.cfi}|${d?.scrollLeft}`;
  }

  // Último recurso: ir al principio del capítulo siguiente o anterior.
  function saltarCapitulo(direccion) {
    const indice = direccion > 0 ? ultimaPosicion?.end?.index + 1 : ultimaPosicion?.start?.index - 1;
    const seccion = Number.isInteger(indice) ? libro.spine.get(indice) : null;
    if (!seccion) {
      traza(direccion > 0 ? 'no hay más páginas' : 'no hay páginas anteriores');
      return;
    }
    traza(`salto al capítulo ${indice}`);
    rendition.display(seccion.href);
  }

  // Pasa de página y comprueba que se ha movido. Si no, prueba con
  // rendition.next() o prev() y, si tampoco, salta de capítulo. Cada paso
  // lleva un número: si el usuario ha pasado otra página mientras tanto, la
  // comprobación de este paso ya no vale y se descarta.
  let ultimoPaso = 0;
  let vigilancia = 0; // turno de la vigilancia de la posición al abrir o saltar

  function pasar(direccion, arrastre = 0, velocidad = null) {
    if (direccion !== 0) avisos.alPasarPagina?.();
    const miPaso = ++ultimoPaso;
    const vigente = () => !destruido && miPaso === ultimoPaso;
    const antes = huellaPosicion();
    const despues = (promesa, accion) => Promise.resolve(promesa)
      .catch((e) => traza(`error al pasar página: ${e.message}`))
      .then(() => new Promise((r) => setTimeout(r, ESPERA_COMPROBACION_MS)))
      .then(() => { if (vigente()) accion(); });
    despues(completarPaso(direccion, arrastre, velocidad), () => {
      if (huellaPosicion() !== antes) {
        if (direccion > 0) precargarSiguiente();
        return;
      }
      traza('la página no se ha movido. Se usa el paso de respaldo');
      const antesRespaldo = huellaPosicion();
      despues(direccion > 0 ? rendition.next() : rendition.prev(), () => {
        if (huellaPosicion() !== antesRespaldo) return;
        saltarCapitulo(direccion);
      });
    });
  }

  function siguiente() {
    acabarAnimacionYa();
    pasar(1);
  }

  function anterior() {
    acabarAnimacionYa();
    pasar(-1);
  }

  // --- Gestos dentro del iframe ---

  function xEnVisor(evento, contents) {
    const marco = contents.window.frameElement;
    const rMarco = marco.getBoundingClientRect();
    const rVisor = contenedor.getBoundingClientRect();
    return evento.clientX + rMarco.left - rVisor.left;
  }

  // Enlaces que epub.js sigue dentro del libro. Los externos (web, correo,
  // imágenes enlazadas) los marca con target=_blank y la app no los abre: un
  // toque en ellos cuenta como un toque normal (pasar página, controles).
  function enlaceInterno(objetivo) {
    const enlace = objetivo.closest?.('a[href]');
    return Boolean(enlace) && enlace.getAttribute('target') !== '_blank' && !/^mailto:/i.test(enlace.getAttribute('href') || '');
  }

  function actuarPorZona(x) {
    const ancho = contenedor.clientWidth;
    if (x < ancho / 3) anterior();
    else if (x > (ancho * 2) / 3) siguiente();
    else avisos.alTocarCentro?.();
  }

  // Rueda del ratón y desplazamiento con el panel táctil (ordenador): una
  // página por gesto. El panel táctil sigue enviando movimiento un rato al
  // soltar (inercia): hasta que para, no se pasa otra página.
  const rueda = { suma: 0, ultima: 0, bloqueada: false };
  function alGirarRueda(e) {
    if (e.ctrlKey) return; // zoom del navegador
    e.preventDefault();
    const escala = e.deltaMode === 1 ? 16 : 1;
    const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * escala;
    const ahora = performance.now();
    const quieta = ahora - rueda.ultima > 180;
    rueda.ultima = ahora;
    if (rueda.bloqueada && !quieta) return;
    rueda.bloqueada = false;
    if (quieta) rueda.suma = 0;
    rueda.suma += delta;
    if (Math.abs(rueda.suma) < 40) return;
    const adelante = rueda.suma > 0;
    rueda.suma = 0;
    rueda.bloqueada = true;
    if (adelante) siguiente();
    else anterior();
  }
  contenedor.addEventListener('wheel', alGirarRueda, { passive: false });

  // --- Subrayados y notas (mejora 26) ---

  let seleccionActual = null;
  const haySeleccion = (doc) => {
    const sel = doc.getSelection?.();
    return Boolean(sel && !sel.isCollapsed && sel.toString().trim());
  };
  function quitarSeleccion() {
    for (const c of rendition.getContents()) c.window?.getSelection?.()?.removeAllRanges();
    seleccionActual = null;
  }

  // Con los resaltados nativos (::highlight, Safari 17.2 y Chrome 105 en
  // adelante) el color va detrás del texto. Sin ellos, capa de epub.js encima,
  // tenue para no tapar las letras.
  const resaltadoNativo = typeof Highlight === 'function' && Boolean(window.CSS?.highlights);
  let datosSubrayados = [];
  function resaltarEnCapitulo(contents) {
    const win = contents.window;
    if (!win?.CSS?.highlights || typeof win.Highlight !== 'function') return;
    const grupos = {};
    const cfi = new ePub.CFI();
    for (const a of datosSubrayados) {
      try {
        if (cfi.parse(a.cfi).spinePos !== contents.sectionIndex) continue;
        const color = COLORES[a.color] ? a.color : 'amarillo';
        (grupos[color] ||= new win.Highlight()).add(contents.range(a.cfi));
      } catch {
        // CFI que no se puede situar en este capítulo
      }
    }
    for (const color of Object.keys(COLORES)) {
      if (grupos[color]) win.CSS.highlights.set(`subrayado-${color}`, grupos[color]);
      else win.CSS.highlights.delete(`subrayado-${color}`);
    }
  }
  if (resaltadoNativo) rendition.hooks.content.register(resaltarEnCapitulo);

  // Subrayados pintados con la capa de epub.js: id -> { cfi, tipo }.
  let subrayados = new Map();
  function estiloSubrayado(color) {
    if (perfil === 'tinta') {
      return { tipo: 'underline', estilos: { stroke: colorTinta(color), 'stroke-opacity': '1', 'stroke-width': '3', 'mix-blend-mode': 'normal' } };
    }
    const oscuro = temaEfectivo(perfil, ajustes).fondo.toLowerCase() === '#000000';
    return { tipo: 'highlight', estilos: { fill: COLORES[color] || COLORES.amarillo, 'fill-opacity': oscuro ? '0.25' : '0.3', 'mix-blend-mode': oscuro ? 'screen' : 'multiply' } };
  }
  function pintarSubrayados(lista) {
    datosSubrayados = lista;
    if (resaltadoNativo) {
      for (const c of rendition.getContents()) resaltarEnCapitulo(c);
      return;
    }
    for (const [, s] of subrayados) {
      try { rendition.annotations.remove(s.cfi, s.tipo); } catch { /* ya no estaba */ }
    }
    subrayados = new Map();
    for (const a of lista) {
      const { tipo, estilos } = estiloSubrayado(a.color);
      try {
        rendition.annotations.add(tipo, a.cfi, { id: a.id }, null, `subrayado-${a.color}`, estilos);
        subrayados.set(a.id, { cfi: a.cfi, tipo });
      } catch (e) {
        registrar(`Lector: no se pudo pintar un subrayado (${e.message})`, 'error');
      }
    }
  }
  // Subrayado bajo un punto de la página (coordenadas del capítulo).
  function subrayadoEn(contents, x, y) {
    if (!datosSubrayados.length) return null;
    const cfi = new ePub.CFI();
    for (const a of datosSubrayados) {
      try {
        if (cfi.parse(a.cfi).spinePos !== contents.sectionIndex) continue;
        const rango = contents.range(a.cfi);
        for (const r of rango.getClientRects()) {
          if (x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2) return a.id;
        }
      } catch {
        // CFI que no se puede situar en este capítulo
      }
    }
    return null;
  }

  function instalarGestos(contents) {
    const doc = contents.document;
    doc.addEventListener('wheel', alGirarRueda, { passive: false });
    let gesto = null;

    // Anula el gesto en curso y, si se estaba arrastrando, recoloca la página.
    function anularGesto() {
      if (gesto?.arrastrando && movil) completarPaso(0, gesto.arrastre || 0);
      gesto = null;
    }

    doc.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) {
        anularGesto();
        return;
      }
      acabarAnimacionYa(); // un toque durante la animación no espera a que acabe
      const t = e.touches[0];
      gesto = {
        x0: t.screenX,
        y0: t.screenY,
        cx: t.clientX,
        cy: t.clientY,
        t0: performance.now(),
        xVisor: xEnVisor(t, contents),
        arrastrando: false,
        movido: false,
        // Con texto seleccionado, un toque solo quita la selección (mejora 26).
        habiaSeleccion: haySeleccion(doc),
        muestras: [{ x: t.screenX, t: performance.now() }],
      };
    }, { passive: true });

    doc.addEventListener('touchmove', (e) => {
      if (!gesto || e.touches.length !== 1) return;
      // Pulsación larga o asas de la selección: es una selección de texto, no
      // un paso de página. Se deja hacer al sistema.
      if (gesto.seleccionando) return;
      if (!gesto.arrastrando && (haySeleccion(doc) || performance.now() - gesto.t0 > ESPERA_PULSACION_LARGA_MS)) {
        gesto.seleccionando = true;
        return;
      }
      const t = e.touches[0];
      const dx = t.screenX - gesto.x0;
      const dy = t.screenY - gesto.y0;
      if (Math.abs(dx) > UMBRAL_MOVIMIENTO_PX || Math.abs(dy) > UMBRAL_MOVIMIENTO_PX) gesto.movido = true;
      if (!gesto.arrastrando && Math.abs(dx) > UMBRAL_MOVIMIENTO_PX && Math.abs(dx) > Math.abs(dy)) {
        gesto.arrastrando = true;
      }
      if (gesto.movido) e.preventDefault();
      const ahora = performance.now();
      gesto.muestras.push({ x: t.screenX, t: ahora });
      while (gesto.muestras.length > 2 && ahora - gesto.muestras[0].t > MUESTRAS_GESTO_MS) gesto.muestras.shift();
      if (gesto.arrastrando && movil && !rtl) {
        // Sin más contenido en esa dirección, el arrastre se frena.
        const direccion = dx < 0 ? 1 : -1;
        gesto.arrastre = hayMasContenido(direccion) ? -dx : -dx / 4;
        moverVistas(gesto.arrastre);
      }
    }, { passive: false });

    // El sistema puede cancelar el gesto (llamada, gesto de iOS).
    doc.addEventListener('touchcancel', anularGesto);

    doc.addEventListener('touchend', (e) => {
      if (!gesto) return;
      const g = gesto;
      gesto = null;
      ultimoToque = Date.now();
      const t = e.changedTouches[0];
      const dx = t.screenX - g.x0;
      const dy = t.screenY - g.y0;
      const duracion = performance.now() - g.t0;

      if (g.arrastrando) {
        const velocidad = Math.abs(dx) / Math.max(duracion, 1);
        const pasa = Math.abs(dx) > UMBRAL_DESLIZAR_PX || velocidad > 0.3;
        // Velocidad del dedo justo al soltar, para continuar el movimiento.
        const primera = g.muestras[0];
        const ultima = g.muestras[g.muestras.length - 1];
        const alSoltar = Math.abs(ultima.x - primera.x) / Math.max(1, ultima.t - primera.t);
        if (!pasa) completarPaso(0, g.arrastre || 0, alSoltar);
        else pasar(dx < 0 ? 1 : -1, g.arrastre || 0, alSoltar);
        return;
      }
      if (g.seleccionando || haySeleccion(doc)) return; // la selección la atiende alSeleccionar
      if (!g.movido && duracion < MAX_DURACION_TOQUE_MS) {
        if (g.habiaSeleccion) return; // el toque ha quitado la selección
        if (enlaceInterno(e.target)) return; // los enlaces del libro funcionan
        e.preventDefault(); // evita el clic sintético y el zoom por doble toque
        // Un toque sobre un subrayado lo abre (mejora 26).
        const tocado = subrayadoEn(contents, g.cx, g.cy);
        if (tocado) {
          avisos.alTocarSubrayado?.(tocado);
          return;
        }
        actuarPorZona(g.xVisor);
        return;
      }
      if (dy > 80 && Math.abs(dy) > Math.abs(dx) * 1.5) avisos.alDeslizarAbajo?.();
    }, { passive: false });

    // Ratón (ordenador). Se ignora el clic que el navegador genera tras un toque.
    doc.addEventListener('click', (e) => {
      if (Date.now() - ultimoToque < VENTANA_CLIC_TRAS_TOQUE_MS) return;
      if (haySeleccion(doc)) return; // se acaba de seleccionar texto con el ratón
      if (enlaceInterno(e.target)) return;
      if (e.target.closest?.('a[href]')) e.preventDefault(); // externo: no se intenta abrir
      const tocado = subrayadoEn(contents, e.clientX, e.clientY);
      if (tocado) {
        avisos.alTocarSubrayado?.(tocado);
        return;
      }
      actuarPorZona(xEnVisor(e, contents));
    });

    // Selección de texto (mejora 26): cuando deja de cambiar, se avisa con su
    // rango como CFI y su texto; si se quita, se avisa con null.
    let esperaSeleccion = null;
    doc.addEventListener('selectionchange', () => {
      clearTimeout(esperaSeleccion);
      esperaSeleccion = setTimeout(() => {
        if (destruido) return;
        const sel = doc.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) {
          if (seleccionActual?.contents === contents) {
            seleccionActual = null;
            avisos.alSeleccionar?.(null);
          }
          return;
        }
        const rango = sel.getRangeAt(0);
        const texto = rango.toString().replace(/\s+/g, ' ').trim();
        if (!texto) return;
        let cfi = null;
        try {
          cfi = contents.cfiFromRange(rango);
        } catch {
          cfi = null;
        }
        if (!cfi) return;
        seleccionActual = { contents };
        const info = ultimaPosicion ? infoPosicion(ultimaPosicion) : {};
        avisos.alSeleccionar?.({
          cfi,
          texto: texto.slice(0, MAX_TEXTO_SUBRAYADO),
          seccion: contents.sectionIndex,
          capitulo: etiquetaCapitulo(contents.sectionIndex) || info.capitulo || null,
          porcentaje: info.porcentaje ?? null,
        });
      }, ESPERA_SELECCION_MS);
    });

    doc.addEventListener('keydown', alPulsarTecla);
  }

  function alPulsarTecla(e) {
    // No en un campo de texto o en la barra del libro (las flechas mueven el
    // cursor o la barra) ni con un panel u hoja abiertos.
    if (e.target?.closest?.('input, textarea, select')) return;
    if (document.querySelector('[role="dialog"]:not([hidden])')) return;
    // Flechas, Avance y Retroceso de página y espacio (los mandos Bluetooth
    // para pasar página envían estas teclas).
    const adelante = e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey);
    const atras = e.key === 'ArrowLeft' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey);
    if (!adelante && !atras) return;
    if (e.target?.closest?.('button, a[href]') && e.key === ' ') return; // el espacio pulsa el botón
    e.preventDefault(); // sin desplazar la página
    if (adelante) siguiente();
    else anterior();
  }

  // Notas al pie (mejora 22): al tocar la llamada de una nota se avisa con su
  // texto en lugar de saltar. Se intercepta el clic antes de que llegue al
  // enlace, donde epub.js tiene su salto; si el destino no resulta ser una
  // nota, se salta como siempre.
  async function buscarDestino(enlace, contents) {
    const seccion = libro.spine.get(contents.sectionIndex);
    if (!seccion) return null;
    const url = new URL(enlace.getAttribute('href'), `http://libro${seccion.url}`);
    const id = decodificar(url.hash.slice(1));
    if (!id) return null;
    const ruta = decodificar(url.pathname);
    if (ruta === seccion.url) return contents.document.getElementById(id);
    const otra = libro.spine.spineItems.find((s) => s.url === ruta);
    const doc = otra ? (await otra.load(libro.load.bind(libro)), otra.document) : await libro.load(ruta);
    return doc?.getElementById(id) || null;
  }

  function instalarNotas(contents) {
    contents.document.addEventListener('click', (e) => {
      const enlace = e.target.closest?.('a[href]');
      if (!enlace || !avisos.alTocarNota || !enlaceInterno(enlace) || !pareceLlamada(enlace)) return;
      e.preventDefault();
      e.stopPropagation(); // el salto de epub.js está en el propio enlace
      const saltar = () => enlace.onclick?.call(enlace, new MouseEvent('click'));
      buscarDestino(enlace, contents)
        .then((destino) => (destino ? textoDeNota(enlace, destino) : null))
        .catch(() => null)
        .then((parrafos) => {
          if (destruido) return;
          if (!parrafos) {
            saltar();
            return;
          }
          const marca = marcaDe(enlace);
          avisos.alTocarNota({ titulo: marca && marca.length <= 4 ? `Nota ${marca}` : 'Nota', parrafos, irALaNota: saltar });
        });
    }, true);
  }

  rendition.hooks.content.register(instalarEstilos);
  rendition.hooks.content.register(anotarAnclas);
  rendition.hooks.content.register(instalarGestos);
  rendition.hooks.content.register(instalarNotas);
  // Enlace interno del libro (nota, índice dentro del texto): antes de que
  // epub.js salte, se avisa con la posición de partida para poder volver.
  rendition.hooks.content.register((contents) => {
    contents.on('linkClicked', () => {
      vigilancia += 1; // el salto por enlace manda sobre la posición al abrir
      if (ultimaPosicion) avisos.alSaltarPorEnlace?.(ultimaPosicion.start.cfi, infoPosicion(ultimaPosicion));
    });
  });
  document.addEventListener('keydown', alPulsarTecla);

  // --- Posición ---

  // Las ubicaciones (para el porcentaje y la barra) solo valen cuando están
  // completas: mientras se generan, epub.js ya devuelve algunas pero el total
  // sigue en 0 y todo daría 0 %.
  const ubicacionesListas = () => libro.locations.total > 0;

  function infoPosicion(posicion) {
    const inicioPos = posicion.start;
    const pagina = inicioPos.displayed?.page;
    const total = inicioPos.displayed?.total;
    // Con doble página se cuenta desde la página derecha y por pantallas.
    const fin = posicion.end?.index === inicioPos.index ? (posicion.end.displayed?.page || pagina) : pagina;
    const porPantalla = rendition.manager?.layout?.divisor || 1;
    const conUbicaciones = ubicacionesListas();
    const entrada = entradaActual(inicioPos.index, inicioPos.cfi);
    return {
      cfi: inicioPos.cfi,
      href: inicioPos.href,
      seccion: inicioPos.index,
      entrada: entrada >= 0 ? entrada : null,
      capitulo: entrada >= 0 ? indice[entrada].etiqueta : etiquetaCapitulo(inicioPos.index),
      porcentaje: conUbicaciones ? libro.locations.percentageFromCfi(inicioPos.cfi) : null,
      ubicacion: conUbicaciones ? libro.locations.locationFromCfi(inicioPos.cfi) : null,
      totalUbicaciones: conUbicaciones ? libro.locations.length() : null,
      paginasRestantesCapitulo: fin && total ? Math.ceil(Math.max(0, total - fin) / porPantalla) : null,
      final: Boolean(posicion.atEnd),
    };
  }

  rendition.on('relocated', (posicion) => {
    ultimaPosicion = posicion;
    avisos.alCambiarPosicion?.(infoPosicion(posicion));
  });

  function liberar() {
    destruido = true;
    contenedor.removeEventListener('wheel', alGirarRueda);
    clearTimeout(generando);
    document.removeEventListener('keydown', alPulsarTecla);
    rendition.destroy();
    libro.destroy();
    liberarRecursos();
  }

  // epub.js no rechaza la promesa de display() si falla un capítulo (emite
  // displayError y se queda esperando), así que se le pone tiempo límite.
  let generando = null;
  const pintar = (destino) => conTiempoLimite(rendition.display(destino), LIMITE_PINTADO_MS + extra, 'el libro no responde');
  // Para el diagnóstico: cómo se pinta y, si tarda, en qué estado se queda.
  rendition.on('displayError', (e) => registrar(`Lector: error al pintar un capítulo: ${e?.message || e}`, 'error'));
  registrar(`Lector: pintando ${dosPaginas ? 'a doble página' : 'a una página'} en ${contenedor.clientWidth} x ${contenedor.clientHeight} px`
    + `${opciones.cfiInicial ? ', en la posición guardada' : ', al principio'} (${Math.round(megas * 10) / 10} MB)`);
  let pintado = false;
  // Fase en la que está cada vista: preparando el capítulo, cargándolo en su
  // marco o ya cargado.
  const estadoVistas = () => (rendition.manager?.views?.all?.() || []).map((v) => {
    const marco = v.iframe;
    const fase = v.contents ? 'cargado' : (marco?.srcdoc || marco?.src ? 'cargando en el marco' : 'preparando el capítulo');
    return `${v.section?.href} ${Math.round(v.width?.() || 0)} px, ${fase}`;
  }).join('; ') || 'ninguna';
  const pasosPintado = [];
  const inicioPintado = performance.now();
  const marca = (texto) => pasosPintado.length < 12 && pasosPintado.push(`${texto} a los ${Math.round(performance.now() - inicioPintado)} ms`);
  libro.spine.hooks.serialize.register((salida, seccion) => { if (!pintado) marca(`${seccion.href} preparándose`); });
  rendition.hooks.content.register((contents) => { if (!pintado) marca(`${libro.spine.get(contents.sectionIndex)?.href} cargado en su marco`); });
  const vigia = setTimeout(() => {
    if (pintado || destruido) return;
    registrar(`Lector: la primera página tarda más de 4 s. Vistas: ${estadoVistas()}. ${pasosPintado.join('; ')}`, 'error');
  }, 4000);
  const vigia2 = setTimeout(() => {
    if (pintado || destruido) return;
    registrar(`Lector: la primera página tarda más de 12 s. Vistas: ${estadoVistas()}. ${pasosPintado.join('; ')}`, 'error');
  }, 12000);
  // epub.js coloca la página antes de que el capítulo termine de maquetarse:
  // si el capítulo aún es más estrecho, el desplazamiento queda recortado y,
  // cuando crece, se ve una página anterior a la guardada (varias, en
  // capítulos largos). Después, en el iPhone el capítulo y los anteriores
  // pueden seguir creciendo (fuentes, imágenes) y mover el texto. Por eso, tras
  // pintar, se espera a que el ancho del capítulo deje de cambiar, se coloca la
  // página que contiene la posición y se vigila unos segundos, hasta que el
  // usuario pasa página o salta a otro sitio.
  function paginaDe(cfi, seccion) {
    const v = rendition.manager?.views?.all().find((x) => x.section?.index === seccion);
    if (!v?.contents || !v.element) return null;
    let izquierda;
    try {
      izquierda = v.locationOf(cfi)?.left;
    } catch {
      return null;
    }
    if (!Number.isFinite(izquierda)) return null;
    const paso = anchoPagina();
    return v.element.offsetLeft + Math.floor(izquierda / paso) * paso;
  }

  // Coloca la página que contiene cfi si no es la que se ve. Devuelve si la ha movido.
  function recolocar(cfi, seccion, motivo) {
    const d = contenedorDesplazable();
    const destino = paginaDe(cfi, seccion);
    if (!d || destino == null || Math.abs(d.scrollLeft - destino) < 2) return false;
    // Durante un arrastre o una animación las vistas están desplazadas: no se toca.
    if (vistas().some((v) => v.style.transform)) return false;
    const paso = anchoPagina();
    registrar(`Lector: posición recolocada ${motivo} (${Math.round((destino - d.scrollLeft) / paso)} páginas)`);
    avisos.alRepaginar?.(); // no es un paso de página
    desplazar(d, destino - d.scrollLeft);
    return true;
  }

  async function colocarEnPosicion(cfi) {
    const m = rendition.manager;
    const turno = ++vigilancia;
    if (typeof cfi !== 'string' || !cfi.startsWith('epubcfi(') || !m?.views || !contenedorDesplazable()) return;
    let seccion;
    try {
      seccion = new ePub.CFI().parse(cfi).spinePos;
    } catch {
      return;
    }
    const vigente = () => !destruido && turno === vigilancia;
    const ancho = () => m.views.all().find((v) => v.section?.index === seccion)?.width?.() || 0;
    let anterior = -1;
    for (let i = 0; i < 20 && vigente(); i++) {
      const actual = ancho();
      if (actual > 0 && actual === anterior) break;
      anterior = actual;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!vigente()) return;
    recolocar(cfi, seccion, 'al abrir');
    // Vigilancia en segundo plano: no retrasa la apertura.
    const paso = ultimoPaso;
    const hasta = performance.now() + VIGILANCIA_POSICION_MS;
    (async () => {
      while (performance.now() < hasta) {
        await new Promise((r) => setTimeout(r, 250));
        if (!vigente() || ultimoPaso !== paso) return;
        recolocar(cfi, seccion, 'tras maquetarse el capítulo');
      }
    })();
  }

  try {
    try {
      await pintar(opciones.cfiInicial || undefined);
      await colocarEnPosicion(opciones.cfiInicial);
    } catch (e) {
      if (cancelado()) throw e;
      registrar(`No se pudo ir a la posición guardada (${e.message}). Se abre al principio.`, 'error');
      await pintar(undefined);
    }
  } catch (e) {
    liberar();
    if (cancelado()) throw new AperturaCancelada();
    registrar(`No se pudo pintar el libro: ${e.message}`, 'error');
    // El EPUB se ha leído bien (no es DRM ni un archivo dañado): no ha
    // terminado de pintarse.
    throw new Error('El libro no ha terminado de abrirse. Vuelve a intentarlo y, si se repite, copia el diagnóstico en Ajustes.');
  } finally {
    pintado = true;
    clearTimeout(vigia);
    clearTimeout(vigia2);
  }
  if (cancelado()) {
    liberar();
    throw new AperturaCancelada();
  }
  registrar(`"${metadatos.title}" abierto en ${Math.round(performance.now() - inicio)} ms (gestor ${movil ? 'continuous' : 'default'})`);

  // Ubicaciones para el porcentaje: de la caché o generadas en segundo plano,
  // unos segundos después de abrir para no frenar las primeras páginas.
  if (opciones.ubicaciones) {
    libro.locations.load(opciones.ubicaciones);
    if (ultimaPosicion) avisos.alCambiarPosicion?.(infoPosicion(ultimaPosicion));
  } else {
    generando = setTimeout(async () => {
      const t0 = performance.now();
      try {
        await libro.locations.generate(CARACTERES_POR_UBICACION);
        if (destruido) return;
        registrar(`Ubicaciones generadas en ${Math.round(performance.now() - t0)} ms`);
        avisos.alGenerarUbicaciones?.(libro.locations.save());
        if (ultimaPosicion) avisos.alCambiarPosicion?.(infoPosicion(ultimaPosicion));
      } catch (e) {
        if (!destruido) registrar(`No se pudieron generar las ubicaciones: ${e.message}`, 'error');
      }
    }, 2500);
  }

  // --- Búsqueda dentro del libro (v4) ---
  // Recorre los capítulos sin pintarlos y entrega los resultados por tandas,
  // capítulo a capítulo. No distingue mayúsculas ni tildes.

  async function buscar(texto, { alResultados, alAvanzar, cancelado = () => false } = {}) {
    const buscado = normalizarBusqueda(texto);
    if (buscado.length < 2) return 0;
    const secciones = libro.spine.spineItems;
    let total = 0;
    for (let i = 0; i < secciones.length && total < MAX_RESULTADOS; i++) {
      if (cancelado() || destruido) break;
      const seccion = secciones[i];
      alAvanzar?.(i + 1, secciones.length);
      try {
        await seccion.load(libro.load.bind(libro));
        const encontrados = buscarEnSeccion(seccion, buscado, MAX_RESULTADOS - total)
          .map((r) => ({ ...r, capitulo: etiquetaCapitulo(seccion.index) }));
        total += encontrados.length;
        if (encontrados.length && !cancelado()) alResultados?.(encontrados);
      } catch (e) {
        registrar(`Búsqueda: no se pudo leer el capítulo ${i + 1} (${e.message})`, 'error');
      } finally {
        seccion.unload();
      }
    }
    return total;
  }

  // Resalta un resultado hasta el siguiente paso de página. En Tinta, subrayado.
  let resaltado = null;
  function quitarResaltado() {
    if (!resaltado) return;
    if (resaltado.nativo) {
      for (const c of rendition.getContents()) c.window?.CSS?.highlights?.delete('resultado-busqueda');
    } else {
      rendition.annotations.remove(resaltado.cfi, resaltado.tipo);
    }
    resaltado = null;
  }
  function resaltar(cfi) {
    quitarResaltado();
    // Con resaltado nativo, detrás del texto (legible con el tema oscuro).
    if (resaltadoNativo) {
      try {
        const posicion = new ePub.CFI().parse(cfi).spinePos;
        const contents = rendition.getContents().find((c) => c.sectionIndex === posicion);
        if (contents?.window?.Highlight) {
          contents.window.CSS.highlights.set('resultado-busqueda', new contents.window.Highlight(contents.range(cfi)));
          resaltado = { cfi, nativo: true, desde: Date.now() };
          return;
        }
      } catch {
        // se usa la capa de epub.js
      }
    }
    const tipo = perfil === 'tinta' ? 'underline' : 'highlight';
    const estilos = perfil === 'tinta'
      ? { stroke: temaEfectivo(perfil, ajustes).texto, 'stroke-opacity': '1', 'stroke-width': '3', 'mix-blend-mode': 'normal' }
      : { fill: '#ffcc33', 'fill-opacity': '0.45', 'mix-blend-mode': 'multiply' };
    rendition.annotations.add(tipo, cfi, {}, null, 'resultado-busqueda', estilos);
    resaltado = { cfi, tipo, desde: Date.now() };
  }
  rendition.on('relocated', () => {
    // El salto al resultado también avisa de la nueva posición, a veces un
    // instante después: solo un paso de página posterior quita el resaltado.
    if (resaltado && Date.now() - resaltado.desde > ESPERA_RESALTADO_MS) quitarResaltado();
  });

  return {
    titulo: metadatos.title || 'Sin título',
    indice,
    siguiente,
    anterior,
    aplicarAjustes,
    buscar,
    resaltar,
    // Marcadores: si un CFI cae en la página visible y el texto de la página.
    enPaginaActual(cfi) {
      const inicioPagina = ultimaPosicion?.start?.cfi;
      const finPagina = ultimaPosicion?.end?.cfi;
      if (!inicioPagina || !finPagina || !cfi) return false;
      const comparar = new ePub.CFI();
      try {
        return comparar.compare(cfi, inicioPagina) >= 0 && comparar.compare(cfi, finPagina) <= 0;
      } catch {
        return false;
      }
    },
    datosPaginaActual() {
      const pos = ultimaPosicion;
      if (!pos) return null;
      let texto = '';
      try {
        const contenido = rendition.getContents().find((c) => c.sectionIndex === pos.start.index) || rendition.getContents()[0];
        const desde = contenido.range(pos.start.cfi);
        const hasta = pos.end.index === pos.start.index ? contenido.range(pos.end.cfi) : null;
        const rango = contenido.document.createRange();
        rango.setStart(desde.startContainer, desde.startOffset);
        if (hasta) rango.setEnd(hasta.endContainer, hasta.endOffset);
        else rango.setEndAfter(contenido.document.body.lastChild);
        // Cada bloque (título, párrafo) separado por un espacio, no pegado.
        const copia = contenido.document.createElement('div');
        copia.appendChild(rango.cloneContents());
        copia.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, div, blockquote, br').forEach((e) => e.after(' '));
        texto = copia.textContent.replace(/\s+/g, ' ').trim().slice(0, 140);
      } catch {
        texto = '';
      }
      const info = infoPosicion(pos);
      return { cfi: pos.start.cfi, capitulo: info.capitulo, porcentaje: info.porcentaje, texto };
    },
    // Barra para recorrer el libro: necesita las ubicaciones (porcentaje).
    hayUbicaciones() {
      return ubicacionesListas();
    },
    destinoDePorcentaje(proporcion) {
      if (!ubicacionesListas()) return null;
      const cfi = libro.locations.cfiFromPercentage(Math.min(1, Math.max(0, proporcion)));
      let capitulo = null;
      try {
        capitulo = etiquetaCapitulo(libro.spine.get(cfi).index);
      } catch {
        capitulo = null;
      }
      return { cfi, capitulo };
    },
    async irA(destino) {
      vigilancia += 1; // la vigilancia de la posición anterior ya no vale
      await rendition.display(destino);
      await colocarEnPosicion(destino);
    },
    pintarSubrayados,
    quitarSeleccion,
    destruir: liberar,
  };
}
