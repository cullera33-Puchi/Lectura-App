// Un recurso del libro (una imagen) que no se puede descomprimir no deja el
// capítulo en blanco: se pinta sin él y queda anotado en el registro. Antes,
// epub.js esperaba ese recurso para siempre (visto en el ordenador con un
// libro de Penguin).
const { chromium, devices } = require('playwright');
const { URL_APP, ok } = require('../lib/entorno.js');
const { epubIlustrado, epubEstiloCircular } = require('../lib/epubs-raros.js');

(async () => {
  const datos = await epubIlustrado(3, 1);
  const b = await chromium.launch();
  for (const perfil of ['movil', 'tinta']) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const errores = []; p.on('pageerror', (e) => errores.push(e.message));
    await p.goto(URL_APP); await p.waitForTimeout(600);
    await p.click(`.opcion-grande[data-perfil=${perfil}]`); await p.click('#bienvenida-omitir'); await p.waitForTimeout(300);
    await p.setInputFiles('#archivo-epub', [{ name: 'ilustrado.epub', mimeType: 'application/epub+zip', buffer: datos }]); await p.waitForTimeout(1500);
    await p.evaluate(async () => {
      const { cargarEpub } = await import('/src/lector/librerias.js');
      await cargarEpub();
      const proto = Object.getPrototypeOf(new window.JSZip().file('a.jpg', 'x').file('a.jpg'));
      const original = proto.async;
      proto.async = function (tipo, ...resto) {
        if (/i1\.jpg$/.test(this.name) && tipo !== 'string') return Promise.reject(new Error('Corrupted zip'));
        if (/c2\.xhtml$/.test(this.name)) return Promise.reject(new Error('Corrupted zip'));
        return original.call(this, tipo, ...resto);
      };
    });
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300);
    const t0 = Date.now();
    await p.click('#pantalla-biblioteca button[aria-label="Abrir Libro ilustrado"]');
    await p.waitForSelector('#visor iframe'); await p.waitForTimeout(2000);
    const registro = await p.evaluate(async () => (await import('/src/ui/registro.js')).registroComoTexto());
    const texto = await p.evaluate(() => [...document.querySelectorAll('#visor iframe')].map((f) => f.contentDocument?.body?.innerText || '').join(' '));
    ok(/abierto en/.test(registro) && /Lámina 1/.test(texto), `${perfil}: el capítulo se pinta aunque su imagen esté dañada (${Date.now() - t0} ms)`);
    ok(/recurso del libro que no se puede leer \(Corrupted zip\): .*i1\.jpg/.test(registro), `${perfil}: el registro anota la imagen dañada`);
    // El capítulo 2 tiene el texto dañado: aviso de parte dañada, sin bloquear.
    await p.touchscreen.tap(195, 330); await p.waitForTimeout(400);
    if (!(await p.isVisible('#btn-menu-lector'))) { await p.touchscreen.tap(195, 330); await p.waitForTimeout(400); }
    await p.click('#btn-menu-lector'); await p.waitForTimeout(400); await p.click('#btn-indice'); await p.waitForTimeout(400);
    await p.click('#lista-indice button:has-text("Lámina 2")'); await p.waitForTimeout(2000);
    const dos = await p.evaluate(() => [...document.querySelectorAll('#visor iframe')].map((f) => f.contentDocument?.body?.innerText || '').join(' '));
    ok(/no se puede mostrar/.test(dos), `${perfil}: un capítulo con el texto dañado muestra el aviso en lugar de quedarse en blanco`);
    // Hoja de estilo que nombra su propio archivo: antes se esperaba a sí
    // misma y el capítulo se quedaba en blanco.
    await p.goBack(); await p.waitForTimeout(600);
    await p.setInputFiles('#archivo-epub', [{ name: 'circular.epub', mimeType: 'application/epub+zip', buffer: await epubEstiloCircular() }]); await p.waitForTimeout(1500);
    await p.click('#pantalla-biblioteca button[aria-label="Abrir Libro con estilo circular"]'); await p.waitForTimeout(2500);
    const circular = await p.evaluate(() => [...document.querySelectorAll('#visor iframe')].map((f) => f.contentDocument?.body?.innerText || '').join(' '));
    const sangria = await p.evaluate(() => { const f = document.querySelector('#visor iframe'); const q = f?.contentDocument?.querySelector('p'); return q ? f.contentWindow.getComputedStyle(q).textIndent : null; });
    ok(/Uno: párrafo/.test(circular) && sangria && sangria !== '0px', `${perfil}: una hoja de estilo que se nombra a sí misma no deja el capítulo en blanco (sangría ${sangria})`);
    console.log(perfil, 'errores', errores);
    await ctx.close();
  }
  await b.close();
})();
