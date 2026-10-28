// Prueba guiada (mejora 31): lo que solo se puede comprobar en el propio
// dispositivo (botones físicos, rebote al deslizar, restos en la tinta
// electrónica, pantalla encendida). Cada prueba explica qué hacer y guarda el
// resultado, que viaja con "Copiar diagnóstico y registro".

import { leerAjuste, guardarAjuste } from '../datos/almacen.js';
import { abrirFicha, fichaAbierta } from './ficha.js';
import { registrar, registroComoTexto } from './registro.js';

const TITULO = 'Prueba guiada';
const CLAVE = 'pruebaGuiada';
const TECLAS_DE_PAGINA = ['PageDown', 'PageUp', 'ArrowRight', 'ArrowLeft', ' '];

const PRUEBAS = [
  {
    id: 'botones',
    titulo: 'Botones físicos',
    donde: 'Sobre todo en la tablet.',
    pasos: 'Con esta hoja abierta, pulsa los botones de volumen o los de la funda. Abajo aparece lo que recibe la app.',
  },
  {
    id: 'rebote',
    titulo: 'Deslizar en horizontal',
    donde: 'En el iPhone.',
    pasos: 'Abre un libro, gira el iPhone y desliza página a página hasta pasar de capítulo un par de veces. Fíjate en las últimas páginas de cada capítulo.',
    opciones: [{ id: 'bien', texto: 'No rebota' }, { id: 'mal', texto: 'Rebota' }],
  },
  {
    id: 'restos',
    titulo: 'Restos de páginas anteriores',
    donde: 'En la tablet.',
    pasos: 'Abre un libro y pasa unas 20 páginas seguidas.',
    opciones: [{ id: 'bien', texto: 'La página se ve limpia' }, { id: 'mal', texto: 'Quedan restos' }],
  },
  {
    id: 'pantalla',
    titulo: 'Pantalla encendida',
    donde: 'En todos los dispositivos.',
    pasos: 'Abre un libro y deja la página quieta algo más de lo que tarda la pantalla en apagarse normalmente (menos de 5 minutos).',
    opciones: [{ id: 'bien', texto: 'Sigue encendida' }, { id: 'mal', texto: 'Se apaga' }],
  },
];

let resultados = {};
let teclasVistas = [];

function el(etiqueta, clase, texto) {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
}

const nombreTecla = (e) => (e.key === ' ' ? 'Espacio' : e.key || e.code || `código ${e.keyCode}`);

// Datos que la app puede medir por sí sola para cada prueba.
function datoAutomatico(id) {
  if (id === 'botones') {
    if (!teclasVistas.length) return 'Todavía no ha llegado ninguna tecla.';
    const usadas = teclasVistas.every((t) => TECLAS_DE_PAGINA.includes(t === 'Espacio' ? ' ' : t));
    return `Recibidas: ${teclasVistas.join(', ')}. ${usadas
      ? 'La app ya las usa para pasar página.'
      : 'La app aún no las usa: copia el diagnóstico y pásamelo.'}`;
  }
  if (id === 'rebote') {
    const n = (registroComoTexto().match(/sin cargar al deslizar/g) || []).length;
    return n ? `El registro anota ${n} ${n === 1 ? 'paso' : 'pasos'} con el capítulo siguiente sin cargar.` : null;
  }
  if (id === 'pantalla') {
    return navigator.wakeLock?.request ? 'El navegador permite mantenerla encendida.' : 'Este navegador no permite mantenerla encendida.';
  }
  return null;
}

async function guardarResultado(id, resultado) {
  resultados = { ...resultados, [id]: { resultado, detalle: datoAutomatico(id), fecha: new Date().toISOString() } };
  await guardarAjuste(CLAVE, resultados);
  registrar(`Prueba guiada, ${PRUEBAS.find((p) => p.id === id).titulo}: ${resultado}`);
}

function pintar() {
  const partes = [el('p', 'tarjeta-texto', 'Pruebas que solo se pueden hacer en el propio dispositivo. El resultado se incluye al copiar el diagnóstico.')];
  for (const prueba of PRUEBAS) {
    partes.push(el('h3', 'cabecera-grupo', prueba.titulo));
    const texto = el('p', 'pie-grupo prueba-pasos', `${prueba.donde} ${prueba.pasos}`);
    partes.push(texto);
    const dato = datoAutomatico(prueba.id);
    const elegido = resultados[prueba.id]?.resultado;
    if (prueba.opciones) {
      const grupo = el('div', 'grupo');
      grupo.dataset.prueba = prueba.id;
      for (const o of prueba.opciones) {
        const boton = el('button', 'fila fila-boton', elegido === o.texto ? `${o.texto} ✓` : o.texto);
        boton.type = 'button';
        boton.setAttribute('aria-pressed', String(elegido === o.texto));
        boton.addEventListener('click', async () => {
          await guardarResultado(prueba.id, o.texto);
          pintar();
        });
        grupo.appendChild(boton);
      }
      partes.push(grupo);
    }
    if (dato) {
      const nota = el('p', 'pie-grupo prueba-dato', dato);
      nota.dataset.prueba = prueba.id;
      partes.push(nota);
    }
  }
  abrirFicha(TITULO, partes);
}

// Teclas recibidas con la prueba abierta (botones físicos).
document.addEventListener('keydown', (e) => {
  if (!fichaAbierta() || document.getElementById('ficha-titulo')?.textContent !== TITULO) return;
  const nombre = nombreTecla(e);
  if (!teclasVistas.includes(nombre)) teclasVistas = [...teclasVistas, nombre];
  guardarResultado('botones', teclasVistas.join(', ')).then(() => {
    const dato = document.querySelector('.prueba-dato[data-prueba="botones"]');
    if (dato) dato.textContent = datoAutomatico('botones');
  });
}, true);

export async function abrirPruebaGuiada() {
  resultados = (await leerAjuste(CLAVE)) || {};
  teclasVistas = [];
  pintar();
}

// Resumen para Diagnóstico.
export async function resumenPruebaGuiada() {
  const guardados = (await leerAjuste(CLAVE)) || {};
  const hechas = PRUEBAS.filter((p) => guardados[p.id]).map((p) => `${p.titulo}: ${guardados[p.id].resultado}`);
  return hechas.length ? hechas.join('. ') : 'sin hacer';
}
