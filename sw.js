// Service worker: red primero y caché como respaldo.
// - Las peticiones a la red se revalidan siempre (cache: 'no-cache'), porque
//   GitHub Pages permite al navegador guardar los archivos 10 minutos y la app
//   podría seguir usando una versión anterior.
// - Si la red no responde en unos segundos (conexión colgada), se usa la caché
//   para que la app abra igual que sin conexión.
// Solo gestiona archivos de la propia app; Google y Drive van siempre a la red.

const CACHE = 'lector-epub-v15';
const ESPERA_RED_MS = 4000;
const ARCHIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'config.js',
  'src/app.js',
  'src/biblioteca/biblioteca.js',
  'src/biblioteca/editar.js',
  'src/biblioteca/ficha.js',
  'src/biblioteca/importar.js',
  'src/biblioteca/inicio.js',
  'src/biblioteca/portadas.js',
  'src/datos/almacen.js',
  'src/datos/colecciones.js',
  'src/datos/libros.js',
  'src/datos/pendientes.js',
  'src/datos/preferencias.js',
  'src/datos/progreso.js',
  'src/datos/sesiones.js',
  'src/estadisticas/calculo.js',
  'src/estadisticas/datos.js',
  'src/estadisticas/pantalla.js',
  'src/estadisticas/resumen.js',
  'src/lector/lector.js',
  'src/lector/pantalla-lector.js',
  'src/lector/ritmo.js',
  'src/sync/carpeta.js',
  'src/sync/copias.js',
  'src/sync/drive.js',
  'src/sync/fusion.js',
  'src/sync/google.js',
  'src/sync/sincronizar.js',
  'src/ui/ajustes.js',
  'src/ui/aviso.js',
  'src/ui/bienvenida.js',
  'src/ui/copias.js',
  'src/ui/diagnostico.js',
  'src/ui/ficha.js',
  'src/ui/hoja.js',
  'src/ui/iconos.js',
  'src/ui/paneles.js',
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
  evento.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ARCHIVOS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Una respuesta con redirección no se puede usar para una navegación: se copia.
async function limpiarRedireccion(respuesta) {
  if (!respuesta.redirected) return respuesta;
  return new Response(await respuesta.blob(), { status: respuesta.status, statusText: respuesta.statusText, headers: respuesta.headers });
}

async function responder(evento) {
  const peticion = evento.request;
  const desdeCache = () => caches.match(peticion, { ignoreSearch: true });
  const red = fetch(peticion.url, { cache: 'no-cache' }).then(async (respuesta) => {
    if (respuesta.ok) {
      const copia = respuesta.clone();
      evento.waitUntil(caches.open(CACHE).then((c) => c.put(peticion, copia)));
    }
    return limpiarRedireccion(respuesta);
  });
  red.catch(() => {}); // si ya se respondió con la caché, el fallo de red no importa
  // Si la red tarda, se responde con la caché (si la hay) y la red sigue
  // actualizándola en segundo plano.
  const plazo = new Promise((resolver) => setTimeout(resolver, ESPERA_RED_MS)).then(desdeCache);
  try {
    const primera = await Promise.race([red, plazo]);
    if (primera) return primera;
    return await red;
  } catch {
    const enCache = await desdeCache();
    if (enCache) return enCache;
    throw new Error('Sin conexión y sin copia en caché');
  }
}

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET' || new URL(peticion.url).origin !== self.location.origin) return;
  evento.respondWith(responder(evento));
});
