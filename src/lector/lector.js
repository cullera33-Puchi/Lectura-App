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

import { registrar } from '../ui/registro.js';
import { cssLibro, temaEfectivo, proporcionMargenes } from '../ui/temas.js';

const DURACION_ANIMACION_MS = 260;
const UMBRAL_DESLIZAR_PX = 40;
const UMBRAL_MOVIMIENTO_PX = 10;
const MAX_DURACION_TOQUE_MS = 600;
const VENTANA_CLIC_TRAS_TOQUE_MS = 800;
const CARACTERES_POR_UBICACION = 1600;
const URL_FUENTES = new URL('../../fonts/fuentes.css', import.meta.url).href;

export const MENSAJE_LIBRO_ILEGIBLE = 'Este libro no se puede abrir. Puede tener protección DRM.';

function conTiempoLimite(promesa, ms, mensaje) {
  return Promise.race([
    promesa,
    new Promise((_, rechazar) => setTimeout(() => rechazar(new Error(mensaje)), ms)),
  ]);
}

function suavizado(t) {
  return 1 - Math.pow(1 - t, 3);
}

function aplanarIndice(elementos, nivel = 0, lista = []) {
  for (const e of elementos || []) {
    lista.push({ etiqueta: (e.label || '').trim() || 'Sin título', href: e.href, nivel });
    aplanarIndice(e.subitems, nivel + 1, lista);
  }
  return lista;
}

// opciones: { perfil, ajustes, cfiInicial, ubicaciones, avisos }
// avisos: { alCambiarPosicion(info), alTocarCentro(), alDeslizarAbajo(), alGenerarUbicaciones(json) }
export async function abrirLibro(contenedor, datos, opciones) {
  let { perfil, ajustes } = opciones;
  const avisos = opciones.avisos || {};
  const movil = perfil === 'movil';
  const inicio = performance.now();
  const libro = ePub(datos);

  try {
    await conTiempoLimite(libro.ready, 20000, 'tiempo de apertura agotado');
  } catch (e) {
    libro.destroy();
    registrar(`No se pudo abrir el EPUB: ${e.message}`, 'error');
    throw new Error(MENSAJE_LIBRO_ILEGIBLE);
  }

  const metadatos = libro.packaging.metadata;

  // Índice y etiqueta de capítulo por sección del spine.
  const indice = aplanarIndice(libro.navigation?.toc).map((e) => ({
    ...e,
    seccion: libro.spine.get(e.href)?.index ?? null,
  }));
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

  function pintarFondo() {
    contenedor.style.background = temaEfectivo(perfil, ajustes).fondo;
  }
  pintarFondo();

  const rendition = libro.renderTo(contenedor, {
    width: '100%',
    height: '100%',
    flow: 'paginated',
    spread: 'none',
    gap: calcularHueco(),
    manager: movil ? 'continuous' : 'default',
    allowScriptedContent: false,
  });

  let ultimoToque = 0;
  let animando = false;
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

  // Aplica los ajustes "Aa" y vuelve a paginar manteniendo la posición.
  function aplicarAjustes(nuevoPerfil, nuevosAjustes) {
    perfil = nuevoPerfil;
    ajustes = nuevosAjustes;
    css = cssLibro(perfil, ajustes);
    pintarFondo();
    for (const c of rendition.getContents()) {
      const estilo = c.document.getElementById('lector-ajustes');
      if (estilo) estilo.textContent = css;
    }
    const manager = rendition.manager;
    if (!manager) return;
    manager.settings.gap = calcularHueco();
    rendition.settings.gap = manager.settings.gap;
    // Forzar el repaginado aunque el tamaño del visor no cambie. epub.js
    // vuelve a pintar la posición actual al terminar.
    manager._stageSize = undefined;
    rendition.resize();
  }

  // --- Paso de página ---

  function contenedorDesplazable() {
    return rendition.manager?.container;
  }

  function anchoPagina() {
    return rendition.manager?.layout?.delta || contenedor.clientWidth;
  }

  // Anima el desplazamiento de forma incremental, para respetar los ajustes de
  // posición que hace epub.js al añadir capítulos por delante.
  function animarDesplazamiento(distancia) {
    const desplazable = contenedorDesplazable();
    if (!desplazable || distancia === 0) return Promise.resolve();
    animando = true;
    return new Promise((resolver) => {
      const t0 = performance.now();
      let avanzado = 0;
      function paso(ahora) {
        const t = Math.min(1, (ahora - t0) / DURACION_ANIMACION_MS);
        const objetivo = distancia * suavizado(t);
        desplazable.scrollLeft += objetivo - avanzado;
        avanzado = objetivo;
        if (t < 1) {
          requestAnimationFrame(paso);
        } else {
          const ancho = anchoPagina();
          desplazable.scrollLeft = Math.round(desplazable.scrollLeft / ancho) * ancho;
          animando = false;
          resolver();
        }
      }
      requestAnimationFrame(paso);
    });
  }

  function hayMasContenido(direccion) {
    const d = contenedorDesplazable();
    if (!d) return false;
    if (direccion > 0) return d.scrollLeft + d.clientWidth + anchoPagina() <= d.scrollWidth + 1;
    return d.scrollLeft - anchoPagina() >= -1;
  }

  // Lleva la página hasta la posición alineada en la dirección indicada.
  function completarPaso(direccion) {
    if (!movil) {
      if (direccion === 0) return Promise.resolve();
      return direccion > 0 ? rendition.next() : rendition.prev();
    }
    const d = contenedorDesplazable();
    const ancho = anchoPagina();
    const base = Math.round(d.scrollLeft / ancho) * ancho;
    // Si se ha arrastrado, la página destino es la siguiente a la de partida.
    let destino = base;
    if (direccion > 0 && d.scrollLeft >= base - 1) destino = base + ancho;
    if (direccion < 0 && d.scrollLeft <= base + 1) destino = base - ancho;
    if (direccion !== 0 && !hayMasContenido(direccion) && Math.abs(d.scrollLeft - base) < 1) {
      // Capítulo siguiente o anterior aún sin cargar: paso sin animación.
      return direccion > 0 ? rendition.next() : rendition.prev();
    }
    const maximo = d.scrollWidth - d.clientWidth;
    destino = Math.max(0, Math.min(maximo, destino));
    return animarDesplazamiento(destino - d.scrollLeft);
  }

  function siguiente() {
    if (animando) return;
    completarPaso(1);
  }

  function anterior() {
    if (animando) return;
    completarPaso(-1);
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

    doc.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1 || animando) {
        gesto = null;
        return;
      }
      const t = e.touches[0];
      gesto = {
        x0: t.screenX,
        y0: t.screenY,
        ultimoX: t.screenX,
        t0: performance.now(),
        xVisor: xEnVisor(t, contents),
        arrastrando: false,
        movido: false,
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
      if (gesto.arrastrando && movil) {
        const d = contenedorDesplazable();
        if (d) d.scrollLeft -= t.screenX - gesto.ultimoX;
      }
      gesto.ultimoX = t.screenX;
    }, { passive: false });

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
        if (!pasa) completarPaso(0);
        else completarPaso(dx < 0 ? 1 : -1);
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
      paginasRestantesCapitulo: pagina && total ? Math.max(0, total - pagina) : null,
      final: Boolean(posicion.atEnd),
    };
  }

  rendition.on('relocated', (posicion) => {
    ultimaPosicion = posicion;
    avisos.alCambiarPosicion?.(infoPosicion(posicion));
  });

  rendition.on('resized', () => registrar('Libro repaginado'));

  let visualizado = false;
  try {
    await rendition.display(opciones.cfiInicial || undefined);
    visualizado = true;
  } catch (e) {
    registrar(`No se pudo ir a la posición guardada (${e.message}). Se abre al principio.`, 'error');
  }
  if (!visualizado) await rendition.display();
  registrar(`"${metadatos.title}" abierto en ${Math.round(performance.now() - inicio)} ms (gestor ${movil ? 'continuous' : 'default'})`);

  // Ubicaciones para el porcentaje: de la caché o generadas en segundo plano.
  let destruido = false;
  let generando = null;
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
    }, 800);
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
    destruir() {
      destruido = true;
      clearTimeout(generando);
      document.removeEventListener('keydown', alPulsarTecla);
      rendition.destroy();
      libro.destroy();
    },
  };
}
