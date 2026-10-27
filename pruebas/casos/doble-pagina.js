// Doble página en horizontal, una página en vertical y opción para desactivarla.
const { chromium } = require('playwright');
const { URL_APP, EPUBS: S, SALIDA, ok } = require('../lib/entorno.js');
(async () => {
  const b = await chromium.launch();
  for (const perfil of ['tinta', 'movil']) {
    const ctx = await b.newContext({ viewport: { width: 1240, height: 900 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const errores = []; p.on('pageerror', (e) => errores.push(e.message));
    await p.goto(URL_APP); await p.waitForTimeout(600);
    await p.click(`.opcion-grande[data-perfil=${perfil}]`); await p.click('#bienvenida-omitir'); await p.waitForTimeout(300);
    await p.setInputFiles('#archivo-epub', [`${S}/quijote.epub`]); await p.waitForTimeout(1500);
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300);
    await p.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]'); await p.waitForSelector('#visor iframe'); await p.waitForTimeout(2500);
    const columnas = () => p.evaluate(() => {
      const f = document.querySelector('#visor iframe'); const d = f.contentDocument;
      const cw = parseFloat(getComputedStyle(d.documentElement).columnWidth) || parseFloat(getComputedStyle(d.body).columnWidth);
      return { columna: Math.round(cw), visor: document.getElementById('visor').clientWidth };
    });
    let c = await columnas();
    await p.screenshot({ path: `${SALIDA}/doble-${perfil}.png` });
    ok(c.columna < c.visor / 2, `${perfil} horizontal: columna ${c.columna} px en visor de ${c.visor} px (dos páginas)`);
    const cfi1 = await p.evaluate(() => document.querySelector('#info-capitulo').textContent);
    await p.touchscreen.tap(1200, 450); await p.waitForTimeout(900);
    await p.touchscreen.tap(1200, 450); await p.waitForTimeout(900);
    await p.screenshot({ path: `${SALIDA}/doble-${perfil}-2.png` });
    await p.setViewportSize({ width: 900, height: 1240 }); await p.waitForTimeout(2500);
    c = await columnas();
    ok(c.columna > c.visor / 2, `${perfil} vertical: columna ${c.columna} px en visor de ${c.visor} px (una página)`);
    await p.setViewportSize({ width: 1240, height: 900 }); await p.waitForTimeout(2500);
    c = await columnas();
    ok(c.columna < c.visor / 2, `${perfil} vuelve a horizontal: dos páginas`);
    // Desactivar en Aa
    await p.touchscreen.tap(620, 450); await p.waitForTimeout(500);
    await p.click('#btn-menu-lector'); await p.waitForTimeout(400); await p.click('#btn-aa'); await p.waitForTimeout(500);
    await p.click('#panel-aa [aria-label="Dos páginas en horizontal"] button:has-text("No")'); await p.waitForTimeout(2500);
    c = await columnas();
    ok(c.columna > c.visor / 2, `${perfil} con la opción en No: una página`);
    console.log('  registro:', (await p.$$eval('#lista-registro li', (l) => l.map((x) => x.textContent))).filter((t) => /Lector:/.test(t)).join(' | '));
    console.log('  errores', errores);
    await ctx.close();
  }
  await b.close();
})();
