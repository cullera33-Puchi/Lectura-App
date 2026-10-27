// Temas, perfiles y ajustes de lectura (puntos 8 y 9 del diseño).
// Los ajustes son por dispositivo y no se sincronizan.

export const TEMAS = {
  movil: [
    { id: 'claro', nombre: 'Claro', fondo: '#FFFFFF', texto: '#1A1A1A' },
    { id: 'sepia', nombre: 'Sepia', fondo: '#F8F1E3', texto: '#4F3A28' },
    { id: 'oscuro', nombre: 'Oscuro', fondo: '#000000', texto: '#D0D0D0' },
    { id: 'automatico', nombre: 'Automático' },
  ],
  tinta: [
    { id: 'negro-blanco', nombre: 'Negro sobre blanco', fondo: '#FFFFFF', texto: '#000000' },
    { id: 'blanco-negro', nombre: 'Blanco sobre negro', fondo: '#000000', texto: '#FFFFFF' },
  ],
};

export const TAMANOS = [80, 90, 100, 110, 120, 135, 150, 170, 200];

export const FUENTES = [
  { id: 'original', nombre: 'Original', familia: null },
  { id: 'literata', nombre: 'Literata', familia: "'Literata', Georgia, serif" },
  { id: 'open-sans', nombre: 'Open Sans', familia: "'Open Sans', Helvetica, Arial, sans-serif" },
  { id: 'charis', nombre: 'Charis SIL', familia: "'Charis SIL', Georgia, serif" },
];

export const INTERLINEADOS = [
  { id: 'compacto', nombre: 'Compacto', valor: 1.3 },
  { id: 'normal', nombre: 'Normal', valor: 1.5 },
  { id: 'amplio', nombre: 'Amplio', valor: 1.8 },
];

// Proporción del ancho de la página que ocupan los dos márgenes laterales.
export const MARGENES = [
  { id: 'estrechos', nombre: 'Estrechos', proporcion: 0.08 },
  { id: 'normales', nombre: 'Normales', proporcion: 0.13 },
  { id: 'anchos', nombre: 'Anchos', proporcion: 0.2 },
];

export const JUSTIFICACIONES = [
  { id: 'justificado', nombre: 'Justificado' },
  { id: 'izquierda', nombre: 'A la izquierda' },
];

export function ajustesLecturaIniciales() {
  return {
    temaMovil: 'automatico',
    temaTinta: 'negro-blanco',
    tamano: 100,
    fuente: 'original',
    interlineado: 'normal',
    margenes: 'normales',
    justificacion: 'justificado',
  };
}

const oscuroDelSistema = window.matchMedia('(prefers-color-scheme: dark)');

export function idTemaElegido(perfil, ajustes) {
  return perfil === 'tinta' ? ajustes.temaTinta : ajustes.temaMovil;
}

// Tema con colores. "Automático" se resuelve según el modo del sistema.
export function temaEfectivo(perfil, ajustes) {
  const lista = TEMAS[perfil];
  let id = idTemaElegido(perfil, ajustes);
  if (id === 'automatico') id = oscuroDelSistema.matches ? 'oscuro' : 'claro';
  return lista.find((t) => t.id === id) || lista[0];
}

export function alCambiarModoSistema(fn) {
  oscuroDelSistema.addEventListener('change', fn);
}

// La interfaz sigue el tema elegido.
export function aplicarTemaInterfaz(perfil, ajustes) {
  const tema = temaEfectivo(perfil, ajustes);
  document.body.dataset.perfil = perfil;
  document.body.dataset.tema = tema.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema.fondo);
  return tema;
}

export function proporcionMargenes(ajustes) {
  return (MARGENES.find((m) => m.id === ajustes.margenes) || MARGENES[1]).proporcion;
}

// Ajustes que cambian la paginación. El tema solo cambia colores.
const AJUSTES_QUE_REPAGINAN = ['tamano', 'fuente', 'interlineado', 'margenes', 'justificacion'];

export function cambioRepagina(antes, despues) {
  return AJUSTES_QUE_REPAGINAN.some((c) => antes?.[c] !== despues?.[c]);
}

// Hoja de estilos que se inyecta en cada capítulo del libro.
export function cssLibro(perfil, ajustes) {
  const tema = temaEfectivo(perfil, ajustes);
  const fuente = FUENTES.find((f) => f.id === ajustes.fuente) || FUENTES[0];
  const interlineado = (INTERLINEADOS.find((i) => i.id === ajustes.interlineado) || INTERLINEADOS[1]).valor;
  const alineacion = ajustes.justificacion === 'izquierda' ? 'left' : 'justify';
  const sinCodigo = ':not(code):not(pre):not(kbd):not(samp)';

  return `
html, body {
  background: ${tema.fondo} !important;
  color: ${tema.texto} !important;
}
body {
  font-size: ${ajustes.tamano}% !important;
  -webkit-text-size-adjust: none;
  -webkit-tap-highlight-color: transparent;
  /* La pulsación larga no tiene acción en la v1 (reservada para subrayados). */
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
body *:not(img):not(svg):not(image) {
  color: inherit !important;
  background-color: transparent !important;
}
a, a * {
  color: inherit !important;
  text-decoration: underline;
}
body, body p, body div, body li, body span, body blockquote, body dd {
  line-height: ${interlineado} !important;
}
body p:not([class*="center"]):not([class*="right"]):not([style*="center"]):not([style*="right"]) {
  text-align: ${alineacion} !important;
  -webkit-hyphens: auto;
  hyphens: auto;
}
${fuente.familia ? `body, body *${sinCodigo} { font-family: ${fuente.familia} !important; }` : ''}
img, svg {
  max-width: 100% !important;
}
${perfil === 'tinta' ? '*, *::before, *::after { animation: none !important; transition: none !important; }' : ''}
`;
}
