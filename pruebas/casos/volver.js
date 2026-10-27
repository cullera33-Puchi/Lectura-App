// Volver a donde estabas: tras saltar desde el índice aparece un botón para
// regresar; después permite ir otra vez al destino; se oculta al pasar páginas.
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
    await p.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]'); await p.waitForSelector('#visor iframe'); await p.waitForTimeout(1500);
    const capitulo = async () => {
      await p.touchscreen.tap(195, 330); await p.waitForTimeout(400);
      const c = await p.textContent('#info-capitulo');
      await p.touchscreen.tap(195, 330); await p.waitForTimeout(300);
      return c;
    };
    ok(await p.isHidden('#btn-volver-lectura'), `${perfil}: sin saltos no hay botón de volver`);
    await p.touchscreen.tap(195, 330); await p.waitForTimeout(400);
    await p.click('#btn-menu-lector'); await p.waitForTimeout(400); await p.click('#btn-indice'); await p.waitForTimeout(400);
    await p.click('#lista-indice button:has-text("Capítulo 4")'); await p.waitForTimeout(1800);
    ok(await p.isVisible('#btn-volver-lectura') && /Volver a «Capítulo 1»/.test(await p.textContent('#texto-volver')), `${perfil}: tras saltar al capítulo 4 aparece "${await p.textContent('#texto-volver')}"`);
    await p.click('#btn-volver-lectura'); await p.waitForTimeout(1800);
    ok(/Capítulo 1/.test(await capitulo()), `${perfil}: al tocarlo vuelve al capítulo 1`);
    ok(/Volver a «Capítulo 4»/.test(await p.textContent('#texto-volver')), `${perfil}: y ofrece ir otra vez al capítulo 4`);
    for (let i = 0; i < 6; i++) { await p.touchscreen.tap(375, 330); await p.waitForTimeout(700); }
    ok(await p.isHidden('#btn-volver-lectura'), `${perfil}: al pasar varias páginas desaparece`);
    console.log('errores', errores);
    await ctx.close();
  }
  await b.close();
})();
