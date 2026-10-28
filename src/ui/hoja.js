// Hoja de acciones inferior, como las de iOS. Devuelve el id del botón pulsado
// o null si se cancela.

import { abrirCapa, cerrarCapa, cerrarDeslizando } from './paneles.js';
import { entrarEnCapa, salirDeCapa } from './historial.js';

const $ = (id) => document.getElementById(id);

let resolverActual = null;

function cerrar(valor) {
  $('hoja-cancelar').textContent = 'Cancelar';
  cerrarCapa($('hoja-acciones'));
  cerrarCapa($('fondo-hoja'));
  const resolver = resolverActual;
  resolverActual = null;
  salirDeCapa('hoja');
  resolver?.(valor);
}

// botones: [{ id, texto, destructivo }]. El botón Cancelar va aparte.
// alPulsar se ejecuta dentro del gesto, antes de cerrar la hoja (necesario si
// la acción abre la ventana de Google).
export function mostrarHoja(titulo, botones, { alPulsar, textoCancelar = 'Cancelar' } = {}) {
  if (resolverActual) cerrar(null);
  $('hoja-titulo').textContent = titulo;
  $('hoja-cancelar').textContent = textoCancelar;
  const contenedor = $('hoja-botones');
  contenedor.replaceChildren();
  for (const b of botones) {
    if (b.id === null) continue; // Cancelar ya está en su propio bloque
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = `fila-hoja${b.destructivo ? ' destructivo' : ''}`;
    boton.textContent = b.texto;
    boton.addEventListener('click', () => {
      alPulsar?.(b.id);
      cerrar(b.id);
    });
    contenedor.appendChild(boton);
  }
  entrarEnCapa('hoja');
  abrirCapa($('fondo-hoja'));
  abrirCapa($('hoja-acciones'));
  return new Promise((resolver) => {
    resolverActual = resolver;
  });
}

// Muestra un formulario en la hoja, encima del botón de guardar. Devuelve true
// si se pulsa el botón y false si se cancela.
export async function mostrarFormulario(titulo, elementos, { textoBoton = 'Guardar', enfocar } = {}) {
  const eleccion = mostrarHoja(titulo, [{ id: 'guardar', texto: textoBoton }]);
  const formulario = document.createElement('div');
  formulario.className = 'formulario-hoja';
  formulario.append(...elementos);
  formulario.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') $('hoja-botones').querySelector('.fila-hoja:last-child')?.click();
  });
  $('hoja-botones').prepend(formulario);
  if (enfocar) setTimeout(() => enfocar.focus(), 50);
  return (await eleccion) === 'guardar';
}

// Muestra un texto en la hoja (por ejemplo, una nota al pie), con párrafos y
// desplazamiento si es largo. Devuelve el id del botón pulsado o null.
export function mostrarTexto(titulo, parrafos, botones, { textoCancelar = 'Cerrar' } = {}) {
  const eleccion = mostrarHoja(titulo, botones, { textoCancelar });
  const texto = document.createElement('div');
  texto.className = 'texto-hoja';
  for (const parrafo of parrafos) {
    const p = document.createElement('p');
    p.textContent = parrafo;
    texto.appendChild(p);
  }
  $('hoja-botones').prepend(texto);
  return eleccion;
}

// Pide un texto o un número en la hoja. Devuelve el valor o null si se cancela.
export async function pedirValor(titulo, valor, { tipo = 'text', min, max, textoBoton = 'Guardar' } = {}) {
  const campo = document.createElement('input');
  campo.type = tipo;
  campo.className = 'campo-hoja';
  campo.value = valor ?? '';
  if (tipo === 'number') {
    campo.inputMode = 'numeric';
    if (min != null) campo.min = String(min);
    if (max != null) campo.max = String(max);
  }
  campo.setAttribute('aria-label', titulo);
  if (!(await mostrarFormulario(titulo, [campo], { textoBoton, enfocar: campo }))) return null;
  return campo.value.trim() || null;
}

export async function pedirNumero(titulo, valor, { min = 1, max = 9999 } = {}) {
  const texto = await pedirValor(titulo, valor, { tipo: 'number', min, max });
  if (texto == null) return null; // cancelado (con min 0, Number(null) sería válido)
  const n = Math.round(Number(texto));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export function hojaAbierta() {
  return Boolean(resolverActual);
}

// Para el botón Atrás de Android.
export function cancelarHoja() {
  if (resolverActual) cerrar(null);
}

export function prepararHoja() {
  $('fondo-hoja').addEventListener('click', () => cerrar(null));
  $('hoja-cancelar').addEventListener('click', () => cerrar(null));
  cerrarDeslizando($('hoja-acciones'), () => cerrar(null), $('fondo-hoja'));
}
