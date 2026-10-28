// Registro visible de eventos. En los dispositivos de prueba no hay consola
// de desarrollo, así que todo lo relevante se apunta aquí.

const MAX_ENTRADAS = 150;
const CLAVE = 'lector-registro';
const entradas = [];
const oyentes = new Set();

// El registro se conserva al recargar la página o reabrir la app, para que
// "Copiar diagnóstico" incluya lo que pasó antes (por ejemplo, un libro que
// no abría). Es de este dispositivo y solo sirve para el diagnóstico.
try {
  const guardadas = JSON.parse(localStorage.getItem(CLAVE) || '[]');
  for (const e of guardadas) entradas.push({ fecha: new Date(e.fecha), texto: e.texto, tipo: e.tipo });
  if (entradas.length) entradas.unshift({ fecha: new Date(), texto: '--- La app se ha vuelto a abrir ---', tipo: 'info' });
} catch {
  // sin almacenamiento local: el registro empieza vacío
}

let guardando = null;
function guardarPronto() {
  clearTimeout(guardando);
  guardando = setTimeout(guardarYa, 500);
}

function guardarYa() {
  clearTimeout(guardando);
  try {
    localStorage.setItem(CLAVE, JSON.stringify(entradas.slice(0, MAX_ENTRADAS)));
  } catch {
    // almacenamiento lleno o bloqueado: no es imprescindible
  }
}
addEventListener('pagehide', guardarYa);

export function registrar(texto, tipo = 'info') {
  const entrada = { fecha: new Date(), texto: String(texto), tipo };
  entradas.unshift(entrada);
  while (entradas.length > MAX_ENTRADAS) entradas.pop();
  if (tipo === 'error') console.error(texto);
  else console.log(texto);
  oyentes.forEach((fn) => fn(entrada));
  guardarPronto();
}

export function suscribirRegistro(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

export function entradasRegistro() {
  return entradas.slice();
}

export function horaCorta(fecha) {
  return fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function registroComoTexto() {
  return entradas
    .map((e) => `${horaCorta(e.fecha)} ${e.tipo === 'error' ? 'ERROR ' : ''}${e.texto}`)
    .join('\n');
}
