// Mejora 4: la app se sirve desde la caché. Arranca al momento con la red
// lenta, y una versión nueva publicada no se mezcla con la que está en uso:
// espera con un libro abierto y se activa al pasar a segundo plano o al abrir
// la app. Usa una copia de la app con su propio servidor, para poder publicar
// una "versión nueva" a mitad de la prueba.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');
const drive = require('../lib/drive-falso.js');
const { EPUBS: S, SALIDA, ok } = require('../lib/entorno.js');

const RAIZ = path.join(__dirname, '..', '..');
const COPIA = path.join(SALIDA, 'app-version-nueva');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };
let retraso = 0;

function copiar() {
  fs.rmSync(COPIA, { recursive: true, force: true });
  for (const x of ['index.html', 'sw.js', 'config.js', 'manifest.webmanifest', 'src', 'vendor', 'fonts', 'iconos']) {
    fs.cpSync(path.join(RAIZ, x), path.join(COPIA, x), { recursive: true });
  }
}

function publicar(cache, version) {
  const sw = path.join(COPIA, 'sw.js');
  fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/lector-epub-c\d+/, cache));
  const d = path.join(COPIA, 'src/ui/diagnostico.js');
  fs.writeFileSync(d, fs.readFileSync(d, 'utf8').replace(/VERSION_APP = '[^']*'/, `VERSION_APP = '${version}'`));
}

function servidor() {
  const srv = http.createServer((pet, res) => {
    let ruta = decodeURIComponent(new URL(pet.url, 'http://x').pathname);
    if (ruta.endsWith('/')) ruta += 'index.html';
    const archivo = path.join(COPIA, ruta);
    setTimeout(() => fs.readFile(archivo, (error, datos) => {
      if (error || !archivo.startsWith(COPIA)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(datos);
    }), retraso);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

const version = (p) => p.evaluate(async () => (await import('/src/ui/diagnostico.js')).VERSION_APP);
const enEspera = (p) => p.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting));
const ocultar = (p) => p.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
});
const mostrar = (p) => p.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
});

(async () => {
  copiar();
  const srv = await servidor();
  const url = `http://localhost:${srv.address().port}/`;
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  await drive.instalar(ctx);
  const p = await ctx.newPage();
  const errores = []; p.on('pageerror', (e) => errores.push(e.message));
  await p.goto(url); await p.waitForTimeout(800);
  await p.click('.opcion-grande[data-perfil=movil]'); await p.waitForTimeout(200);
  await p.fill('#bienvenida-nombre', 'iPhone');
  await p.click('#bienvenida-conectar');
  await p.waitForFunction(() => !document.getElementById('pantalla-inicio').hidden);
  await p.setInputFiles('#archivo-epub', [`${S}/quijote.epub`]); await p.waitForTimeout(1500);
  await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
  const original = await version(p);

  // Red muy lenta: la app arranca igual desde la caché.
  retraso = 8000;
  const inicio = Date.now();
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#pantalla-inicio:not([hidden])', { timeout: 6000 });
  const ms = Date.now() - inicio;
  ok(ms < 3000, `con la red lenta (8 s por archivo) la app abre en ${ms} ms`);
  retraso = 0;
  await p.waitForTimeout(9000); // que termine la comprobación de versión lenta

  // Se publica una versión nueva con un libro abierto.
  publicar('lector-epub-c9001', 'prueba 1');
  await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300);
  await p.click('#pantalla-biblioteca .libro-abrir'); await p.waitForSelector('#visor iframe'); await p.waitForTimeout(1500);
  await p.evaluate(() => { window.marca = 'sin recargar'; });
  await p.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await p.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting), null, { timeout: 15000, polling: 300 });
  await p.waitForTimeout(800);
  ok(await p.evaluate(() => window.marca) === 'sin recargar' && await p.isVisible('#visor iframe'), 'con un libro abierto, la versión nueva espera sin recargar');
  const servido = await p.evaluate(() => fetch('src/ui/diagnostico.js').then((r) => r.text()));
  ok(servido.includes(`'${original}'`) && !servido.includes('prueba 1'), `mientras tanto, los archivos que se piden son de la versión en uso (${original})`);
  await ocultar(p); await p.waitForTimeout(800);
  ok(await p.evaluate(() => window.marca) === 'sin recargar', 'tampoco al pasar a segundo plano con el libro abierto');
  await mostrar(p); await p.waitForTimeout(300);

  // Se cierra el libro y la app pasa a segundo plano: se activa y recarga.
  await p.goBack(); await p.waitForTimeout(800);
  ok(await p.evaluate(() => window.marca) === 'sin recargar', 'al cerrar el libro no recarga mientras se usa la app');
  const recarga = p.waitForEvent('load', { timeout: 15000 });
  await ocultar(p);
  await recarga; await p.waitForTimeout(1500);
  ok(await version(p) === 'prueba 1', `al pasar a segundo plano se activa la versión nueva (${await version(p)})`);
  const caches = await p.evaluate(() => caches.keys());
  ok(caches.length === 1 && caches[0] === 'lector-epub-c9001', `solo queda la caché de la versión nueva: ${caches.join(', ')}`);

  // Otra versión publicada con la app cerrada: al abrirla se pone al día sola.
  publicar('lector-epub-c9002', 'prueba 2');
  await p.reload(); await p.waitForTimeout(500);
  // La app se recarga sola: se espera a que la página nueva tenga la versión.
  for (let i = 0; i < 40 && await version(p).catch(() => null) !== 'prueba 2'; i++) await p.waitForTimeout(500);
  await p.waitForTimeout(1000);
  ok(await version(p) === 'prueba 2' && !(await enEspera(p)), `al abrir la app con una versión nueva publicada, se pone al día (${await version(p)})`);

  // Con la app ya en uso (en el ordenador la pestaña rara vez se oculta): se
  // ofrece actualizar con un botón.
  await p.waitForTimeout(2500);
  await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300);
  publicar('lector-epub-c9003', 'prueba 3');
  await p.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await p.waitForSelector('#aviso .aviso-accion', { timeout: 20000 });
  ok(/versión nueva/.test(await p.textContent('#aviso')) && await version(p) === 'prueba 2', 'con la app en uso se ofrece actualizar sin recargar');
  const recargada = p.waitForEvent('load', { timeout: 15000 });
  await p.click('#aviso .aviso-accion');
  await recargada; await p.waitForTimeout(1500);
  ok(await version(p) === 'prueba 3', `al pulsar "Actualizar" se pasa a la versión nueva (${await version(p)})`);

  // Sin conexión sigue abriendo.
  await ctx.setOffline(true);
  await p.reload();
  await p.waitForSelector('#pantalla-inicio:not([hidden]), #pantalla-biblioteca:not([hidden])', { timeout: 6000 });
  ok(true, 'sin conexión la app abre desde la caché');
  console.log('errores', errores);
  await b.close();
  srv.close();
})();
