// Mejora 20: deslizar en la penúltima página del contenido cargado no rebota.
// Mientras se arrastra, las vistas llevan un translateX que reduce el ancho
// desplazable; si se medía con él, con una sola página por delante el lector
// creía que no había más, frenaba el arrastre y devolvía la página. Se prueba
// en la penúltima página del libro, en horizontal y en vertical, y pasando de
// capítulo deslizando, imitando cómo mide Safari el ancho desplazable.
const { chromium, devices } = require('playwright');
const { URL_APP, EPUBS: S, ok } = require('../lib/entorno.js');

(async () => {
  const b = await chromium.launch();
  for (const [nombre, dispositivo, vista] of [
    ['horizontal', 'iPhone 13 landscape', { width: 844, height: 390 }],
    ['vertical', 'iPhone 13', null],
  ]) {
    const ctx = await b.newContext({ ...devices[dispositivo], ...(vista ? { viewport: vista } : {}), serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const errores = []; p.on('pageerror', (e) => errores.push(e.message));
    await p.goto(URL_APP); await p.waitForTimeout(600);
    await p.click('.opcion-grande[data-perfil=movil]'); await p.click('#bienvenida-omitir'); await p.waitForTimeout(300);
    await p.setInputFiles('#archivo-epub', [`${S}/quijote.epub`]); await p.waitForTimeout(1500);
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(400);
    await p.click('#pantalla-biblioteca .libro-abrir'); await p.waitForSelector('#visor iframe'); await p.waitForTimeout(2000);
    const { width: ancho, height: alto } = p.viewportSize();
    // Como en Safari: el translateX de las vistas al arrastrar reduce el
    // ancho desplazable del contenedor (Chromium no lo hace).
    await p.evaluate(() => {
      const c = document.querySelector('#visor .epub-container');
      const d = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth');
      Object.defineProperty(c, 'scrollWidth', {
        configurable: true,
        get() {
          const v = c.firstElementChild;
          const t = v ? new DOMMatrix(getComputedStyle(v).transform).m41 : 0;
          return d.get.call(c) + Math.min(0, Math.round(t));
        },
      });
    });
    const cdp = await ctx.newCDPSession(p);

    // Desliza a la izquierda y dice si la página ha rebotado y dónde acaba.
    async function deslizar() {
      const antes = await p.evaluate(() => {
        const c = document.querySelector('#visor .epub-container');
        window.__m = []; const t0 = performance.now();
        const f = () => { window.__m.push([c.scrollLeft, Math.round(new DOMMatrix(getComputedStyle(c.firstElementChild).transform).m41)]); if (performance.now() - t0 < 900) requestAnimationFrame(f); };
        requestAnimationFrame(f);
        return { sl: c.scrollLeft, cw: c.clientWidth };
      });
      const x0 = ancho * 0.7; const y = alto / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
      for (let k = 1; k <= 8; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 - (ancho / 20) * k, y }] }); await p.waitForTimeout(16); }
      const arrastrada = await p.evaluate(() => Math.round(new DOMMatrix(getComputedStyle(document.querySelector('#visor .epub-container').firstElementChild).transform).m41));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.waitForTimeout(1000);
      const m = await p.evaluate(() => window.__m);
      const rebote = m.some((x, k) => k > 0 && x[0] === antes.sl && x[1] > m[k - 1][1] + 5 && m[k - 1][1] > -antes.cw * 0.9 && m[k - 1][1] < -20);
      const despues = await p.evaluate(() => document.querySelector('#visor .epub-container').scrollLeft);
      return { rebote, frenada: arrastrada > -(ancho * 0.3), avanza: despues - antes.sl, cw: antes.cw };
    }

    // Pasar de capítulo deslizando: sin rebotes.
    let rebotes = 0;
    const capitulos = new Set();
    for (let i = 0; i < 40; i++) {
      if ((await deslizar()).rebote) rebotes += 1;
      capitulos.add(await p.textContent('#info-capitulo'));
    }
    ok(capitulos.size >= 2 && rebotes === 0, `${nombre}: 40 páginas deslizando, ${capitulos.size} capítulos, ${rebotes} rebotes`);

    // Penúltima página del libro: queda una sola página cargada por delante.
    await p.touchscreen.tap(ancho / 2, alto / 2); await p.waitForTimeout(400);
    await p.click('#btn-menu-lector'); await p.waitForTimeout(400); await p.click('#btn-indice'); await p.waitForTimeout(400);
    await p.click('#lista-indice button >> nth=-1'); await p.waitForTimeout(1800);
    for (let i = 0; i < 60; i++) {
      const quedan = await p.evaluate(() => { const c = document.querySelector('#visor .epub-container'); return Math.round((c.scrollWidth - c.scrollLeft - c.clientWidth) / c.clientWidth); });
      if (quedan <= 1) break;
      await p.touchscreen.tap(ancho - 15, alto / 2); await p.waitForTimeout(500);
    }
    const r = await deslizar();
    ok(!r.rebote && !r.frenada && r.avanza === r.cw, `${nombre}: en la penúltima página el arrastre no se frena ni rebota y pasa a la última (${JSON.stringify(r)})`);
    console.log(nombre, 'errores', errores);
    await ctx.close();
  }
  await b.close();
})();
