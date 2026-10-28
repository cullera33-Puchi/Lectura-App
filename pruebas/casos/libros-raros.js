// Mejora 19: un capítulo dañado no bloquea el lector y un libro muy ilustrado
// abre sin descomprimir todas sus imágenes.
const fs = require('fs');
const { chromium, devices } = require('playwright');
const { URL_APP, SALIDA, ok } = require('../lib/entorno.js');
const { epubDanado, epubIlustrado } = require('../lib/epubs-raros.js');

(async () => {
  const danado = await epubDanado();
  const ilustrado = `${SALIDA}/ilustrado.epub`; // más de 50 MB: va por archivo
  fs.writeFileSync(ilustrado, await epubIlustrado(40, 2));
  const b = await chromium.launch();
  for (const perfil of ['movil', 'tinta']) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const errores = []; p.on('pageerror', (e) => errores.push(e.message));
    await p.goto(URL_APP); await p.waitForTimeout(600);
    await p.click(`.opcion-grande[data-perfil=${perfil}]`); await p.click('#bienvenida-omitir'); await p.waitForTimeout(300);
    await p.setInputFiles('#archivo-epub', [{ name: 'danado.epub', mimeType: 'application/epub+zip', buffer: danado }]); await p.waitForTimeout(1500);
    await p.setInputFiles('#archivo-epub', [ilustrado]); await p.waitForTimeout(4000);
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300);
    const textoVisor = () => p.evaluate(() => [...document.querySelectorAll('#visor iframe')].map((f) => f.contentDocument?.body?.innerText || '').join(' | '));

    // Libro dañado: se recorre entero pasando página.
    await p.click('#pantalla-biblioteca button[aria-label="Abrir Libro dañado"]');
    await p.waitForSelector('#visor iframe', { timeout: 20000 }); await p.waitForTimeout(1500);
    const vistos = new Set();
    for (let i = 0; i < 40; i++) {
      const t = await textoVisor();
      if (/espacio duro/.test(t)) vistos.add('c2');
      if (/no se puede mostrar/.test(t)) vistos.add('c3');
      if (/Cuatro: párrafo/.test(t)) vistos.add('c4');
      if (/following errors/.test(t)) vistos.add('error del navegador');
      await p.touchscreen.tap(370, 330); await p.waitForTimeout(250);
    }
    ok(vistos.has('c2') && !vistos.has('error del navegador'), `${perfil}: un capítulo con XHTML mal formado se lee (${[...vistos].join(', ')})`);
    ok(vistos.has('c3'), `${perfil}: un capítulo que falta muestra un aviso`);
    ok(vistos.has('c4'), `${perfil}: se puede seguir leyendo después de la parte dañada`);
    // Desde el índice, al capítulo que falta y de vuelta al 1.
    await p.touchscreen.tap(195, 330); await p.waitForTimeout(400);
    if (!(await p.isVisible('#btn-menu-lector'))) { await p.touchscreen.tap(195, 330); await p.waitForTimeout(400); }
    await p.click('#btn-menu-lector'); await p.waitForTimeout(400); await p.click('#btn-indice'); await p.waitForTimeout(400);
    await p.click('#lista-indice button:has-text("Capítulo 3")'); await p.waitForTimeout(1500);
    ok(/no se puede mostrar/.test(await textoVisor()), `${perfil}: el índice lleva a la parte dañada sin bloquear`);
    await p.touchscreen.tap(195, 330); await p.waitForTimeout(400);
    if (!(await p.isVisible('#btn-menu-lector'))) { await p.touchscreen.tap(195, 330); await p.waitForTimeout(400); }
    await p.click('#btn-menu-lector'); await p.waitForTimeout(400); await p.click('#btn-indice'); await p.waitForTimeout(400);
    await p.click('#lista-indice button:has-text("Capítulo 1")'); await p.waitForTimeout(1500);
    ok(/Uno: párrafo/.test(await textoVisor()), `${perfil}: y después a otro capítulo`);
    await p.goBack(); await p.waitForTimeout(800);

    // Libro ilustrado (80 MB): abre rápido y la imagen del capítulo se ve.
    await p.click('#pantalla-biblioteca button[aria-label="Abrir Libro ilustrado"]');
    await p.waitForSelector('#visor iframe', { timeout: 30000 }); await p.waitForTimeout(1500);
    const registro = await p.evaluate(async () => (await import('/src/ui/registro.js')).registroComoTexto());
    const ms = Number((/"Libro ilustrado" abierto en (\d+) ms/.exec(registro) || [])[1]);
    const img = await p.evaluate(() => [...document.querySelectorAll('#visor iframe')].map((f) => f.contentDocument?.querySelector('img')?.getAttribute('src')).filter(Boolean)[0]);
    console.log(`${perfil}: libro de 80 MB abierto en ${ms} ms`);
    ok(ms > 0 && ms < 1500, `${perfil}: el libro de 80 MB abre en ${ms} ms`);
    ok(/^blob:/.test(img || ''), `${perfil}: la imagen del capítulo se carga (${img})`);
    await p.goBack(); await p.waitForTimeout(500);
    console.log(perfil, 'errores', errores);
    await ctx.close();
  }
  await b.close();
})();
