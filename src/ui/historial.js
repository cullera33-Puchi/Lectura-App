// Botón Atrás (Android) con una hoja o la ficha abiertas sobre una pestaña.
// Sin una entrada propia en el historial, Atrás cerraría la app en vez de la
// hoja. Al abrir una de estas capas sobre una pestaña se añade una entrada;
// Atrás la retira y cierra la capa (popstate en app.js). Si la capa se cierra
// desde ella misma (Cancelar, fondo, deslizar), la entrada se retira aquí.
// El lector y Ajustes tienen su propia entrada y no necesitan otra.

let retirandoPropia = false;
const abiertas = new Set(); // 'hoja', 'ficha'

const hayCapaAbierta = () => abiertas.size > 0;

export function entrarEnCapa(nombre) {
  abiertas.add(nombre);
  // Si se está retirando la entrada de la capa anterior, la nueva se añade
  // cuando termine (en esRetiradaPropia).
  if (retirandoPropia) return;
  if (history.state?.pantalla || history.state?.capa) return;
  history.pushState({ capa: true }, '');
}

export function salirDeCapa(nombre) {
  abiertas.delete(nombre);
  // Tras el cierre: si se abre otra capa enseguida (una hoja que lleva a la
  // ficha), la entrada se aprovecha.
  setTimeout(() => {
    if (hayCapaAbierta() || !history.state?.capa) return;
    retirandoPropia = true;
    history.back();
  }, 0);
}

// popstate causado por salirDeCapa: no hay nada más que hacer.
export function esRetiradaPropia() {
  if (!retirandoPropia) return false;
  retirandoPropia = false;
  if (hayCapaAbierta() && !history.state?.pantalla && !history.state?.capa) {
    history.pushState({ capa: true }, ''); // se abrió otra mientras tanto
  }
  return true;
}
