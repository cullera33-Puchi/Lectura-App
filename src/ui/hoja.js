// Hoja de acciones inferior. Devuelve el id del botón pulsado o null.

const $ = (id) => document.getElementById(id);

let resolverActual = null;

function cerrar(valor) {
  $('hoja-acciones').hidden = true;
  $('fondo-hoja').hidden = true;
  const resolver = resolverActual;
  resolverActual = null;
  resolver?.(valor);
}

// botones: [{ id, texto, secundario }]
export function mostrarHoja(titulo, botones) {
  if (resolverActual) cerrar(null);
  $('hoja-titulo').textContent = titulo;
  const contenedor = $('hoja-botones');
  contenedor.replaceChildren();
  for (const b of botones) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.textContent = b.texto;
    if (b.secundario) boton.className = 'secundario';
    boton.addEventListener('click', () => cerrar(b.id));
    contenedor.appendChild(boton);
  }
  $('fondo-hoja').hidden = false;
  $('hoja-acciones').hidden = false;
  return new Promise((resolver) => {
    resolverActual = resolver;
  });
}

export function prepararHoja() {
  $('fondo-hoja').addEventListener('click', () => cerrar(null));
}
