// Registro visible de eventos. En los dispositivos de prueba no hay consola
// de desarrollo, así que todo lo relevante se apunta aquí.

const MAX_ENTRADAS = 150;
const entradas = [];
const oyentes = new Set();

export function registrar(texto, tipo = 'info') {
  const entrada = { fecha: new Date(), texto: String(texto), tipo };
  entradas.unshift(entrada);
  if (entradas.length > MAX_ENTRADAS) entradas.pop();
  if (tipo === 'error') console.error(texto);
  else console.log(texto);
  oyentes.forEach((fn) => fn(entrada));
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
