// Exportar los subrayados y notas de un libro a Markdown (mejora 27). En el
// iPhone se abre el menú Compartir (Notas, Archivos, correo); donde no se puede
// compartir un archivo (el ordenador), se descarga.

import { registrar } from './registro.js';

// Orden de lectura de dos CFI sin cargar epub.js: se comparan sus números
// paso a paso (/6/4!/4/10/2,/1:5 da 6, 4, 4, 10, 2, 1, 5).
function pasosCfi(cfi) {
  return (String(cfi || '').match(/\d+/g) || []).map(Number);
}

export function compararCfi(a, b) {
  const x = pasosCfi(a);
  const y = pasosCfi(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}

export function ordenarSubrayados(lista) {
  return [...lista].sort((a, b) => compararCfi(a.cfi, b.cfi));
}

const fechaLarga = (d) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

// Cita en Markdown: cada línea del pasaje con "> ".
const cita = (texto) => texto.split(/\n+/).map((l) => `> ${l.trim()}`).join('\n');

export function markdownDeSubrayados(libro, lista) {
  const lineas = [`# ${libro.titulo || 'Sin título'}`];
  if (libro.autor) lineas.push('', libro.autor);
  lineas.push('', `_Subrayados y notas exportados el ${fechaLarga(new Date())} desde Lector EPUB._`);
  let capitulo;
  for (const s of ordenarSubrayados(lista)) {
    if ((s.capitulo || '') !== capitulo) {
      capitulo = s.capitulo || '';
      lineas.push('', `## ${capitulo || 'Sin capítulo'}`);
    }
    lineas.push('', cita(s.texto || ''));
    if (s.nota) lineas.push('', `**Nota:** ${s.nota.replace(/\n+/g, ' ')}`);
  }
  return `${lineas.join('\n')}\n`;
}

const nombreArchivo = (libro) => `${(libro.titulo || 'Libro').replace(/[\\/:*?"<>|]+/g, ' ').trim()} - subrayados.md`;

// Debe llamarse dentro del gesto del usuario (sin esperas antes): el menú
// Compartir lo exige.
export async function compartirSubrayados(libro, lista) {
  const texto = markdownDeSubrayados(libro, lista);
  const nombre = nombreArchivo(libro);
  const archivo = new File([texto], nombre, { type: 'text/plain' });
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: libro.titulo || 'Subrayados' });
      registrar(`Subrayados de "${libro.titulo}" compartidos (${lista.length})`);
      return 'compartido';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelado';
      registrar(`No se pudo compartir el archivo (${e?.message || e}); se descarga`, 'error');
    }
  }
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/markdown' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  registrar(`Subrayados de "${libro.titulo}" descargados (${lista.length})`);
  return 'descargado';
}
