// Mejora 28: formato del editor o el mío, por libro. Con "Mis ajustes" se
// aplican letra, interlineado y justificación de "Aa"; con "Del editor" se
// respetan los del EPUB. En los dos, el tamaño de "Aa" escala también los
// tamaños fijos (pt, px) del libro.
const { chromium, devices } = require('playwright');
const { URL_APP, EPUBS: S, ok } = require('../lib/entorno.js');
const { epubMaquetado } = require('../lib/epubs-raros.js');

(async () => {
  const datos = await epubMaquetado();
  const b = await chromium.launch();
  for (const perfil of ['movil', 'tinta']) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const errores = []; p.on('pageerror', (e) => errores.push(e.message));
    await p.goto(URL_APP); await p.waitForTimeout(600);
    await p.click(`.opcion-grande[data-perfil=${perfil}]`); await p.click('#bienvenida-omitir'); await p.waitForTimeout(300);
    await p.setInputFiles('#archivo-epub', [{ name: 'maquetado.epub', mimeType: 'application/epub+zip', buffer: datos }]); await p.waitForTimeout(1200);
    await p.setInputFiles('#archivo-epub', [`${S}/quijote.epub`]); await p.waitForTimeout(1200);
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300);

    const estilo = (id) => p.evaluate((i) => {
      for (const f of document.querySelectorAll('#visor iframe')) {
        const el = f.contentDocument?.getElementById(i) || (i === 'p' ? f.contentDocument?.querySelector('p') : null);
        if (!el) continue;
        const c = f.contentWindow.getComputedStyle(el);
        return { fuente: c.fontFamily, tamano: parseFloat(c.fontSize), interlineado: parseFloat(c.lineHeight) / parseFloat(c.fontSize), alineacion: c.textAlign };
      }
      return null;
    }, id);
    const abrirAa = async () => {
      await p.touchscreen.tap(195, 330); await p.waitForTimeout(400);
      if (!(await p.isVisible('#btn-menu-lector'))) { await p.touchscreen.tap(195, 330); await p.waitForTimeout(400); }
      await p.click('#btn-menu-lector'); await p.waitForTimeout(400); await p.click('#btn-aa'); await p.waitForTimeout(500);
    };
    const cerrarAa = async () => { await p.goBack(); await p.waitForTimeout(600); };

    await p.click('#pantalla-biblioteca button[aria-label="Abrir Libro maquetado"]'); await p.waitForSelector('#visor iframe'); await p.waitForTimeout(1800);
    await abrirAa();
    await p.click('#panel-aa [data-ajuste=fuente][data-valor=literata]'); await p.waitForTimeout(1500);
    let e = await estilo('fijo');
    ok(/Literata/.test(e.fuente) && e.alineacion === 'justify' && Math.abs(e.interlineado - 1.5) < 0.05,
      `${perfil}: con "Mis ajustes" se aplican letra, interlineado y justificación (${JSON.stringify(e)})`);
    const antes = e.tamano;
    const pequenoAntes = (await estilo('pequeno')).tamano;
    await p.click('#panel-aa [data-tamano=mas]'); await p.waitForTimeout(1500);
    e = await estilo('fijo');
    const pequeno = (await estilo('pequeno')).tamano;
    ok(e.tamano > antes && pequeno > pequenoAntes, `${perfil}: "A" grande agranda también los tamaños fijos del libro (${antes} a ${e.tamano} px; ${pequenoAntes} a ${pequeno} px)`);

    await p.click('#panel-aa [data-ajuste=formato][data-valor=libro]'); await p.waitForTimeout(1500);
    e = await estilo('fijo');
    const visibles = await p.evaluate(() => ({
      fuentes: Boolean(document.querySelector('#panel-aa [data-ajuste=fuente]')),
      interlineado: Boolean(document.querySelector('#panel-aa [data-ajuste=interlineado]')),
      margenes: Boolean(document.querySelector('#panel-aa [data-ajuste=margenes]')),
    }));
    ok(/Courier/.test(e.fuente) && e.alineacion === 'left' && Math.abs(e.interlineado - 1) < 0.05,
      `${perfil}: con "Del editor" se respetan letra, interlineado y alineación (${JSON.stringify(e)})`);
    ok(!visibles.fuentes && !visibles.interlineado && visibles.margenes, `${perfil}: con "Del editor" "Aa" oculta letra e interlineado y deja los márgenes`);
    ok(Math.abs(e.tamano - antes * 1.1) < 1.5 || e.tamano > antes, `${perfil}: con "Del editor" se mantiene el tamaño elegido (${e.tamano} px)`);
    await cerrarAa(); await p.goBack(); await p.waitForTimeout(800);

    // Otro libro sigue con "Mis ajustes".
    await p.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]'); await p.waitForSelector('#visor iframe'); await p.waitForTimeout(1800);
    e = await estilo('p');
    ok(/Literata/.test(e.fuente), `${perfil}: otro libro sigue con mis ajustes (${e.fuente})`);
    await p.goBack(); await p.waitForTimeout(800);
    // Al reabrir, el libro maquetado conserva "Del editor".
    await p.click('#pantalla-biblioteca button[aria-label="Abrir Libro maquetado"]'); await p.waitForSelector('#visor iframe'); await p.waitForTimeout(1800);
    e = await estilo('fijo');
    ok(/Courier/.test(e.fuente), `${perfil}: al reabrirlo conserva el formato del editor`);
    console.log(perfil, 'errores', errores);
    await ctx.close();
  }
  await b.close();
})();
