// EPUB con DRM, dañado o con scripts: los dos primeros se rechazan al importar
// y los scripts del tercero no se ejecutan.
const { chromium, devices } = require('playwright');
const { URL_APP, EPUBS: S, ok } = require('../lib/entorno.js');

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errores = []; p.on('pageerror', (e) => errores.push(e.message));
  await p.goto(URL_APP); await p.waitForTimeout(600);
  await p.click('.opcion-grande[data-perfil=movil]'); await p.click('#bienvenida-omitir'); await p.waitForTimeout(300);
  await p.setInputFiles('#archivo-epub', [`${S}/protegido.epub`, `${S}/danado.epub`, `${S}/malicioso.epub`]); await p.waitForTimeout(2000);
  const aviso = await p.textContent('#aviso');
  ok(/protegido\.epub: Este libro no se puede abrir/.test(aviso) && /danado\.epub: Este libro no se puede abrir/.test(aviso), 'EPUB con DRM y dañado rechazados con aviso');
  await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300);
  ok((await p.$$('#pantalla-biblioteca .libro')).length === 1, 'solo se importa el EPUB válido');
  await p.click('#pantalla-biblioteca .libro-abrir'); await p.waitForSelector('#visor iframe'); await p.waitForTimeout(1500);
  await p.touchscreen.tap(360, 400); await p.waitForTimeout(600);
  const ejecutados = await p.evaluate(() => [1, 2, 3, 4, 5].map((i) => window[`__pwned${i}`]).filter((x) => x !== undefined));
  ok(ejecutados.length === 0, 'ningún script del libro se ejecuta en la app');
  const cabeza = await p.frameLocator('#visor iframe').locator('head').innerHTML();
  ok(cabeza.includes('Content-Security-Policy') && !cabeza.includes('<script'), 'el capítulo lleva política de seguridad y sin scripts');
  ok(/\d+ %/.test(await p.textContent('#info-progreso')) || (await p.textContent('#info-capitulo')).length > 0, 'el libro se lee y pasa página');
  console.log('errores', errores);
  await b.close();
})();
