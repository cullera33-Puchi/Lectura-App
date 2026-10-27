// Las hojas que suben desde abajo (ficha, acciones, índice y Aa) se cierran
// deslizando hacia abajo. Un arrastre corto no cierra, y si el contenido está
// desplazado, el gesto solo desplaza.
const { chromium, devices } = require('playwright');
const { URL_APP, EPUBS: S, ok } = require('../lib/entorno.js');

(async () => {
  const b = await chromium.launch();
  for (const perfil of ['movil', 'tinta']) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const errores = []; p.on('pageerror', (e) => errores.push(e.message));
    const cdp = await ctx.newCDPSession(p);
    const arrastrar = async (x, y0, dy, pasos = 10, espera = 16) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
      for (let k = 1; k <= pasos; k++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (dy * k) / pasos }] });
        await p.waitForTimeout(espera);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.waitForTimeout(800); // la hoja baja a la velocidad del dedo: hasta medio segundo
    };
    await p.goto(URL_APP); await p.waitForTimeout(600);
    await p.click(`.opcion-grande[data-perfil=${perfil}]`); await p.click('#bienvenida-omitir'); await p.waitForTimeout(300);
    await p.setInputFiles('#archivo-epub', [`${S}/sinopsis.epub`]); await p.waitForTimeout(1200);
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300);
    const abrirFicha = async () => {
      await p.click('#pantalla-biblioteca button[aria-label="Acciones de Libro con sinopsis"]'); await p.waitForTimeout(400);
      await p.click('#hoja-botones button:has-text("Ficha del libro")'); await p.waitForTimeout(900);
    };
    const cabecera = async () => (await p.locator('#panel-ficha .hoja-cabecera h2').boundingBox());

    await abrirFicha();
    let c = await cabecera();
    await arrastrar(c.x + 20, c.y + 10, 40, 10, 40);
    ok(await p.isVisible('#panel-ficha'), `${perfil}: un arrastre corto y lento no cierra la ficha`);
    c = await cabecera();
    await arrastrar(c.x + 20, c.y + 10, 220);
    ok(!(await p.isVisible('#panel-ficha')), `${perfil}: deslizar hacia abajo cierra la ficha`);

    await abrirFicha();
    await p.evaluate(() => { document.getElementById('panel-ficha').scrollTop = 200; });
    const sinopsis = await p.locator('#panel-ficha .ficha-sinopsis').boundingBox();
    await arrastrar(sinopsis.x + 20, sinopsis.y + 5, 220);
    ok(await p.isVisible('#panel-ficha'), `${perfil}: con la ficha desplazada, deslizar hacia abajo solo desplaza`);
    await p.click('#btn-cerrar-ficha'); await p.waitForTimeout(500);

    // Hoja de acciones
    await p.click('#pantalla-biblioteca button[aria-label="Acciones de Libro con sinopsis"]'); await p.waitForTimeout(500);
    const t = await p.locator('#hoja-titulo').boundingBox();
    await arrastrar(t.x + 20, t.y + 5, 200);
    ok(!(await p.isVisible('#hoja-acciones')), `${perfil}: deslizar hacia abajo cierra la hoja de acciones`);
    console.log('errores', errores);
    await ctx.close();
  }
  await b.close();
})();
