// Dos dispositivos con el Drive falso: subir, recibir, posición, continuar donde se quedó el otro, duplicados, bajas y sin conexión.
const { chromium, devices } = require('playwright');
const drive = require('../lib/drive-falso.js');
const { URL_APP, EPUBS: S, SALIDA, ok } = require('../lib/entorno.js');
const log = (...a) => console.log(...a);
(async () => {
  const b = await chromium.launch();
  async function dispositivo(nombre, perfil) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    await drive.instalar(ctx);
    const p = await ctx.newPage();
    p.errores = [];
    p.on('pageerror', (e) => p.errores.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/DRM|ZIP/.test(m.text())) p.errores.push(m.text()); });
    await p.goto(URL_APP); await p.waitForTimeout(700);
    await p.click(`.opcion-grande[data-perfil=${perfil}]`); await p.waitForTimeout(200);
    await p.fill('#bienvenida-nombre', nombre);
    await p.click('#bienvenida-conectar');
    await p.waitForFunction(() => !document.getElementById('pantalla-inicio').hidden);
    await p.waitForFunction(() => /Todo al día|nuevo|subido/.test(document.getElementById('aviso').textContent), null, { timeout: 15000 });
    log(`[${nombre}] primera sincronización:`, await p.textContent('#aviso'));
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(400);
    p.ctx = ctx;
    return p;
  }
  async function sincronizar(p, nombre) {
    await p.click('#btn-sincronizar');
    await p.waitForFunction(() => !document.getElementById('btn-sincronizar').disabled && !/\.\.\.$/.test(document.getElementById('aviso').textContent), null, { timeout: 20000 });
    log(`[${nombre}] sincronizar:`, JSON.stringify(await p.textContent('#aviso')));
  }
  const titulos = (p) => p.$$eval('#pantalla-biblioteca .libro', (ls) => ls.map((l) => `${l.querySelector('.libro-titulo').textContent} [${l.classList.contains('en-nube') ? 'nube' : 'descargado'}] ${l.querySelector('.libro-estado').textContent}`));
  const indicador = (p) => p.evaluate(() => { const i = document.querySelector('#btn-sincronizar .indicador'); return i.hidden ? 0 : i.textContent; });

  const A = await dispositivo('iPhone', 'movil');
  await A.setInputFiles('#archivo-epub', [`${S}/quijote.epub`, `${S}/cubierta.epub`]); await A.waitForTimeout(1500);
  log('[iPhone] indicador tras importar:', await indicador(A), '|', (await titulos(A)).join(' ; '));
  ok(String(await indicador(A)) === '2', 'el indicador cuenta los 2 libros pendientes de subir');
  await sincronizar(A, 'iPhone');
  log('[iPhone] indicador tras sincronizar:', await indicador(A));
  ok(String(await indicador(A)) === '0', 'tras sincronizar no queda nada pendiente');
  let e = drive.estado();
  log('DRIVE:', e.vivos.sort().join(', '));
  log('biblioteca.json:', e.biblioteca.version, e.biblioteca.libros.map((l) => `${l.titulo} archivo=${Boolean(l.archivoDriveId)} portada=${Boolean(l.portadaDriveId)}`).join(' ; '));
  ok(e.biblioteca.version === 1 && e.biblioteca.libros.length === 2 && e.biblioteca.libros.every((l) => l.archivoDriveId && l.portadaDriveId), 'biblioteca.json con versión, 2 libros, archivo y portada');

  const B = await dispositivo('Note Air 4C', 'tinta');
  log('[Tablet] biblioteca:', (await titulos(B)).join(' ; '));
  ok((await titulos(B)).length === 2 && (await titulos(B)).every((t) => t.includes('[nube]')), 'la tablet recibe los 2 libros en la nube');
  log('[Tablet] portadas:', await B.$$eval('.libro img.portada', (i) => i.length), '| botón Descargar todos visible:', await B.isVisible('#btn-descargar-todos'));
  // Abrir libro en la nube: descarga y abre
  await B.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]');
  await B.waitForSelector('#visor iframe', { timeout: 15000 }); await B.waitForTimeout(1500);
  const vp = B.viewportSize();
  await B.touchscreen.tap(vp.width / 2, vp.height / 2); await B.waitForTimeout(200);
  await B.click('#btn-menu-lector'); await B.waitForTimeout(400); await B.click('#btn-indice'); await B.click('#lista-indice button:has-text("Capítulo 4")'); await B.waitForTimeout(1200);
  await B.touchscreen.tap(vp.width - 20, vp.height / 2); await B.waitForTimeout(600);
  await B.touchscreen.tap(vp.width / 2, vp.height / 2); await B.waitForTimeout(300);
  const infoB = await B.textContent('#info-capitulo') + ' | ' + await B.textContent('#info-progreso');
  log('[Tablet] leyendo:', infoB);
  // Sincronizar desde el lector
  await B.click('#btn-menu-lector'); await B.waitForTimeout(400);
  await B.click('#btn-sincronizar-lector');
  await B.waitForFunction(() => !document.getElementById('btn-sincronizar-lector').disabled && !/\.\.\.$/.test(document.getElementById('aviso').textContent), null, { timeout: 20000 });
  log('[Tablet] sincronizar desde lector:', JSON.stringify(await B.textContent('#aviso')));
  await B.goBack(); await B.waitForTimeout(600);
  log('[Tablet] biblioteca:', (await titulos(B)).join(' ; '));
  e = drive.estado();
  const prog = Object.values(e.progreso.progreso)[0];
  log('progreso.json:', e.progreso.version, prog.capitulo, prog.dispositivo, prog.cfi);
  ok(prog.capitulo === 'Capítulo 4' && prog.dispositivo === 'Note Air 4C' && prog.cfi.startsWith('epubcfi('), 'progreso.json con la posición CFI de la tablet');

  // iPhone: sincroniza y abre -> aviso de posición
  await sincronizar(A, 'iPhone');
  log('[iPhone] biblioteca:', (await titulos(A)).join(' ; '));
  await A.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]');
  await A.waitForSelector('#hoja-acciones:not([hidden])', { timeout: 5000 });
  log('[iPhone] aviso:', await A.textContent('#hoja-titulo'));
  ok(/Leíste hasta "Capítulo 4"/.test(await A.textContent('#hoja-titulo')), 'el iPhone ofrece continuar donde se quedó la tablet');
  await A.click('#hoja-botones button:has-text("Ir allí")');
  await A.waitForSelector('#visor iframe'); await A.waitForTimeout(1500);
  await A.touchscreen.tap(195, 330); await A.waitForTimeout(300);
  const mismoPunto = (await A.evaluate(() => new Promise((r) => { const q = indexedDB.open('lector-epub'); q.onsuccess = () => { const t = q.result.transaction('progreso').objectStore('progreso').getAll(); t.onsuccess = () => r(t.result[0].cfi); }; }))) === prog.cfi;
  ok(mismoPunto && /Capítulo 4/.test(await A.textContent('#info-capitulo')), 'Ir allí abre en el mismo punto exacto');
  await A.goBack(); await A.waitForTimeout(500);
  // Reabrir: ya no debe preguntar
  await A.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]'); await A.waitForTimeout(800);
  log('[iPhone] reabrir pregunta otra vez:', await A.isVisible('#hoja-acciones'));
  ok(!(await A.isVisible('#hoja-acciones')), 'al reabrir ya no pregunta');
  await A.goBack(); await A.waitForTimeout(500);

  // Duplicado (criterio 4)
  await B.setInputFiles('#archivo-epub', [`${S}/quijote.epub`]); await B.waitForTimeout(800);
  log('[Tablet] reimportar:', await B.textContent('#aviso'));
  ok(/No se ha duplicado/.test(await B.textContent('#aviso')), 'reimportar el mismo libro no lo duplica');

  // Mismo libro importado en los dos antes de sincronizar
  await A.setInputFiles('#archivo-epub', [`${S}/abecedario.epub`]); await A.waitForTimeout(800);
  await B.setInputFiles('#archivo-epub', [`${S}/abecedario.epub`]); await B.waitForTimeout(800);
  await sincronizar(A, 'iPhone');
  await sincronizar(B, 'Note Air 4C');
  log('copias de abecedario en Drive:', drive.estado().vivos.filter((n) => n.endsWith('.epub')).length, 'epub en total');

  // Eliminar (criterio 5)
  await A.click('#pantalla-biblioteca button[aria-label="Acciones de Libro con cubierta"]');
  await A.click('#hoja-botones button:has-text("Eliminar de la biblioteca")');
  await A.click('#hoja-botones button:has-text("Eliminar")'); await A.waitForTimeout(400);
  await sincronizar(A, 'iPhone');
  log('papelera Drive:', drive.estado().papelera.length, 'archivos');
  ok(drive.estado().papelera.length >= 2, 'al eliminar, el EPUB y la portada van a la papelera de Drive');
  await sincronizar(B, 'Note Air 4C');
  log('[Tablet] biblioteca tras baja:', (await titulos(B)).join(' ; '));
  ok(!(await titulos(B)).some((t) => t.startsWith('Libro con cubierta')), 'la baja llega a la tablet');

  // Quitar de este dispositivo
  await B.click('#pantalla-biblioteca button[aria-label="Acciones de Don Quijote de prueba"]');
  await B.click('#hoja-botones button:has-text("Quitar de este dispositivo")'); await B.waitForTimeout(500);
  log('[Tablet] tras quitar:', (await titulos(B)).join(' ; '));
  // Sin conexión (criterio 6)
  await B.ctx.setOffline(true);
  await B.click('#btn-sincronizar'); await B.waitForTimeout(300);
  log('[Tablet] sin conexión:', await B.textContent('#aviso'));
  ok(/Sin conexión/.test(await B.textContent('#aviso')), 'sin conexión se avisa en lugar de fallar');
  await B.ctx.setOffline(false);
  await sincronizar(B, 'Note Air 4C');
  log('ERRORES iPhone:', A.errores, '| tablet:', B.errores);
  await A.screenshot({ path: `${S}/f3-iphone.png` });
  await B.screenshot({ path: `${S}/f3-tablet.png` });
  await b.close();
})();
