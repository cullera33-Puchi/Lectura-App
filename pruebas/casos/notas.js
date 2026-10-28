// Mejora 22: notas al pie emergentes. Al tocar la llamada de una nota se ve su
// texto en una hoja sin salir de la página, en varios formatos de EPUB. Los
// enlaces que no son notas siguen saltando.
const { chromium, devices } = require('playwright');
const { URL_APP, SALIDA, ok } = require('../lib/entorno.js');
const { epubNotas } = require('../lib/epubs-raros.js');

(async () => {
  const datos = await epubNotas();
  const b = await chromium.launch();
  for (const perfil of ['movil', 'tinta']) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const errores = []; p.on('pageerror', (e) => errores.push(e.message));
    await p.goto(URL_APP); await p.waitForTimeout(600);
    await p.click(`.opcion-grande[data-perfil=${perfil}]`); await p.click('#bienvenida-omitir'); await p.waitForTimeout(300);
    await p.setInputFiles('#archivo-epub', [{ name: 'notas.epub', mimeType: 'application/epub+zip', buffer: datos }]); await p.waitForTimeout(1500);
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300);
    await p.click('#pantalla-biblioteca button[aria-label="Abrir Libro con notas"]');
    await p.waitForSelector('#visor iframe'); await p.waitForTimeout(1800);

    // Toca el enlace del texto indicado dentro del libro.
    const tocar = async (texto) => {
      const punto = await p.evaluate((t) => {
        for (const f of document.querySelectorAll('#visor iframe')) {
          const a = [...(f.contentDocument?.querySelectorAll('a[href]') || [])].find((x) => x.textContent.trim() === t);
          if (!a) continue;
          const rf = f.getBoundingClientRect(); const ra = a.getBoundingClientRect();
          return { x: rf.left + ra.left + ra.width / 2, y: rf.top + ra.top + ra.height / 2 };
        }
        return null;
      }, texto);
      if (!punto) throw new Error(`no se encuentra el enlace "${texto}"`);
      await p.touchscreen.tap(punto.x, punto.y); await p.waitForTimeout(900);
    };
    const hoja = async () => (await p.isVisible('#hoja-acciones')) ? { titulo: await p.textContent('#hoja-titulo'), texto: (await p.textContent('#hoja-botones .texto-hoja').catch(() => '')) || '' } : null;
    const enPrimeraPagina = () => p.evaluate(() => [...document.querySelectorAll('#visor iframe')].some((f) => /EPUB 3/.test(f.contentDocument?.body?.innerText || '') && f.getBoundingClientRect().left > -10 && f.getBoundingClientRect().left < 10));
    const pagina = () => p.textContent('#info-capitulo');

    const casos = [
      ['1', 'Nota 1', /^Nota en formato EPUB 3\.$/, 'EPUB 3 en el mismo archivo'],
      ['[2]', 'Nota 2', /^Nota de Calibre en otro archivo\.$/, 'Calibre en otro archivo'],
      ['3', 'Nota 3', /^Nota de una conversión de Kindle\.$/, 'conversión de Kindle'],
      ['4', 'Nota 4', /^Nota final cuatro\.Con un segundo párrafo\.$/, 'nota final con dos párrafos y sin el enlace de vuelta'],
    ];
    for (const [marca, titulo, re, nombre] of casos) {
      await tocar(marca);
      const h = await hoja();
      ok(h && h.titulo === titulo && re.test(h.texto.trim()), `${perfil}: ${nombre} (${JSON.stringify(h)})`);
      if (perfil === 'movil' && marca === '4') await p.screenshot({ path: `${SALIDA}/nota-al-pie.png` });
      await p.click('#hoja-cancelar'); await p.waitForTimeout(500);
    }
    ok(await p.isHidden('#hoja-acciones') && /Capítulo 1/.test(await pagina()), `${perfil}: al cerrar la nota se sigue en la misma página`);

    // "Ir a la nota" salta como antes.
    await tocar('[2]');
    await p.click('#hoja-botones button:has-text("Ir a la nota")'); await p.waitForTimeout(1500);
    await p.touchscreen.tap(195, 400); await p.waitForTimeout(400);
    ok(/Notas/.test(await pagina()), `${perfil}: "Ir a la nota" lleva a la nota (${await pagina()})`);
    // Volver al capítulo 1 desde el índice.
    if (!(await p.isVisible('#btn-menu-lector'))) { await p.touchscreen.tap(195, 400); await p.waitForTimeout(400); }
    await p.click('#btn-menu-lector'); await p.waitForTimeout(400); await p.click('#btn-indice'); await p.waitForTimeout(400);
    await p.click('#lista-indice button:has-text("Capítulo 1")'); await p.waitForTimeout(1500);

    // Enlaces que no son notas: saltan sin hoja.
    await tocar('2');
    const h2 = await hoja();
    await p.touchscreen.tap(195, 400); await p.waitForTimeout(400);
    ok(!h2 && /Capítulo 2/.test(await pagina()), `${perfil}: un número que enlaza a un título salta al capítulo (${await pagina()})`);
    console.log(perfil, 'errores', errores);
    await ctx.close();
  }
  await b.close();
})();
