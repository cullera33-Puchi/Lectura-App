// epub.js y JSZip (unos 320 KB) se cargan la primera vez que hacen falta, al
// abrir o importar un libro, no al arrancar la app. El service worker los
// guarda en caché con el resto de la app, así que funcionan sin conexión.

const cargas = new Map();

function cargarScript(src) {
  if (!cargas.has(src)) {
    cargas.set(src, new Promise((resolver, rechazar) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolver();
      s.onerror = () => {
        cargas.delete(src); // se podrá reintentar
        rechazar(new Error(`No se pudo cargar ${src.split('/').pop()}`));
      };
      document.head.appendChild(s);
    }));
  }
  return cargas.get(src);
}

export function cargarJSZip() {
  return cargarScript('vendor/jszip-3.10.1.min.js');
}

// epub.js usa JSZip para leer el EPUB: va primero.
export async function cargarEpub() {
  await cargarJSZip();
  await cargarScript('vendor/epub-0.3.93.min.js');
}
