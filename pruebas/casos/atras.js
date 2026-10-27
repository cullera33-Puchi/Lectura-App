// Botón Atrás (Android) sobre una pestaña: cierra la hoja de acciones o la
// ficha sin salir de la app. Cerrar una hoja con Cancelar retira su entrada
// del historial. Un doble toque en Ajustes deja una sola entrada.
const { chromium, devices } = require('playwright');
const { URL_APP, EPUBS: S, ok } = require('../lib/entorno.js');

(async () => {
  const b = await chromium.launch();
  for (const perfil of ['movil', 'tinta']) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errores = []; p.on('pageerror', (e) => errores.push(e.message));
  await p.goto(URL_APP); await p.waitForTimeout(600);
  await p.click(`.opcion-grande[data-perfil=${perfil}]`); await p.click('#bienvenida-omitir'); await p.waitForTimeout(300);
  await p.setInputFiles('#archivo-epub', [`${S}/quijote.epub`]); await p.waitForTimeout(1500);
  await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300);
  const enLaApp = () => p.evaluate(() => Boolean(document.getElementById('pantalla-biblioteca')));
  const acciones = async () => { await p.click('#pantalla-biblioteca button[aria-label="Acciones de Don Quijote de prueba"]'); await p.waitForTimeout(400); };

  await acciones();
  await p.goBack(); await p.waitForTimeout(500);
  ok(await enLaApp() && !(await p.isVisible('#hoja-acciones')), `${perfil}: Atrás cierra la hoja de acciones sin salir de la app`);

  await acciones();
  await p.click('#hoja-cancelar'); await p.waitForTimeout(500);
  ok(!(await p.evaluate(() => history.state?.capa)), `${perfil}: Cancelar retira la entrada de la hoja`);

  await acciones();
  await p.click('#hoja-botones button:has-text("Ficha del libro")'); await p.waitForTimeout(900);
  ok(await p.isVisible('#panel-ficha'), `${perfil}: de la hoja a la ficha`);
  await p.goBack(); await p.waitForTimeout(600);
  ok(await enLaApp() && !(await p.isVisible('#panel-ficha')), `${perfil}: Atrás cierra la ficha sin salir de la app`);

  await p.click('#btn-ajustes'); await p.click('#btn-ajustes', { force: true }).catch(() => {}); await p.waitForTimeout(400);
  await p.goBack(); await p.waitForTimeout(500);
  ok(await p.isHidden('#pantalla-ajustes') && await enLaApp(), `${perfil}: Atrás sale de Ajustes tras un doble toque`);
  ok(!(await p.evaluate(() => history.state?.pantalla)), `${perfil}: sin entradas de más en el historial`);
  console.log(perfil, 'errores', errores);
  await ctx.close();
  }
  await b.close();
})();
