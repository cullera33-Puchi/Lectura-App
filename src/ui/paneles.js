// Apertura y cierre de hojas y capas. En el perfil Móvil se animan con la
// clase "abierta" (transición CSS); en Tinta electrónica el CSS anula las
// transiciones y el cambio es inmediato.

// Lo que tarda la capa en ocultarse tras cerrarla: algo más que la
// transición de cierre (0,3 s) para no cortarla.
const DURACION_MS = 340;

function sinAnimacion() {
  return document.body.dataset.perfil === 'tinta';
}

export function abrirCapa(elemento) {
  clearTimeout(elemento._cierre);
  cancelAnimationFrame(elemento._apertura);
  elemento.hidden = false;
  if (sinAnimacion()) {
    elemento.classList.add('abierta');
    return;
  }
  // Fuerza el estilo inicial antes de añadir la clase para que haya transición.
  void elemento.offsetWidth;
  elemento._apertura = requestAnimationFrame(() => elemento.classList.add('abierta'));
}

export function cerrarCapa(elemento) {
  cancelAnimationFrame(elemento._apertura);
  if (elemento.hidden) return;
  elemento.classList.remove('abierta');
  if (sinAnimacion()) {
    elemento.hidden = true;
    return;
  }
  clearTimeout(elemento._cierre);
  elemento._cierre = setTimeout(() => {
    elemento.hidden = true;
  }, Math.max(DURACION_MS, duracionCierre || 0));
}

// Duración del cierre que está en curso por un deslizamiento: la capa no se
// oculta hasta que la hoja termina de bajar.
let duracionCierre = null;

export function capaAbierta(elemento) {
  return !elemento.hidden && elemento.classList.contains('abierta');
}

// Cerrar una hoja deslizándola hacia abajo, como en iOS. El gesto solo empieza
// si el contenido bajo el dedo está arriba del todo (si no, el dedo desplaza
// el contenido). En Móvil la hoja sigue al dedo, el fondo se aclara y, al
// soltar, la hoja sigue bajando a la velocidad del dedo. En Tinta electrónica
// no hay movimiento intermedio y se cierra al soltar.
const UMBRAL_CIERRE_PX = 110;
const VELOCIDAD_CIERRE = 0.5; // px por ms
const INICIO_GESTO_PX = 8;
// Al soltar, la hoja arranca a la velocidad del dedo y frena hasta parar. La
// duración se limita (para que no se eternice ni sea brusca) y la curva se
// calcula para que su velocidad inicial sea la del dedo: así no hay acelerón.
const PENDIENTE = 2;
const VELOCIDAD_MINIMA = 0.5; // px por ms, para una suelta casi parada
const DURACION_MINIMA_MS = 220;
const DURACION_MAXIMA_MS = 480;
const MUESTRAS_MS = 100; // la velocidad al soltar se mide en el último instante

function alPrincipio(objetivo, hoja) {
  for (let nodo = objetivo; nodo && nodo !== hoja.parentNode; nodo = nodo.parentNode) {
    if (nodo.scrollTop > 0) return false;
  }
  return true;
}

const limitar = (v, min, max) => Math.min(max, Math.max(min, v));

// Curva que empieza a la velocidad v (px por ms) y recorre la distancia en la
// duración indicada, frenando al final. La pendiente inicial de
// cubic-bezier(x1, y1, ...) es y1 / x1, en unidades de velocidad media.
export function curvaDesde(v, distancia, duracion) {
  const pendiente = (v * duracion) / Math.max(1, distancia);
  const y1 = limitar(0.3 * pendiente, 0.05, 0.95);
  return `cubic-bezier(0.3, ${y1.toFixed(3)}, 0.5, 1)`;
}

// fondo: la capa oscura de detrás, que se aclara al arrastrar (opcional).
export function cerrarDeslizando(hoja, alCerrar, fondo = null) {
  let gesto = null;
  let fotograma = 0;

  const pintar = () => {
    fotograma = 0;
    if (!gesto) return;
    hoja.style.transform = `translateY(${gesto.dy}px)`;
    if (fondo) fondo.style.opacity = String(1 - Math.min(1, gesto.dy / gesto.alto));
  };

  const limpiar = () => {
    hoja.style.transition = '';
    hoja.style.transform = '';
    if (fondo) {
      fondo.style.transition = '';
      fondo.style.opacity = '';
    }
  };

  hoja.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || !capaAbierta(hoja)) return;
    const y = e.touches[0].clientY;
    gesto = {
      y,
      arriba: alPrincipio(e.target, hoja),
      arrastrando: false,
      dy: 0,
      alto: hoja.getBoundingClientRect().height,
      muestras: [{ y, t: performance.now() }],
    };
  }, { passive: true });

  hoja.addEventListener('touchmove', (e) => {
    if (!gesto || !gesto.arriba) return;
    const y = e.touches[0].clientY;
    const dy = y - gesto.y;
    if (!gesto.arrastrando) {
      if (dy < INICIO_GESTO_PX) {
        if (dy < -INICIO_GESTO_PX) gesto = null; // hacia arriba: desplazamiento normal
        return;
      }
      gesto.arrastrando = true;
      if (!sinAnimacion()) {
        hoja.style.transition = 'none';
        if (fondo) fondo.style.transition = 'none';
      }
    }
    e.preventDefault(); // evita que el contenido rebote mientras se arrastra
    gesto.dy = Math.max(0, dy);
    const ahora = performance.now();
    gesto.muestras.push({ y, t: ahora });
    while (gesto.muestras.length > 2 && ahora - gesto.muestras[0].t > MUESTRAS_MS) gesto.muestras.shift();
    if (!sinAnimacion() && !fotograma) fotograma = requestAnimationFrame(pintar);
  }, { passive: false });

  const terminar = () => {
    if (!gesto?.arrastrando) {
      gesto = null;
      return;
    }
    cancelAnimationFrame(fotograma);
    fotograma = 0;
    const { dy, alto, muestras } = gesto;
    gesto = null;
    const primera = muestras[0];
    const ultima = muestras[muestras.length - 1];
    const velocidad = (ultima.y - primera.y) / Math.max(1, ultima.t - primera.t);
    const cerrar = dy > UMBRAL_CIERRE_PX || (dy > 40 && velocidad > VELOCIDAD_CIERRE);

    if (sinAnimacion()) {
      if (cerrar) alCerrar();
      return;
    }

    if (cerrar) {
      // Sigue bajando a la velocidad del dedo y frena suavemente.
      const restante = Math.max(0, alto - dy);
      const v = Math.max(velocidad, VELOCIDAD_MINIMA);
      const duracion = Math.round(limitar((PENDIENTE * restante) / v, DURACION_MINIMA_MS, DURACION_MAXIMA_MS));
      hoja.style.transition = `transform ${duracion}ms ${curvaDesde(v, restante, duracion)}`;
      hoja.style.transform = `translateY(${alto}px)`;
      if (fondo) {
        fondo.style.transition = `opacity ${duracion}ms linear`;
        fondo.style.opacity = '0';
      }
      duracionCierre = duracion + 40;
      alCerrar();
      duracionCierre = null;
      setTimeout(limpiar, duracion + 80);
    } else {
      // Vuelve a su sitio.
      const duracion = Math.round(limitar(dy * 2, DURACION_MINIMA_MS, 320));
      hoja.style.transition = `transform ${duracion}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
      hoja.style.transform = 'translateY(0)';
      if (fondo) {
        fondo.style.transition = `opacity ${duracion}ms linear`;
        fondo.style.opacity = '1';
      }
      setTimeout(limpiar, duracion + 50);
    }
  };
  hoja.addEventListener('touchend', terminar);
  hoja.addEventListener('touchcancel', terminar);
}
