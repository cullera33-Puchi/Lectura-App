// Iconos propios en trazo, al estilo de iOS. Los SF Symbols de Apple no se
// pueden usar fuera de sus plataformas, así que se dibujan aquí.

const TRAZOS = {
  leyendo: '<path d="M12 6.5C10.2 5.2 7.6 4.6 4 4.8v12.6c3.6-.2 6.2.4 8 1.7 1.8-1.3 4.4-1.9 8-1.7V4.8c-3.6-.2-6.2.4-8 1.7Z"/><path d="M12 6.5v12.6"/>',
  biblioteca: '<rect x="3.5" y="4" width="4" height="16" rx="1"/><rect x="9.5" y="4" width="4" height="16" rx="1"/><path d="m15.6 5.2 3.8-1 3.9 14.6-3.8 1z"/>',
  sincronizar: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
  menu: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".6"/><circle cx="4" cy="12" r=".6"/><circle cx="4" cy="18" r=".6"/>',
  indice: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h1M4 12h1M4 18h1"/>',
  nube: '<path d="M7 18h10.5a4 4 0 0 0 .6-8A6 6 0 0 0 6.6 8.6 4.8 4.8 0 0 0 7 18Z"/>',
  subir: '<path d="M12 16V5M7 10l5-5 5 5"/><path d="M5 19h14"/>',
  descargar: '<path d="M12 5v11M7 11l5 5 5-5"/><path d="M5 19h14"/>',
  ordenar: '<path d="M7 4v16M3.5 7.5 7 4l3.5 3.5"/><path d="M17 20V4M13.5 16.5 17 20l3.5-3.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  atras: '<path d="M15 4.5 7.5 12l7.5 7.5"/>',
  avanzar: '<path d="m9 4.5 7.5 7.5L9 19.5"/>',
  papelera: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5L18 7"/><path d="M9 7V4.5h6V7"/>',
  quitar: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12h8"/>',
  terminado: '<circle cx="12" cy="12" r="8.5"/><path d="m8.3 12.3 2.6 2.6 4.9-5.2"/>',
  abrir: '<path d="M12 6.5C10.2 5.2 7.6 4.6 4 4.8v12.6c3.6-.2 6.2.4 8 1.7 1.8-1.3 4.4-1.9 8-1.7V4.8c-3.6-.2-6.2.4-8 1.7Z"/>',
  movil: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  tableta: '<rect x="4.5" y="2.5" width="15" height="19" rx="2"/><path d="M8 7h8M8 10.5h8M8 14h5"/>',
  mas_opciones: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
};

export function svgIcono(nombre, clase = '') {
  const trazo = TRAZOS[nombre] || '';
  return `<svg class="icono ${clase}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${trazo}</svg>`;
}

// Sustituye cada <i data-icono="nombre"> del documento por su SVG.
export function pintarIconos(raiz = document) {
  raiz.querySelectorAll('i[data-icono]').forEach((i) => {
    i.outerHTML = svgIcono(i.dataset.icono, i.className);
  });
}
