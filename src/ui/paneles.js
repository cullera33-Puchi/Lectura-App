// Apertura y cierre de hojas y capas. En el perfil Móvil se animan con la
// clase "abierta" (transición CSS); en Tinta electrónica el CSS anula las
// transiciones y el cambio es inmediato.

const DURACION_MS = 320;

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
  }, DURACION_MS);
}

export function capaAbierta(elemento) {
  return !elemento.hidden && elemento.classList.contains('abierta');
}

// Cerrar una hoja deslizándola hacia abajo, como en iOS. El gesto solo empieza
// si el contenido bajo el dedo está arriba del todo (si no, el dedo desplaza
// el contenido). En Móvil la hoja sigue al dedo; en Tinta electrónica no hay
// movimiento intermedio y se cierra al soltar.
const UMBRAL_CIERRE_PX = 110;
const VELOCIDAD_CIERRE = 0.6; // px por ms
const INICIO_GESTO_PX = 8;

function alPrincipio(objetivo, hoja) {
  for (let nodo = objetivo; nodo && nodo !== hoja.parentNode; nodo = nodo.parentNode) {
    if (nodo.scrollTop > 0) return false;
  }
  return true;
}

export function cerrarDeslizando(hoja, alCerrar) {
  let gesto = null;

  const limpiar = () => {
    hoja.style.transition = '';
    hoja.style.transform = '';
  };

  hoja.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || !capaAbierta(hoja)) return;
    gesto = {
      y: e.touches[0].clientY,
      t: performance.now(),
      arriba: alPrincipio(e.target, hoja),
      arrastrando: false,
      dy: 0,
    };
  }, { passive: true });

  hoja.addEventListener('touchmove', (e) => {
    if (!gesto || !gesto.arriba) return;
    const dy = e.touches[0].clientY - gesto.y;
    if (!gesto.arrastrando) {
      if (dy < INICIO_GESTO_PX) {
        if (dy < -INICIO_GESTO_PX) gesto = null; // hacia arriba: desplazamiento normal
        return;
      }
      gesto.arrastrando = true;
    }
    e.preventDefault(); // evita que el contenido rebote mientras se arrastra
    gesto.dy = Math.max(0, dy);
    if (!sinAnimacion()) {
      hoja.style.transition = 'none';
      hoja.style.transform = `translateY(${gesto.dy}px)`;
    }
  }, { passive: false });

  const terminar = () => {
    if (!gesto?.arrastrando) {
      gesto = null;
      return;
    }
    const velocidad = gesto.dy / Math.max(1, performance.now() - gesto.t);
    const cerrar = gesto.dy > UMBRAL_CIERRE_PX || (gesto.dy > 40 && velocidad > VELOCIDAD_CIERRE);
    gesto = null;
    if (sinAnimacion()) {
      if (cerrar) alCerrar();
      return;
    }
    // Desde donde está el dedo, la hoja termina de bajar o vuelve a su sitio.
    hoja.style.transition = '';
    hoja.style.transform = cerrar ? 'translateY(100%)' : '';
    if (cerrar) {
      alCerrar();
      setTimeout(limpiar, DURACION_MS + 50);
    }
  };
  hoja.addEventListener('touchend', terminar);
  hoja.addEventListener('touchcancel', terminar);
}
