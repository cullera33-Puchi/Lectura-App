// Panel de contenido que sube desde abajo: ficha del libro y resumen del año.

import {
  abrirCapa, cerrarCapa, capaAbierta, cerrarDeslizando,
} from './paneles.js';
import { entrarEnCapa, salirDeCapa } from './historial.js';

const $ = (id) => document.getElementById(id);

export function abrirFicha(titulo, elementos) {
  // Si se repinta la misma hoja (ordenar Quiero leer, revisar duplicados), se
  // conserva el punto de desplazamiento; otra distinta empieza arriba.
  const misma = fichaAbierta() && $('ficha-titulo').textContent === titulo;
  $('ficha-titulo').textContent = titulo;
  $('ficha-contenido').replaceChildren(...elementos);
  if (!misma) $('panel-ficha').scrollTop = 0;
  entrarEnCapa('ficha');
  abrirCapa($('fondo-ficha'));
  abrirCapa($('panel-ficha'));
}

export function cerrarFicha() {
  if (!fichaAbierta()) return;
  cerrarCapa($('panel-ficha'));
  cerrarCapa($('fondo-ficha'));
  salirDeCapa('ficha');
}

export function fichaAbierta() {
  return capaAbierta($('panel-ficha'));
}

export function prepararFicha() {
  $('btn-cerrar-ficha').addEventListener('click', cerrarFicha);
  $('fondo-ficha').addEventListener('click', cerrarFicha);
  cerrarDeslizando($('panel-ficha'), cerrarFicha, $('fondo-ficha'));
}
