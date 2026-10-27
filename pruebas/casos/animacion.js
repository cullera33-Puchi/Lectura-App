// Paso de página: animado en Móvil y sin animación en Tinta electrónica. Uso: node casos/animacion.js movil|tinta
const { chromium, devices } = require('playwright');
const { URL_APP, EPUBS: S, SALIDA, ok } = require('../lib/entorno.js');
const perfil = process.argv[2] || 'movil';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errores = []; p.on('pageerror', (e) => errores.push(e.message));
  await p.goto(URL_APP); await p.waitForTimeout(600);
  await p.click(`.opcion-grande[data-perfil=${perfil}]`); await p.click('#bienvenida-omitir'); await p.waitForTimeout(300);
  await p.setInputFiles('#archivo-epub', [`${S}/cubierta.epub`]); await p.waitForTimeout(1200);
  await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(400); await p.click('#pantalla-biblioteca .libro-abrir'); await p.waitForSelector('#visor iframe'); await p.waitForTimeout(1500);
  const muestrear = () => p.evaluate(() => {
    const c = document.querySelector('#visor .epub-container');
    window.__m = []; const t0 = performance.now();
    const f = () => { const v = c.firstElementChild; window.__m.push([c.scrollLeft, Math.round(new DOMMatrix(getComputedStyle(v).transform).m41)]); if (performance.now() - t0 < 500) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  const resultado = async (etiqueta) => {
    const m = await p.evaluate(() => window.__m);
    const scrolls = [...new Set(m.map((x) => x[0]))];
    const trans = [...new Set(m.map((x) => x[1]))];
    console.log(perfil, etiqueta, '| valores de scrollLeft:', scrolls.join(','), '| fotogramas con transformación distinta:', trans.length, '| capítulo:', await p.textContent('#info-capitulo'));
    // Móvil: varios fotogramas de animación y un solo salto de scroll. Tinta: sin animación.
    if (perfil === 'movil') ok(trans.length > 5 && scrolls.length <= 2, `${perfil} ${etiqueta}: página animada sin saltos intermedios`);
    else ok(trans.length === 1 && scrolls.length <= 2, `${perfil} ${etiqueta}: cambio de página sin animación`);
    return scrolls[scrolls.length - 1];
  };
  for (let i = 0; i < 3; i++) { await muestrear(); await p.touchscreen.tap(370, 300); await p.waitForTimeout(700); await resultado(`toque ${i + 1}`); }
  // deslizamiento
  const cdp = await ctx.newCDPSession(p);
  await muestrear();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 300 }] });
  for (let k = 1; k <= 8; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300 - 25 * k, y: 300 }] }); await p.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(700);
  await resultado('deslizar');
  await p.touchscreen.tap(20, 300); await p.waitForTimeout(700);
  await p.touchscreen.tap(20, 300); await p.waitForTimeout(700);
  console.log(perfil, 'atrás x2 -> scrollLeft', await p.evaluate(() => document.querySelector('#visor .epub-container').scrollLeft));
  ok(!/respaldo/.test(await p.textContent('#lista-registro')), `${perfil}: sin pasar al método de respaldo`);
  console.log('errores:', errores);
  await b.close();
})();
