// Service worker mínimo de la fase 0: red primero y caché como respaldo.
// Así cada cambio publicado se ve al momento y la app abre sin conexión.
// Solo gestiona archivos de la propia app; Google y Drive van siempre a la red.

const CACHE = 'lector-epub-fase0-v1';
const ARCHIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'config.js',
  'src/app.js',
  'src/datos/almacen.js',
  'src/lector/lector.js',
  'src/sync/google.js',
  'src/sync/drive.js',
  'src/sync/prueba.js',
  'src/ui/diagnostico.js',
  'src/ui/registro.js',
  'src/ui/estilos.css',
  'vendor/jszip-3.10.1.min.js',
  'vendor/epub-0.3.93.min.js',
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
    fetch(peticion)
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
