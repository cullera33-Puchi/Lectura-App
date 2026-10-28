// Aviso flotante breve (resultado de la sincronización y similares).

const DURACION_MS = 4500;
let temporizador = null;

// accion: { texto, alPulsar } añade un botón al aviso (por ejemplo,
// "Actualizar" cuando hay una versión nueva de la app).
export function mostrarAviso(texto, duracion = DURACION_MS, accion = null) {
  const aviso = document.getElementById('aviso');
  aviso.textContent = texto;
  if (accion) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'aviso-accion';
    boton.textContent = accion.texto;
    boton.addEventListener('click', () => {
      ocultarAviso();
      accion.alPulsar();
    });
    aviso.append(' ', boton);
  }
  aviso.hidden = false;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    aviso.hidden = true;
  }, duracion);
}

export function ocultarAviso() {
  clearTimeout(temporizador);
  document.getElementById('aviso').hidden = true;
}
