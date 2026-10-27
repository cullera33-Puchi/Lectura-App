// Aviso flotante breve (resultado de la sincronización y similares).

const DURACION_MS = 4500;
let temporizador = null;

export function mostrarAviso(texto, duracion = DURACION_MS) {
  const aviso = document.getElementById('aviso');
  aviso.textContent = texto;
  aviso.hidden = false;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    aviso.hidden = true;
  }, duracion);
}
