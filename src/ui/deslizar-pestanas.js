// Cambiar de pestaña deslizando el pulgar en horizontal: hacia la izquierda,
// la siguiente; hacia la derecha, la anterior. En Móvil la pantalla sigue al
// dedo y, al soltar, sale por el lado y entra la nueva; en Tinta electrónica
// se cambia al soltar, sin movimiento.
//
// Sobre lo que se desplaza en horizontal (filas de portadas y filtros), el
// gesto es de la fila mientras pueda desplazarse en esa dirección; si cabe
// entera o ya está en su final, cambia de pestaña. No empieza en campos de
// texto ni pegado a los bordes de la pantalla (en Safari, el borde izquierdo
// es "atrás").

import { curvaDesde } from './paneles.js';

const INICIO_GESTO_PX = 12;
const UMBRAL_CAMBIO = 0.28; // fracción del ancho
const VELOCIDAD_CAMBIO = 0.45; // px por ms
const MARGEN_BORDE_PX = 18;
const MUESTRAS_MS = 100;
const NO_EMPIEZA_EN = 'input, textarea, .grafico-barras, .segmentado';
const DESPLAZABLES = '.carrusel, .chips';

// true si el elemento puede desplazarse más en la dirección del dedo
// (dx < 0: el contenido avanza hacia la izquierda).
function puedeDesplazarse(el, dx) {
  if (!el || el.scrollWidth <= el.clientWidth + 1) return false;
  return dx < 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 1;
}

function sinAnimacion() {
  return document.body.dataset.perfil === 'tinta';
}

const limitar = (v, min, max) => Math.min(max, Math.max(min, v));

// pestanas: nombres en orden. actual(): la visible. ir(nombre): cambia de
// pestaña. permitido(): false si hay una hoja, un panel o el lector abiertos.
export function prepararDeslizarPestanas({ pestanas, actual, ir, permitido }) {
  let gesto = null;
  let fotograma = 0;

  const pantalla = (nombre) => document.getElementById(`pantalla-${nombre}`);

  const limpiar = (el) => {
    el.style.transform = '';
    el.style.opacity = '';
    el.style.transition = '';
  };

  const pintar = () => {
    fotograma = 0;
    if (!gesto?.horizontal) return;
    gesto.el.style.transform = `translateX(${gesto.desplazado}px)`;
    gesto.el.style.opacity = String(1 - Math.min(0.35, Math.abs(gesto.desplazado) / gesto.ancho / 2));
  };

  const zonas = pestanas.map(pantalla);
  const escuchar = (tipo, fn, opciones) => zonas.forEach((z) => z.addEventListener(tipo, fn, opciones));

  escuchar('touchstart', (e) => {
    gesto = null;
    if (e.touches.length !== 1 || !permitido()) return;
    const nombre = actual();
    if (!pestanas.includes(nombre)) return;
    const t = e.touches[0];
    if (t.clientX < MARGEN_BORDE_PX || t.clientX > window.innerWidth - MARGEN_BORDE_PX) return;
    if (e.target.closest?.(NO_EMPIEZA_EN)) return;
    gesto = {
      nombre,
      el: pantalla(nombre),
      x0: t.clientX,
      y0: t.clientY,
      ancho: window.innerWidth,
      horizontal: false,
      desplazado: 0,
      muestras: [{ x: t.clientX, t: performance.now() }],
      fila: e.target.closest?.(DESPLAZABLES) || null,
    };
  }, { passive: true });

  escuchar('touchmove', (e) => {
    if (!gesto) return;
    const t = e.touches[0];
    const dx = t.clientX - gesto.x0;
    const dy = t.clientY - gesto.y0;
    if (!gesto.horizontal) {
      if (Math.abs(dy) > INICIO_GESTO_PX && Math.abs(dy) >= Math.abs(dx)) {
        gesto = null; // desplazamiento vertical: no es un cambio de pestaña
        return;
      }
      if (Math.abs(dx) < INICIO_GESTO_PX || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      if (puedeDesplazarse(gesto.fila, dx)) {
        gesto = null; // el gesto es de la fila de portadas o de filtros
        return;
      }
      gesto.horizontal = true;
      gesto.x0 = t.clientX; // sin salto al empezar a seguir el dedo
      if (!sinAnimacion()) gesto.el.style.transition = 'none';
    }
    e.preventDefault();
    const d = t.clientX - gesto.x0;
    const i = pestanas.indexOf(gesto.nombre);
    // Sin pestaña en esa dirección, el movimiento se frena.
    const hayDestino = d < 0 ? i < pestanas.length - 1 : i > 0;
    gesto.desplazado = hayDestino ? d : d / 4;
    const ahora = performance.now();
    gesto.muestras.push({ x: t.clientX, t: ahora });
    while (gesto.muestras.length > 2 && ahora - gesto.muestras[0].t > MUESTRAS_MS) gesto.muestras.shift();
    if (!sinAnimacion() && !fotograma) fotograma = requestAnimationFrame(pintar);
  }, { passive: false });

  const terminar = () => {
    if (!gesto?.horizontal) {
      gesto = null;
      return;
    }
    cancelAnimationFrame(fotograma);
    fotograma = 0;
    const g = gesto;
    gesto = null;
    const primera = g.muestras[0];
    const ultima = g.muestras[g.muestras.length - 1];
    const velocidad = (ultima.x - primera.x) / Math.max(1, ultima.t - primera.t); // con signo
    const i = pestanas.indexOf(g.nombre);
    let paso = 0;
    if (g.desplazado < 0 && (Math.abs(g.desplazado) > g.ancho * UMBRAL_CAMBIO || velocidad < -VELOCIDAD_CAMBIO)) paso = 1;
    if (g.desplazado > 0 && (g.desplazado > g.ancho * UMBRAL_CAMBIO || velocidad > VELOCIDAD_CAMBIO)) paso = -1;
    const destino = pestanas[i + paso];
    if (!destino) paso = 0;

    if (sinAnimacion()) {
      if (paso) ir(destino);
      return;
    }

    const v = Math.max(Math.abs(velocidad), 0.4);
    if (!paso) {
      // Vuelve a su sitio.
      const distancia = Math.abs(g.desplazado);
      const duracion = Math.round(limitar((2 * distancia) / v, 160, 300));
      const animacion = g.el.animate(
        [{ transform: `translateX(${g.desplazado}px)`, opacity: g.el.style.opacity || 1 }, { transform: 'translateX(0)', opacity: 1 }],
        { duration: duracion, easing: curvaDesde(v, distancia, duracion) },
      );
      limpiar(g.el);
      return animacion;
    }

    // Sale por el lado a la velocidad del dedo y entra la nueva pantalla.
    const fin = paso > 0 ? -g.ancho : g.ancho;
    const distancia = Math.abs(fin - g.desplazado);
    const duracion = Math.round(limitar((2 * distancia) / v, 140, 260));
    const salida = g.el.animate(
      [{ transform: `translateX(${g.desplazado}px)`, opacity: g.el.style.opacity || 1 }, { transform: `translateX(${fin}px)`, opacity: 0.4 }],
      { duration: duracion, easing: curvaDesde(v, distancia, duracion), fill: 'forwards' },
    );
    salida.finished.catch(() => {}).then(() => {
      salida.cancel();
      limpiar(g.el);
      ir(destino);
      const nueva = pantalla(destino);
      nueva.animate(
        [{ transform: `translateX(${paso * g.ancho * 0.3}px)`, opacity: 0.3 }, { transform: 'translateX(0)', opacity: 1 }],
        { duration: 300, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
      );
    });
    return salida;
  };
  escuchar('touchend', terminar);
  escuchar('touchcancel', terminar);
}
