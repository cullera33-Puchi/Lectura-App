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

import { registrar } from '../ui/registro.js';
import { curvaDesde } from '../ui/paneles.js';
import { cssLibro, temaEfectivo, proporcionMargenes, cambioRepagina } from '../ui/temas.js';
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
const LIMITE_APERTURA_MS = 20000;
const LIMITE_PINTADO_MS = 15000;
const URL_FUENTES = new URL('../../fonts/fuentes.css', import.meta.url).href;

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

function aplanarIndice(elementos, nivel = 0, lista = []) {
  for (const e of elementos || []) {
    lista.push({ etiqueta: (e.label || '').trim() || 'Sin título', href: e.href, nivel });
    aplanarIndice(e.subitems, nivel + 1, lista);
  }
  return lista;
}

// opciones: { perfil, ajustes, cfiInicial, ubicaciones, avisos, cancelado }
// avisos: { alCambiarPosicion(info), alTocarCentro(), alDeslizarAbajo(),
//           alGenerarUbicaciones(json), alRepaginar() }
// cancelado(): devuelve true si la apertura ya no interesa. Se comprueba tras
// cada espera; en ese caso se libera todo y se lanza AperturaCancelada.
export async function abrirLibro(contenedor, datos, opciones) {
  let { perfil, ajustes } = opciones;
  const avisos = opciones.avisos || {};
  const cancelado = opciones.cancelado || (() => false);
  const movil = perfil === 'movil';
  const inicio = performance.now();
  const libro = ePub(datos);
  libro.spine.hooks.content.register(neutralizarScripts);

  try {
    await conTiempoLimite(libro.ready, LIMITE_APERTURA_MS, 'tiempo de apertura agotado');
  } catch (e) {
    libro.destroy();
    registrar(`No se pudo abrir el EPUB: ${e.message}`, 'error');
    throw new Error(MENSAJE_LIBRO_ILEGIBLE);
  }
  if (cancelado()) {
    libro.destroy();
    throw new AperturaCancelada();
  }

  const metadatos = libro.packaging.metadata;

  // Índice y etiqueta de capítulo por sección del spine. Los enlaces del índice
  // son relativos al archivo del índice, que puede estar en una subcarpeta.
  const baseIndice = directorio(libro.packaging.navPath || libro.packaging.ncxPath);
  const indice = aplanarIndice(libro.navigation?.toc).map((e) => {
    let href = e.href;
    let seccion = libro.spine.get(href);
    if (!seccion && baseIndice && href) {
      href = unirRuta(baseIndice, e.href);
      seccion = libro.spine.get(href);
    }
    return { ...e, href, seccion: seccion?.index ?? null };
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

  // velocidad: px por ms del dedo al soltar (si la página venía arrastrada).
  function animarVistas(desde, hasta, velocidad = null) {
    acabarAnimacionYa();
    const d = contenedorDesplazable();
    if (!d || desde === hasta) {
      moverVistas(0);
      if (d && hasta) d.scrollLeft += hasta;
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
        if (hasta) d.scrollLeft += hasta;
        resolver();
      };
      terminarAnimacion = terminar;
      if (animaciones.length) animaciones[0].onfinish = terminar;
      else terminar();
    });
  }

  function hayMasContenido(direccion) {
    const d = contenedorDesplazable();
    if (!d) return false;
    if (direccion > 0) return d.scrollLeft + d.clientWidth + anchoPagina() <= d.scrollWidth + 1;
    return d.scrollLeft - anchoPagina() >= -1;
  }

  // Lleva la página a la siguiente (1), la anterior (-1) o la de partida (0).
  // arrastre: lo que el dedo ya ha desplazado la página (perfil Móvil).
  function completarPaso(direccion, arrastre = 0, velocidad = null) {
    if (!movil) {
      if (direccion === 0) return Promise.resolve();
      return direccion > 0 ? rendition.next() : rendition.prev();
    }
    if (direccion !== 0 && !hayMasContenido(direccion)) {
      // Capítulo siguiente o anterior aún sin cargar: se recoloca la página y
      // se pasa sin animación.
      return animarVistas(arrastre, 0, velocidad).then(() => (direccion > 0 ? rendition.next() : rendition.prev()));
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

  function pasar(direccion, arrastre = 0, velocidad = null) {
    const miPaso = ++ultimoPaso;
    const vigente = () => !destruido && miPaso === ultimoPaso;
    const antes = huellaPosicion();
    const despues = (promesa, accion) => Promise.resolve(promesa)
      .catch((e) => traza(`error al pasar página: ${e.message}`))
      .then(() => new Promise((r) => setTimeout(r, ESPERA_COMPROBACION_MS)))
      .then(() => { if (vigente()) accion(); });
    despues(completarPaso(direccion, arrastre, velocidad), () => {
      if (huellaPosicion() !== antes) return;
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

  function actuarPorZona(x) {
    const ancho = contenedor.clientWidth;
    if (x < ancho / 3) anterior();
    else if (x > (ancho * 2) / 3) siguiente();
    else avisos.alTocarCentro?.();
  }

  function instalarGestos(contents) {
    const doc = contents.document;
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
        t0: performance.now(),
        xVisor: xEnVisor(t, contents),
        arrastrando: false,
        movido: false,
        muestras: [{ x: t.screenX, t: performance.now() }],
      };
    }, { passive: true });

    doc.addEventListener('touchmove', (e) => {
      if (!gesto || e.touches.length !== 1) return;
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
      if (gesto.arrastrando && movil) {
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
      if (!g.movido && duracion < MAX_DURACION_TOQUE_MS) {
        if (e.target.closest?.('a[href]')) return; // los enlaces del libro funcionan
        e.preventDefault(); // evita el clic sintético y el zoom por doble toque
        actuarPorZona(g.xVisor);
        return;
      }
      if (dy > 80 && Math.abs(dy) > Math.abs(dx) * 1.5) avisos.alDeslizarAbajo?.();
    }, { passive: false });

    // Ratón (ordenador). Se ignora el clic que el navegador genera tras un toque.
    doc.addEventListener('click', (e) => {
      if (Date.now() - ultimoToque < VENTANA_CLIC_TRAS_TOQUE_MS) return;
      if (e.target.closest?.('a[href]')) return;
      actuarPorZona(xEnVisor(e, contents));
    });

    doc.addEventListener('keydown', alPulsarTecla);
  }

  function alPulsarTecla(e) {
    if (e.key === 'ArrowRight') siguiente();
    else if (e.key === 'ArrowLeft') anterior();
  }

  rendition.hooks.content.register(instalarEstilos);
  rendition.hooks.content.register(instalarGestos);
  document.addEventListener('keydown', alPulsarTecla);

  // --- Posición ---

  function infoPosicion(posicion) {
    const inicioPos = posicion.start;
    const pagina = inicioPos.displayed?.page;
    const total = inicioPos.displayed?.total;
    const conUbicaciones = libro.locations.length() > 0;
    return {
      cfi: inicioPos.cfi,
      href: inicioPos.href,
      seccion: inicioPos.index,
      capitulo: etiquetaCapitulo(inicioPos.index),
      porcentaje: conUbicaciones ? libro.locations.percentageFromCfi(inicioPos.cfi) : null,
      ubicacion: conUbicaciones ? libro.locations.locationFromCfi(inicioPos.cfi) : null,
      totalUbicaciones: conUbicaciones ? libro.locations.length() : null,
      paginasRestantesCapitulo: pagina && total ? Math.max(0, total - pagina) : null,
      final: Boolean(posicion.atEnd),
    };
  }

  rendition.on('relocated', (posicion) => {
    ultimaPosicion = posicion;
    avisos.alCambiarPosicion?.(infoPosicion(posicion));
  });

  function liberar() {
    destruido = true;
    clearTimeout(generando);
    document.removeEventListener('keydown', alPulsarTecla);
    rendition.destroy();
    libro.destroy();
  }

  // epub.js no rechaza la promesa de display() si falla un capítulo (emite
  // displayError y se queda esperando), así que se le pone tiempo límite.
  let generando = null;
  const pintar = (destino) => conTiempoLimite(rendition.display(destino), LIMITE_PINTADO_MS, 'el libro no responde');
  try {
    try {
      await pintar(opciones.cfiInicial || undefined);
    } catch (e) {
      if (cancelado()) throw e;
      registrar(`No se pudo ir a la posición guardada (${e.message}). Se abre al principio.`, 'error');
      await pintar(undefined);
    }
  } catch (e) {
    liberar();
    if (cancelado()) throw new AperturaCancelada();
    registrar(`No se pudo pintar el libro: ${e.message}`, 'error');
    throw new Error(MENSAJE_LIBRO_ILEGIBLE);
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

  return {
    titulo: metadatos.title || 'Sin título',
    indice,
    siguiente,
    anterior,
    aplicarAjustes,
    irA(destino) {
      return rendition.display(destino);
    },
    destruir: liberar,
  };
}
