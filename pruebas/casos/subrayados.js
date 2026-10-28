// Mejoras 26 y 27: subrayados en colores y notas. Seleccionar texto muestra la
// barra; un color subraya; tocar el subrayado permite cambiar el color, añadir
// una nota o borrarlo; la lista del lector salta al pasaje; se exporta a
// Markdown y llega al otro dispositivo al sincronizar. En tinta electrónica,
// subrayado simple.
const fs = require('fs');
const { chromium, devices } = require('playwright');
const drive = require('../lib/drive-falso.js');
const { URL_APP, EPUBS: S, SALIDA, ok } = require('../lib/entorno.js');

(async () => {
  const b = await chromium.launch();
  async function dispositivo(nombre, perfil) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block', acceptDownloads: true });
    await drive.instalar(ctx);
    const p = await ctx.newPage();
    p.errores = [];
    p.on('pageerror', (e) => p.errores.push(e.message));
    await p.goto(URL_APP); await p.waitForTimeout(700);
    await p.click(`.opcion-grande[data-perfil=${perfil}]`); await p.waitForTimeout(200);
    await p.fill('#bienvenida-nombre', nombre);
    await p.click('#bienvenida-conectar');
    await p.waitForFunction(() => !document.getElementById('pantalla-inicio').hidden);
    await p.waitForTimeout(3000);
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(400);
    return p;
  }
  const sincronizar = async (p) => {
    await p.click('#btn-sincronizar');
    await p.waitForFunction(() => !document.getElementById('btn-sincronizar').disabled && !/\.\.\.$/.test(document.getElementById('aviso').textContent), null, { timeout: 20000 });
  };
  // Selecciona dentro del libro el texto de un párrafo (desde..hasta).
  const seleccionar = (p, n, desde, hasta) => p.evaluate(([i, a, z]) => {
    const f = [...document.querySelectorAll('#visor iframe')].find((x) => x.contentDocument?.querySelectorAll('p').length);
    const doc = f.contentDocument;
    const nodo = doc.querySelectorAll('p')[i].firstChild;
    const r = doc.createRange();
    r.setStart(nodo, a); r.setEnd(nodo, z);
    const sel = doc.getSelection();
    sel.removeAllRanges(); sel.addRange(r);
    return r.toString();
  }, [n, desde, hasta]);
  const marcas = (p) => p.evaluate(() => [...document.querySelectorAll('#visor [class^="subrayado-"]')].map((g) => g.getAttribute('class')));
  const centroDe = (p, clase) => p.evaluate((c) => {
    const g = document.querySelector(`#visor .${c} rect`) || document.querySelector(`#visor .${c} line`);
    if (!g) return null;
    const r = g.getBoundingClientRect();
    return { x: r.left + Math.min(r.width / 2, 30), y: r.top + r.height / 2 };
  }, clase);

  const A = await dispositivo('iPhone', 'movil');
  await A.setInputFiles('#archivo-epub', [`${S}/quijote.epub`]); await A.waitForTimeout(1500);
  await A.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]');
  await A.waitForSelector('#visor iframe'); await A.waitForTimeout(1800);

  const texto = await seleccionar(A, 0, 6, 40);
  await A.waitForTimeout(800);
  ok(await A.isVisible('#barra-seleccion') && (await A.$$('#colores-seleccion .color-subrayado')).length === 4, `movil: al seleccionar "${texto}" sale la barra con 4 colores`);
  await A.click('#colores-seleccion [data-color=verde]'); await A.waitForTimeout(1200);
  ok(!(await A.isVisible('#barra-seleccion')) && (await marcas(A)).some((c) => /subrayado-verde/.test(c)), `movil: el texto queda subrayado en verde (${(await marcas(A)).join(', ')})`);

  // Tocar el subrayado: cambiar a rosa y añadir una nota.
  let punto = await centroDe(A, 'subrayado-verde');
  await A.touchscreen.tap(punto.x, punto.y); await A.waitForTimeout(700);
  ok(await A.isVisible('#hoja-acciones') && /Borrar subrayado/.test(await A.textContent('#hoja-botones')), 'movil: tocar el subrayado abre sus opciones');
  await A.click('#hoja-botones .colores-hoja [data-color=rosa]'); await A.waitForTimeout(1000);
  ok((await marcas(A)).some((c) => /subrayado-rosa/.test(c)), 'movil: el color cambia a rosa');
  punto = await centroDe(A, 'subrayado-rosa');
  await A.touchscreen.tap(punto.x, punto.y); await A.waitForTimeout(700);
  await A.click('#hoja-botones button:has-text("Añadir nota")'); await A.waitForTimeout(500);
  await A.fill('#hoja-botones textarea', 'Inicio célebre de la novela.');
  await A.click('#hoja-botones button:has-text("Guardar")'); await A.waitForTimeout(800);

  // Segundo subrayado con nota directa desde la barra.
  await seleccionar(A, 1, 0, 25); await A.waitForTimeout(800);
  await A.click('#btn-nota-seleccion'); await A.waitForTimeout(500);
  await A.fill('#hoja-botones textarea', 'Otra idea.');
  await A.click('#hoja-botones button:has-text("Guardar")'); await A.waitForTimeout(800);

  // Lista en el lector.
  await A.touchscreen.tap(195, 330); await A.waitForTimeout(400);
  if (!(await A.isVisible('#btn-menu-lector'))) { await A.touchscreen.tap(195, 330); await A.waitForTimeout(400); }
  await A.click('#btn-menu-lector'); await A.waitForTimeout(400); await A.click('#btn-subrayados'); await A.waitForTimeout(500);
  const filas = await A.$$eval('#lista-subrayados .subrayado-fila', (l) => l.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  ok(filas.length === 2 && /Inicio célebre/.test(filas[0]) && /Otra idea/.test(filas[1]), `movil: la lista tiene los 2 subrayados en orden con sus notas`);
  await A.screenshot({ path: `${SALIDA}/subrayados-lista.png` });

  // Exportar (en este navegador se descarga).
  const descarga = A.waitForEvent('download');
  await A.click('#btn-exportar-subrayados');
  const archivo = await descarga;
  const md = fs.readFileSync(await archivo.path(), 'utf8');
  ok(archivo.suggestedFilename() === 'Don Quijote de prueba - subrayados.md' && /^# Don Quijote de prueba/.test(md) && /## Capítulo 1/.test(md) && /> .+/.test(md) && /\*\*Nota:\*\* Inicio célebre/.test(md),
    `movil: exporta a Markdown (${archivo.suggestedFilename()})`);
  console.log(md.split('\n').slice(0, 12).join('\n'));
  await A.click('#btn-cerrar-subrayados'); await A.waitForTimeout(300);
  await A.goBack(); await A.waitForTimeout(800);
  await sincronizar(A);

  // Tablet: recibe los subrayados, en tinta como subrayado simple.
  const B = await dispositivo('Tablet', 'tinta');
  await B.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]');
  await B.waitForSelector('#visor iframe', { timeout: 15000 }); await B.waitForTimeout(2500);
  if (await B.isVisible('#hoja-acciones')) { await B.click('#hoja-botones button:has-text("Ir allí")').catch(() => {}); await B.waitForTimeout(1500); }
  const enB = await B.evaluate(() => [...document.querySelectorAll('#visor [class^="subrayado-"]')].map((g) => g.tagName + (g.querySelector('line') ? ':linea' : ':relleno')));
  ok(enB.length >= 1 && enB.every((x) => /linea/.test(x)), `tinta: recibe los subrayados como subrayado simple (${enB.join(', ')})`);
  await seleccionar(B, 2, 0, 20); await B.waitForTimeout(800);
  ok(await B.isVisible('#barra-seleccion') && (await B.$$('#colores-seleccion .color-subrayado')).length === 0 && /Subrayar/.test(await B.textContent('#colores-seleccion')), 'tinta: la barra ofrece "Subrayar" sin colores');
  await B.click('#colores-seleccion button'); await B.waitForTimeout(800);
  await B.goBack(); await B.waitForTimeout(800);
  await sincronizar(B);
  await sincronizar(A);
  const enA = await A.evaluate(async () => (await (await import('/src/datos/anotaciones.js')).todosLosSubrayados()).length);
  ok(enA === 3, `el subrayado de la tablet llega al iPhone (${enA} en total)`);
  ok(/subrayados y notas/.test(await A.textContent('#aviso')), `el resumen de sincronización lo cuenta: ${await A.textContent('#aviso')}`);

  // Ficha del libro (iPhone): lista y exportación.
  await A.click('#pantalla-biblioteca button[aria-label="Acciones de Don Quijote de prueba"]'); await A.waitForTimeout(400);
  await A.click('#hoja-botones button:has-text("Ficha del libro")'); await A.waitForTimeout(900);
  const ficha = (await A.textContent('#ficha-contenido')).replace(/\s+/g, ' ');
  ok(/Subrayados y notas \(3\)/.test(ficha) && /Inicio célebre/.test(ficha) && await A.isVisible('#ficha-contenido button:has-text("Exportar a Markdown")'), 'la ficha muestra los 3 subrayados y el botón de exportar');
  // Un subrayado de la ficha abre el libro en su pasaje (con "Volver").
  await A.click('#ficha-contenido .ficha-subrayado >> nth=2'); await A.waitForSelector('#visor iframe'); await A.waitForTimeout(2500);
  ok(await A.isVisible('#lector') && await A.isVisible('#btn-volver-lectura'), 'desde la ficha, el subrayado abre el libro en su pasaje con el botón para volver');
  await A.goBack(); await A.waitForTimeout(800);

  // Cita del día en Inicio.
  await A.click('.pestana[data-pestana=inicio]'); await A.waitForTimeout(600);
  const cita = await A.textContent('#contenido-inicio .tarjeta-cita').catch(() => null);
  ok(cita && /Don Quijote de prueba/.test(cita), `Inicio muestra la cita del día: ${cita?.replace(/\s+/g, ' ').slice(0, 80)}`);
  const otraVez = await A.evaluate(async () => { const m = await import('/src/biblioteca/inicio.js'); await m.pintarInicio(); return document.querySelector('#contenido-inicio .tarjeta-cita')?.textContent; });
  ok(otraVez === cita, 'la cita es la misma durante el día');
  await A.screenshot({ path: `${SALIDA}/cita-del-dia.png` });
  await A.click('#contenido-inicio .tarjeta-cita'); await A.waitForSelector('#visor iframe'); await A.waitForTimeout(2500);
  ok(await A.isVisible('#lector'), 'tocar la cita abre el libro');
  await A.goBack(); await A.waitForTimeout(600);
  console.log('errores', A.errores, B.errores);
  await b.close();
})();
