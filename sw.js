// Service worker: red primero y caché como respaldo.
// Las peticiones a la red se revalidan siempre (cache: 'no-cache'), porque
// GitHub Pages permite al navegador guardar los archivos 10 minutos y la app
// podría seguir usando una versión anterior. Sin conexión, se usa la caché.
// Solo gestiona archivos de la propia app; Google y Drive van siempre a la red.

const CACHE = 'lector-epub-v3';
const ARCHIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'config.js',
  'src/app.js',
  'src/biblioteca/biblioteca.js',
  'src/biblioteca/importar.js',
  'src/datos/almacen.js',
  'src/datos/libros.js',
  'src/datos/preferencias.js',
  'src/datos/progreso.js',
  'src/datos/sesiones.js',
  'src/lector/lector.js',
  'src/lector/pantalla-lector.js',
  'src/sync/carpeta.js',
  'src/sync/drive.js',
  'src/sync/google.js',
  'src/ui/ajustes.js',
  'src/ui/bienvenida.js',
  'src/ui/diagnostico.js',
  'src/ui/hoja.js',
  'src/ui/registro.js',
  'src/ui/temas.js',
  'src/ui/estilos.css',
  'vendor/jszip-3.10.1.min.js',
  'vendor/epub-0.3.93.min.js',
  'fonts/fuentes.css',
  'fonts/charis-sil-latin-400-italic.woff2',
  'fonts/charis-sil-latin-400-normal.woff2',
  'fonts/charis-sil-latin-700-italic.woff2',
  'fonts/charis-sil-latin-700-normal.woff2',
  'fonts/charis-sil-latin-ext-400-italic.woff2',
  'fonts/charis-sil-latin-ext-400-normal.woff2',
  'fonts/charis-sil-latin-ext-700-italic.woff2',
  'fonts/charis-sil-latin-ext-700-normal.woff2',
  'fonts/literata-latin-400-italic.woff2',
  'fonts/literata-latin-400-normal.woff2',
  'fonts/literata-latin-700-italic.woff2',
  'fonts/literata-latin-700-normal.woff2',
  'fonts/literata-latin-ext-400-italic.woff2',
  'fonts/literata-latin-ext-400-normal.woff2',
  'fonts/literata-latin-ext-700-italic.woff2',
  'fonts/literata-latin-ext-700-normal.woff2',
  'fonts/open-sans-latin-400-italic.woff2',
  'fonts/open-sans-latin-400-normal.woff2',
  'fonts/open-sans-latin-700-italic.woff2',
  'fonts/open-sans-latin-700-normal.woff2',
  'fonts/open-sans-latin-ext-400-italic.woff2',
  'fonts/open-sans-latin-ext-400-normal.woff2',
  'fonts/open-sans-latin-ext-700-italic.woff2',
  'fonts/open-sans-latin-ext-700-normal.woff2',
  'iconos/icono-180.png',
  'iconos/icono-192.png',
  'iconos/icono-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET' || new URL(peticion.url).origin !== self.location.origin) return;
  evento.respondWith(
    fetch(peticion.url, { cache: 'no-cache' })
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CACHE).then((c) => c.put(peticion, copia));
        }
        return respuesta;
      })
      .catch(() => caches.match(peticion, { ignoreSearch: true })),
  );
});
