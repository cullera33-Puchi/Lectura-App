// Hoja de acciones inferior, como las de iOS. Devuelve el id del botón pulsado
// o null si se cancela.

import { abrirCapa, cerrarCapa } from './paneles.js';

const $ = (id) => document.getElementById(id);

let resolverActual = null;

function cerrar(valor) {
  cerrarCapa($('hoja-acciones'));
  cerrarCapa($('fondo-hoja'));
  const resolver = resolverActual;
  resolverActual = null;
  resolver?.(valor);
}

// botones: [{ id, texto, destructivo }]. El botón Cancelar va aparte.
// alPulsar se ejecuta dentro del gesto, antes de cerrar la hoja (necesario si
// la acción abre la ventana de Google).
export function mostrarHoja(titulo, botones, { alPulsar } = {}) {
  if (resolverActual) cerrar(null);
  $('hoja-titulo').textContent = titulo;
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
  abrirCapa($('fondo-hoja'));
  abrirCapa($('hoja-acciones'));
  return new Promise((resolver) => {
    resolverActual = resolver;
  });
}

export function prepararHoja() {
  $('fondo-hoja').addEventListener('click', () => cerrar(null));
  $('hoja-cancelar').addEventListener('click', () => cerrar(null));
}
