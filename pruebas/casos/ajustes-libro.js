// Ajustes de lectura propios de un libro: con "Solo para este libro", el
// tamaño cambia en ese libro y no en los demás; al desactivarlo, vuelve a los
// generales.
const { chromium, devices } = require('playwright');
const { URL_APP, EPUBS: S, ok } = require('../lib/entorno.js');

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errores = []; p.on('pageerror', (e) => errores.push(e.message));
  await p.goto(URL_APP); await p.waitForTimeout(600);
  await p.click('.opcion-grande[data-perfil=movil]'); await p.click('#bienvenida-omitir'); await p.waitForTimeout(300);
  await p.setInputFiles('#archivo-epub', [`${S}/quijote.epub`, `${S}/cubierta.epub`]); await p.waitForTimeout(2000);
  const abrir = async (titulo) => {
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300);
    await p.click(`#pantalla-biblioteca button[aria-label="Abrir ${titulo}"]`); await p.waitForSelector('#visor iframe'); await p.waitForTimeout(1500);
  };
  const abrirAa = async () => {
    await p.touchscreen.tap(195, 330); await p.waitForTimeout(400);
    await p.click('#btn-menu-lector'); await p.waitForTimeout(400); await p.click('#btn-aa'); await p.waitForTimeout(500);
  };
  const tamano = () => p.textContent('#panel-aa .aa-valor');
  const tamanoEnLibro = () => p.evaluate(() => document.querySelector('#visor iframe').contentDocument.getElementById('lector-ajustes').textContent.match(/font-size: (\d+)%/)?.[1]);

  await abrir('Don Quijote de prueba');
  await abrirAa();
  ok(!(await p.isChecked('#ajustes-propios')), 'por defecto, el libro usa los ajustes generales');
  await p.click('#panel-aa .fila-interruptor'); await p.waitForTimeout(400);
  ok(await p.isChecked('#ajustes-propios'), 'se activan los ajustes propios del libro');
  for (let i = 0; i < 2; i++) await p.click('#panel-aa button[aria-label="Letra más grande"]');
  await p.waitForTimeout(1200);
  const propio = await tamano();
  ok(propio !== '100 %' && (await tamanoEnLibro()) === propio.replace(' %', ''), `el tamaño cambia en este libro (${propio})`);
  await p.goBack(); await p.waitForTimeout(500); await p.goBack(); await p.waitForTimeout(800); // panel y libro

  await abrir('Libro con cubierta');
  await abrirAa();
  ok((await tamano()) === '100 %' && !(await p.isChecked('#ajustes-propios')), 'otro libro conserva el tamaño general (100 %)');
  await p.goBack(); await p.waitForTimeout(500); await p.goBack(); await p.waitForTimeout(800);

  await abrir('Don Quijote de prueba');
  await abrirAa();
  ok((await tamano()) === propio, `al reabrir, el libro recupera sus ajustes (${await tamano()})`);
  await p.click('#panel-aa .fila-interruptor'); await p.waitForTimeout(1200);
  ok((await tamano()) === '100 %', 'al desactivarlo vuelve a los ajustes generales');
  console.log('errores', errores);
  await b.close();
})();
