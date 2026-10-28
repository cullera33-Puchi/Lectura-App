// Service worker: la app se sirve desde la caché del dispositivo (mejora 4).
// - Cada versión publicada tiene su propia caché con todos los archivos de la
//   app, descargados juntos al instalarla. Así arranca al momento aunque la
//   conexión sea mala y nunca mezcla archivos de dos versiones.
// - La versión nueva se descarga en segundo plano y espera. La app le pide
//   que se active cuando no hay nada en curso (ni libro abierto, ni
//   sincronización, ni importación) y entonces se recarga.
// Solo gestiona archivos de la propia app; Google y Drive van siempre a la red.

const CACHE = 'lector-epub-c50';
const PREFIJO = 'lector-epub-';
const ARCHIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'config.js',
  'src/app.js',
  'src/biblioteca/biblioteca.js',
  'src/biblioteca/duplicados.js',
  'src/biblioteca/editar.js',
  'src/biblioteca/ficha.js',
  'src/biblioteca/importar.js',
  'src/biblioteca/inicio.js',
  'src/biblioteca/portadas.js',
  'src/datos/almacen.js',
  'src/datos/anotaciones.js',
  'src/datos/colecciones.js',
  'src/datos/libros.js',
  'src/datos/pendientes.js',
  'src/datos/preferencias.js',
  'src/datos/progreso.js',
  'src/datos/quiero-leer.js',
  'src/datos/reloj.js',
  'src/datos/sesiones.js',
  'src/estadisticas/calculo.js',
  'src/estadisticas/datos.js',
  'src/estadisticas/mes.js',
  'src/estadisticas/meta-diaria.js',
  'src/estadisticas/pantalla.js',
  'src/estadisticas/resumen.js',
  'src/lector/lector.js',
  'src/lector/librerias.js',
  'src/lector/pantalla-encendida.js',
  'src/lector/pantalla-lector.js',
  'src/lector/ritmo.js',
  'src/sync/carpeta.js',
  'src/sync/copias.js',
  'src/sync/drive.js',
  'src/sync/fusion.js',
  'src/sync/google.js',
  'src/sync/sincronizar.js',
  'src/ui/actividad.js',
  'src/ui/ajustes.js',
  'src/ui/aviso.js',
  'src/ui/bienvenida.js',
  'src/ui/copias.js',
  'src/ui/deslizar-pestanas.js',
  'src/ui/diagnostico.js',
  'src/ui/ficha.js',
  'src/ui/historial.js',
  'src/ui/hoja.js',
  'src/ui/iconos.js',
  'src/ui/paneles.js',
  'src/ui/prueba-guiada.js',
  'src/ui/registro.js',
  'src/ui/sincronizacion.js',
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
  // cache: 'reload' evita copiar a la caché nueva archivos antiguos de la caché HTTP.
  evento.waitUntil((async () => {
    const anteriores = await caches.keys();
    const cache = await caches.open(CACHE);
    await cache.addAll(ARCHIVOS.map((u) => new Request(u, { cache: 'reload' })));
    // La primera instalación, o si la versión activa es anterior a la
    // mejora 4 (red primero, sin el aviso de activar), se activa ya.
    if (!anteriores.some((k) => k !== CACHE && /^lector-epub-c\d+$/.test(k))) await self.skipWaiting();
  })());
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k.startsWith(PREFIJO) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// La app avisa cuando puede recargarse con la versión nueva.
self.addEventListener('message', (evento) => {
  if (evento.data?.tipo === 'activar') self.skipWaiting();
});

// Una respuesta con redirección no se puede usar para una navegación: se copia.
async function limpiarRedireccion(respuesta) {
  if (!respuesta.redirected) return respuesta;
  return new Response(await respuesta.blob(), { status: respuesta.status, statusText: respuesta.statusText, headers: respuesta.headers });
}

async function responder(evento) {
  const peticion = evento.request;
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(peticion, { ignoreSearch: true })
    || (peticion.mode === 'navigate' ? await cache.match('./') : null);
  if (guardada) return guardada;
  // Un archivo que no está en la lista: se pide a la red y se guarda en la
  // caché de esta versión.
  const respuesta = await fetch(peticion);
  if (respuesta.ok && respuesta.type === 'basic') {
    const copia = respuesta.clone();
    evento.waitUntil(cache.put(peticion, copia));
  }
  return limpiarRedireccion(respuesta);
}

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET' || new URL(peticion.url).origin !== self.location.origin) return;
  evento.respondWith(responder(evento));
});
