// Pantalla encendida mientras se lee (mejora 24). Con un libro abierto se
// pide al sistema que no apague la pantalla. Se suelta al cerrar el libro o
// tras unos minutos sin pasar página, para no gastar batería si se deja el
// dispositivo olvidado. El sistema la suelta solo al pasar la app a segundo
// plano; al volver se pide otra vez.

import { registrar } from '../ui/registro.js';

const MINUTOS_SIN_ACTIVIDAD = 5;

let leyendo = false;
let bloqueo = null;
let temporizador = null;
let vencida = false;
let estado = 'sin libro abierto';

async function pedir() {
  if (!leyendo || vencida || bloqueo || document.visibilityState !== 'visible') return;
  if (!navigator.wakeLock?.request) {
    estado = 'el navegador no lo permite';
    return;
  }
  try {
    const nuevo = await navigator.wakeLock.request('screen');
    if (!leyendo || vencida) {
      nuevo.release().catch(() => {});
      return;
    }
    bloqueo = nuevo;
    estado = 'encendida mientras se lee';
    nuevo.addEventListener('release', () => {
      if (bloqueo === nuevo) bloqueo = null;
    });
  } catch (e) {
    estado = `rechazado por el navegador (${e.message})`;
    registrar(`Pantalla encendida: ${estado}`, 'error');
  }
}

function soltar() {
  const actual = bloqueo;
  bloqueo = null;
  actual?.release().catch(() => {});
}

function contar() {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    vencida = true;
    estado = `soltada tras ${MINUTOS_SIN_ACTIVIDAD} min sin pasar página`;
    soltar();
  }, MINUTOS_SIN_ACTIVIDAD * 60000);
}

export function mantenerEncendida() {
  leyendo = true;
  vencida = false;
  contar();
  pedir();
}

// Un paso de página o un toque en el libro.
export function actividadLectura() {
  if (!leyendo) return;
  vencida = false;
  contar();
  pedir();
}

export function soltarPantalla() {
  leyendo = false;
  clearTimeout(temporizador);
  estado = 'sin libro abierto';
  soltar();
}

export function estadoPantalla() {
  return bloqueo ? 'encendida mientras se lee' : estado;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') pedir();
});
