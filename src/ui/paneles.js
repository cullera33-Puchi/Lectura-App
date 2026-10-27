// Apertura y cierre de hojas y capas. En el perfil Móvil se animan con la
// clase "abierta" (transición CSS); en Tinta electrónica el CSS anula las
// transiciones y el cambio es inmediato.

const DURACION_MS = 320;

function sinAnimacion() {
  return document.body.dataset.perfil === 'tinta';
}

export function abrirCapa(elemento) {
  clearTimeout(elemento._cierre);
  elemento.hidden = false;
  if (sinAnimacion()) {
    elemento.classList.add('abierta');
    return;
  }
  // Fuerza el estilo inicial antes de añadir la clase para que haya transición.
  void elemento.offsetWidth;
  requestAnimationFrame(() => elemento.classList.add('abierta'));
}

export function cerrarCapa(elemento) {
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
