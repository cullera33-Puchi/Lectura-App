// La app instalada abre y lee sin conexión gracias al service worker.
const { chromium, devices } = require('playwright');
const { URL_APP, EPUBS: S, ok } = require('../lib/entorno.js');

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  const errores = []; p.on('pageerror', (e) => errores.push(e.message));
  await p.goto(URL_APP); await p.waitForTimeout(800);
  await p.click('.opcion-grande[data-perfil=movil]'); await p.click('#bienvenida-omitir'); await p.waitForTimeout(300);
  await p.setInputFiles('#archivo-epub', [`${S}/quijote.epub`]); await p.waitForTimeout(1500);
  await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 }).catch(() => {});
  await p.reload(); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => Boolean(navigator.serviceWorker.controller)), 'el service worker controla la app');
  await ctx.setOffline(true);
  await p.reload(); await p.waitForTimeout(2500);
  await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(400);
  const titulos = await p.$$eval('#pantalla-biblioteca .libro-titulo', (e) => e.map((x) => x.textContent));
  ok(titulos.includes('Don Quijote de prueba'), 'sin conexión, la biblioteca abre con sus libros');
  await p.click('#pantalla-biblioteca .libro-abrir'); await p.waitForSelector('#visor iframe', { timeout: 15000 }); await p.waitForTimeout(1500);
  await p.touchscreen.tap(360, 300); await p.waitForTimeout(800);
  ok((await p.textContent('#info-capitulo')).length > 0, `sin conexión, el libro se lee: ${await p.textContent('#info-capitulo')}`);
  console.log('errores', errores);
  await b.close();
})();
