// Al cerrar y abrir la app, el libro abre en la misma página. epub.js coloca
// la página antes de que el capítulo termine de maquetarse y, en capítulos
// que no son el primero, se veía una página anterior a la guardada. Se lee
// unas páginas, se recarga la app sin cerrar el libro y se compara el primer
// texto visible, en el perfil Móvil y en el de Tinta electrónica.
const { chromium, devices } = require('playwright');
const { URL_APP, EPUBS: S, ok } = require('../lib/entorno.js');

const TITULO = 'Don Quijote de prueba';
const PAGINAS = [2, 5, 8, 11, 3, 6];

(async () => {
  const b = await chromium.launch();
  for (const tipo of ['movil', 'tinta']) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 402, height: 812 }, deviceScaleFactor: 3, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const errores = []; p.on('pageerror', (e) => errores.push(e.message));
    await p.goto(URL_APP); await p.waitForTimeout(700);
    await p.click(`.opcion-grande[data-tipo=${tipo}]`); await p.click('#bienvenida-omitir'); await p.waitForTimeout(300);
    await p.setInputFiles('#archivo-epub', [`${S}/quijote.epub`]); await p.waitForTimeout(2000);

    // Primer texto que se ve en pantalla.
    const visible = () => p.evaluate(() => {
      for (const f of document.querySelectorAll('#visor iframe')) {
        const marco = f.getBoundingClientRect();
        const doc = f.contentDocument;
        if (!doc) continue;
        const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          const r = doc.createRange(); r.selectNodeContents(n);
          for (const x of r.getClientRects()) {
            const izquierda = marco.left + x.left;
            if (izquierda >= 0 && izquierda < innerWidth - 5 && x.width > 0) return n.nodeValue.trim().slice(0, 40);
          }
        }
      }
      return null;
    });
    const abrir = async () => {
      await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(400);
      await p.click(`#pantalla-biblioteca button[aria-label="Abrir ${TITULO}"]`);
      await p.waitForSelector('#visor iframe'); await p.waitForTimeout(2500);
    };

    const fallos = [];
    const capitulos = new Set();
    for (const n of PAGINAS) {
      await abrir();
      for (let i = 0; i < n; i++) { await p.touchscreen.tap(380, 400); await p.waitForTimeout(600); }
      await p.waitForTimeout(800);
      const antes = await visible();
      capitulos.add(await p.textContent('#info-capitulo'));
      // Cerrar la app sin cerrar el libro.
      await p.reload(); await p.waitForTimeout(1500);
      if (await p.isVisible('#hoja-acciones')) { await p.click('#hoja-cancelar'); await p.waitForTimeout(500); }
      await abrir();
      const despues = await visible();
      if (!antes || antes !== despues) fallos.push(`${n} páginas: "${antes}" y al reabrir "${despues}"`);
      await p.goBack(); await p.waitForTimeout(800);
    }
    ok(capitulos.size >= 2 && fallos.length === 0, `${tipo}: al reabrir la app el libro abre en la misma página (${PAGINAS.length} pruebas, ${capitulos.size} capítulos)${fallos.length ? `: ${fallos.join('; ')}` : ''}`);
    console.log(tipo, 'errores', errores);
    await ctx.close();
  }
  await b.close();
})();
