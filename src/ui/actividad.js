// Trabajo en curso que una recarga por versión nueva de la app cortaría:
// importar libros, restaurar una copia, o el selector de archivos abierto (la
// app pasa a segundo plano mientras se elige el archivo). app.js no recarga
// mientras haya alguno y vuelve a intentarlo al terminar.

let trabajos = 0;
let selectorDesde = 0;
const LIMITE_SELECTOR_MS = 3 * 60 * 1000; // si se cancela sin aviso, caduca solo
let alQuedarLibre = () => {};

export function trabajoEnCurso() {
  return trabajos > 0 || (selectorDesde > 0 && Date.now() - selectorDesde < LIMITE_SELECTOR_MS);
}

export function avisarAlQuedarLibre(fn) {
  alQuedarLibre = fn;
}

function comprobarLibre() {
  if (!trabajoEnCurso()) alQuedarLibre();
}

export async function conTrabajo(fn) {
  trabajos += 1;
  try {
    return await fn();
  } finally {
    trabajos -= 1;
    comprobarLibre();
  }
}

// Selectores de archivos: se marcan al abrirse y se liberan al elegir o cancelar.
export function vigilarSelector(entrada) {
  entrada.addEventListener('click', () => { selectorDesde = Date.now(); });
  const cerrar = () => {
    selectorDesde = 0;
    setTimeout(comprobarLibre, 0); // tras procesar el archivo elegido
  };
  entrada.addEventListener('change', cerrar);
  entrada.addEventListener('cancel', cerrar);
}
