// Panel Aa: el tema no repagina, el tamaño sube con cada toque y la posición se conserva.
const { chromium, devices } = require('playwright');
const { URL_APP, EPUBS: S, ok } = require('../lib/entorno.js');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errores = []; p.on('pageerror', (e) => errores.push(e.message));
  await p.goto(URL_APP); await p.waitForTimeout(600);
  await p.click('.opcion-grande[data-perfil=movil]'); await p.click('#bienvenida-omitir'); await p.waitForTimeout(400);
  await p.setInputFiles('#archivo-epub', [`${S}/quijote.epub`]); await p.waitForTimeout(1200);
  await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300);
  await p.click('#pantalla-biblioteca .libro-abrir'); await p.waitForSelector('#visor iframe'); await p.waitForTimeout(1500);
  for (let i = 0; i < 4; i++) { await p.touchscreen.tap(375, 330); await p.waitForTimeout(350); }
  await p.waitForTimeout(500);
  const cfi = () => p.evaluate(() => new Promise((r) => { const q = indexedDB.open('lector-epub'); q.onsuccess = () => { const t = q.result.transaction('progreso').objectStore('progreso').getAll(); t.onsuccess = () => r(t.result[0]?.cfi); }; }));
  const c0 = await cfi();
  await p.evaluate(() => { window.__iframes = 0; new MutationObserver((m) => m.forEach((x) => x.addedNodes.forEach((n) => { if (n.tagName === 'DIV' || n.tagName === 'IFRAME') window.__iframes++; }))).observe(document.getElementById('visor'), { childList: true, subtree: true }); });
  await p.touchscreen.tap(195, 330); await p.waitForTimeout(400);
  await p.click('#btn-menu-lector'); await p.waitForTimeout(400); await p.click('#btn-aa'); await p.waitForTimeout(500);
  await p.click('#panel-aa button:has-text("Sepia")'); await p.waitForTimeout(800);
  const trasTema = await p.evaluate(() => window.__iframes);
  for (let i = 0; i < 3; i++) await p.click('#panel-aa button[aria-label="Letra más grande"]');
  await p.waitForTimeout(1500);
  const tam = await p.textContent('#panel-aa .aa-valor');
  const trasTamano = await p.evaluate(() => window.__iframes);
  const c1 = await cfi();
  console.log('vistas recreadas al cambiar solo el tema:', trasTema, '| tamaño tras 3 toques:', tam, '| vistas recreadas tras 3 toques:', trasTamano - trasTema, '| CFI guardado igual:', c0 === c1);
  ok(trasTema === 0, 'cambiar solo el tema no vuelve a paginar');
  ok(tam === '130 %' || tam === '135 %' || parseInt(tam, 10) > 100, `tres toques en "A" suben el tamaño (${tam})`);
  ok(c0 === c1, 'cambiar el tamaño conserva la posición guardada');
  console.log('errores', errores);
  await b.close();
})();
