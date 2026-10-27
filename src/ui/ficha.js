// Panel de contenido que sube desde abajo: ficha del libro y resumen del año.

import {
  abrirCapa, cerrarCapa, capaAbierta, cerrarDeslizando,
} from './paneles.js';

const $ = (id) => document.getElementById(id);

export function abrirFicha(titulo, elementos) {
  $('ficha-titulo').textContent = titulo;
  $('ficha-contenido').replaceChildren(...elementos);
  $('panel-ficha').scrollTop = 0;
  abrirCapa($('fondo-ficha'));
  abrirCapa($('panel-ficha'));
}

export function cerrarFicha() {
  cerrarCapa($('panel-ficha'));
  cerrarCapa($('fondo-ficha'));
}

export function fichaAbierta() {
  return capaAbierta($('panel-ficha'));
}

export function prepararFicha() {
  $('btn-cerrar-ficha').addEventListener('click', cerrarFicha);
  $('fondo-ficha').addEventListener('click', cerrarFicha);
  cerrarDeslizando($('panel-ficha'), cerrarFicha, $('fondo-ficha'));
}
