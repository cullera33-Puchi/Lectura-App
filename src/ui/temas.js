// Temas, perfiles y ajustes de lectura (puntos 8 y 9 del diseño).
// Los ajustes son por dispositivo y no se sincronizan.

import { registrar } from './registro.js';

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
    dosPaginas: true,
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
// Color de la barra de estado. Safari en iOS no siempre atiende a un cambio
// del atributo, así que se sustituye la etiqueta entera.
function pintarBarraEstado(color) {
  const actual = document.querySelector('meta[name="theme-color"]');
  if (actual?.getAttribute('content') === color) return;
  const nueva = document.createElement('meta');
  nueva.name = 'theme-color';
  nueva.content = color;
  if (actual) actual.replaceWith(nueva);
  else document.head.appendChild(nueva);
  registrar(`Barra de estado: ${color}`);
}

export function aplicarTemaInterfaz(perfil, ajustes) {
  const tema = temaEfectivo(perfil, ajustes);
  document.body.dataset.perfil = perfil;
  document.body.dataset.tema = tema.id;
  pintarBarraEstado(tema.fondo);
  return tema;
}

export function proporcionMargenes(ajustes) {
  return (MARGENES.find((m) => m.id === ajustes.margenes) || MARGENES[1]).proporcion;
}

// Ajustes que cambian la paginación. El tema solo cambia colores.
const AJUSTES_QUE_REPAGINAN = ['tamano', 'fuente', 'interlineado', 'margenes', 'justificacion', 'dosPaginas', 'formato'];

export function cambioRepagina(antes, despues) {
  return AJUSTES_QUE_REPAGINAN.some((c) => antes?.[c] !== despues?.[c]);
}

// --- Subrayados (mejora 26) ---
// Colores de las muestras. En la tinta electrónica en color se usan tonos más
// intensos, porque la pantalla los aclara.
export const COLORES_SUBRAYADO = { amarillo: '#ffd23f', verde: '#7ed957', azul: '#5ab0ff', rosa: '#ff7eb6' };
const COLORES_TINTA = { amarillo: '#e0a800', verde: '#1f9d3a', azul: '#1a66d6', rosa: '#d6246e' };

const rgba = (hex, alfa) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
};

// Subrayados con los resaltados nativos del navegador (::highlight): el color
// va detrás de las letras, así el texto se lee siempre. En el móvil y el
// ordenador, fondo de color (más tenue con el tema oscuro, donde el texto es
// claro). En tinta electrónica, una línea de color gruesa bajo el texto.
function cssSubrayados(perfil, tema) {
  const oscuro = tema.fondo.toLowerCase() === '#000000';
  return Object.keys(COLORES_SUBRAYADO).map((color) => {
    if (perfil === 'tinta') {
      return `::highlight(subrayado-${color}) { text-decoration: underline; text-decoration-color: ${COLORES_TINTA[color]}; text-decoration-thickness: 3px; text-underline-offset: 3px; }`;
    }
    return `::highlight(subrayado-${color}) { background-color: ${rgba(COLORES_SUBRAYADO[color], oscuro ? 0.32 : 0.42)}; }`;
  }).concat(perfil === 'tinta'
    ? `::highlight(resultado-busqueda) { text-decoration: underline; text-decoration-color: ${tema.texto}; text-decoration-thickness: 3px; text-underline-offset: 3px; }`
    : `::highlight(resultado-busqueda) { background-color: ${rgba('#ffcc33', oscuro ? 0.35 : 0.5)}; }`).join('\n');
}

export function colorTinta(color) {
  return COLORES_TINTA[color] || COLORES_TINTA.amarillo;
}

// Los tamaños fijos del libro (font-size en px o pt) no crecen con el tamaño
// de "Aa", que se aplica en porcentaje: se multiplican por la escala elegida.
// A 100 % quedan igual que los puso el editor.
export function escalarTamanosFijos(css) {
  return css.replace(/(font-size\s*:\s*)(\d*\.?\d+)(px|pt)\b/gi, '$1calc($2$3 * var(--lector-escala, 1))');
}

// Hoja de estilos que se inyecta en cada capítulo del libro.
export function cssLibro(perfil, ajustes) {
  const tema = temaEfectivo(perfil, ajustes);
  const fuente = FUENTES.find((f) => f.id === ajustes.fuente) || FUENTES[0];
  const interlineado = (INTERLINEADOS.find((i) => i.id === ajustes.interlineado) || INTERLINEADOS[1]).valor;
  const alineacion = ajustes.justificacion === 'izquierda' ? 'left' : 'justify';
  const sinCodigo = ':not(code):not(pre):not(kbd):not(samp)';
  // Con el formato del libro (mejora 28) no se fuerzan letra, interlineado ni
  // justificación.
  const mio = ajustes.formato !== 'libro';

  return `
:root {
  /* Escala de los tamaños fijos (px, pt) del libro: ver escalarTamanosFijos. */
  --lector-escala: ${ajustes.tamano / 100};
}
html, body {
  background: ${tema.fondo} !important;
  color: ${tema.texto} !important;
}
body {
  font-size: ${ajustes.tamano}% !important;
  -webkit-text-size-adjust: none;
  -webkit-tap-highlight-color: transparent;
  /* Con pulsación larga se selecciona texto para subrayar (mejora 26). */
  -webkit-user-select: text;
  user-select: text;
}
body *:not(img):not(svg):not(image) {
  color: inherit !important;
  background-color: transparent !important;
}
a, a * {
  color: inherit !important;
  text-decoration: underline;
}
${mio ? `body, body p, body div, body li, body span, body blockquote, body dd {
  line-height: ${interlineado} !important;
}
body p:not([class*="center"]):not([class*="right"]):not([style*="center"]):not([style*="right"]) {
  text-align: ${alineacion} !important;
  -webkit-hyphens: auto;
  hyphens: auto;
}` : ''}
${mio && fuente.familia ? `body, body *${sinCodigo} { font-family: ${fuente.familia} !important; }` : ''}
img, svg {
  max-width: 100% !important;
}
${perfil === 'tinta' ? '*, *::before, *::after { animation: none !important; transition: none !important; }' : ''}
${cssSubrayados(perfil, tema)}
`;
}
