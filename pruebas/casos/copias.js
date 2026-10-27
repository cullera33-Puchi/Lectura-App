// Prueba de la copia de seguridad con dos dispositivos y el Drive falso.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const drive = require('../lib/drive-falso.js');
const { URL_APP, EPUBS: S, SALIDA, ok } = require('../lib/entorno.js');
(async () => {
  const b = await chromium.launch();
  async function disp(nombre, perfil) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block', acceptDownloads: true });
    await drive.instalar(ctx);
    const p = await ctx.newPage();
    p.errores = []; p.on('pageerror', (e) => p.errores.push(e.message));
    await p.goto(URL_APP); await p.waitForTimeout(600);
    await p.click(`.opcion-grande[data-perfil=${perfil}]`); await p.fill('#bienvenida-nombre', nombre);
    await p.click('#bienvenida-conectar');
    await p.waitForFunction(() => /Todo al día|nuevo|subido|eliminado|posici/.test(document.getElementById('aviso').textContent), null, { timeout: 15000 });
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300);
    return p;
  }
  const esperarSinc = (p) => p.waitForFunction(() => !document.getElementById('btn-sincronizar').disabled, null, { timeout: 20000 });
  const sinc = async (p) => { await esperarSinc(p); await p.click('#btn-sincronizar'); await p.waitForTimeout(100); await esperarSinc(p); await p.waitForTimeout(200); return p.textContent('#aviso'); };
  const idb = (p, store) => p.evaluate((store) => new Promise((r) => { const q = indexedDB.open('lector-epub'); q.onsuccess = () => { const t = q.result.transaction(store).objectStore(store).getAll(); t.onsuccess = () => r(t.result); }; }), store);
  const vaciar = (p, store) => p.evaluate((store) => new Promise((r) => { const q = indexedDB.open('lector-epub'); q.onsuccess = () => { const t = q.result.transaction(store, 'readwrite').objectStore(store).clear(); t.onsuccess = () => r(); }; }), store);
  const copiasDrive = () => [...drive.archivos.values()].filter((a) => !a.trashed && a.name.startsWith('copia-'));

  // 1. Retención (función pura)
  const A = await disp('iPhone', 'movil');
  const ret = await A.evaluate(async () => {
    const c = await import('/src/sync/copias.js');
    const archivos = [];
    const hoy = new Date(2026, 9, 27);
    for (let i = 0; i < 500; i++) {
      const d = new Date(hoy); d.setDate(d.getDate() - i);
      archivos.push({ id: `f${i}`, name: c.nombreCopia(d), modifiedTime: d.toISOString() });
    }
    archivos.push({ id: 'dup', name: c.nombreCopia(hoy), modifiedTime: new Date(2026, 9, 27, 1).toISOString() });
    archivos.push({ id: 'otro', name: 'notas.json', modifiedTime: '' });
    const borrar = new Set(c.copiasABorrar(archivos, c.diaLocal(hoy)).map((a) => a.id));
    const quedan = archivos.filter((a) => !borrar.has(a.id) && a.id !== 'otro').map((a) => a.name.slice(6, 16)).sort();
    return { quedan, borraOtro: borrar.has('otro'), duplicadoBorrado: borrar.has('dup') || borrar.has('f0') };
  });
  const mensuales = ret.quedan.filter((d) => d < '2026-09-28');
  ok(ret.quedan.length === 30 + mensuales.length && mensuales.length === 11 && mensuales.every((d) => d.endsWith('-01')) && !ret.borraOtro && ret.duplicadoBorrado,
    `retención: ${ret.quedan.length} copias (30 diarias y ${mensuales.length} mensuales: ${mensuales.join(', ')})`);

  // 2. Copia diaria en la primera sincronización
  await A.setInputFiles('#archivo-epub', [`${S}/quijote.epub`, `${S}/cubierta.epub`]); await A.waitForTimeout(1500);
  await A.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]');
  await A.waitForSelector('#visor iframe'); await A.waitForTimeout(1500);
  for (let i = 0; i < 3; i++) { await A.touchscreen.tap(375, 330); await A.waitForTimeout(600); }
  await A.goBack(); await A.waitForTimeout(500);
  await sinc(A);
  await A.evaluate(async () => { const c = await import('/src/datos/colecciones.js'); await c.fijarObjetivo(2026, 15); await c.crearColeccion('Favoritos'); });
  await sinc(A);
  ok(copiasDrive().length === 1, `copia del día en Drive: ${copiasDrive().map((a) => a.name).join(', ')}`);
  const vacia = JSON.parse(copiasDrive()[0].contenido.toString());
  ok(vacia.libros.length === 0, 'la copia de hoy es la de la primera sincronización (al conectar, sin libros) y no se sobrescribe');
  // Simula el día siguiente: la copia de hoy pasa a ser de ayer.
  for (const a of copiasDrive()) a.name = 'copia-2026-10-26.json';
  await A.evaluate(async () => { const p = await import('/src/datos/pendientes.js'); await p.guardarSincronizacion('ultimaCopia', '2026-10-26'); });
  await sinc(A);
  ok(copiasDrive().length === 2, `nueva copia al día siguiente: ${copiasDrive().map((a) => a.name).sort().join(', ')}`);
  const copia = JSON.parse(copiasDrive().find((a) => a.name !== 'copia-2026-10-26.json').contenido.toString());
  ok(copia.tipo === 'lector-epub-copia' && copia.version === 1 && copia.libros.length === 2 && Object.keys(copia.sesiones).length === 1, 'la copia lleva tipo, versión, libros y sesiones');

  const B = await disp('Note Air 4C', 'tinta');
  await sinc(B);
  ok(copiasDrive().length === 2, 'el otro dispositivo no repite la copia del mismo día');

  // 3. Descarga manual
  await A.click('#pantalla-biblioteca .boton-ajustes'); await A.waitForTimeout(800);
  ok(/Última copia en Drive/.test(await A.textContent('#ultima-copia')), `Ajustes: ${await A.textContent('#ultima-copia')}`);
  const [descarga] = await Promise.all([A.waitForEvent('download'), A.click('#btn-descargar-copia')]);
  const ruta = `${SALIDA}/copia-descargada.json`;
  await descarga.saveAs(ruta);
  const manual = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  ok(descarga.suggestedFilename().startsWith('lector-epub-copia-') && Object.keys(manual.progreso).length >= 1 && manual.objetivos['2026']?.libros === 15,
    `descarga manual: ${descarga.suggestedFilename()} con ${Object.keys(manual.progreso).length} posiciones y objetivo`);
  await A.goBack(); await A.waitForTimeout(400);

  // 4. Pérdida de datos en el iPhone y restauración desde el archivo
  const sesionesAntes = (await idb(A, 'sesiones')).length;
  const remotoAntes = drive.estado().sesiones.find((s) => s.dispositivo === 'iPhone').sesiones.length;
  await vaciar(A, 'sesiones'); await vaciar(A, 'progreso');
  await A.evaluate(async () => { const a = await import('/src/datos/almacen.js'); await a.guardarAjuste('objetivos', {}); await a.guardarAjuste('colecciones', []); const p = await import('/src/datos/pendientes.js'); await p.guardarSincronizacion('progresoRemoto', null); });
  await A.click('#pantalla-biblioteca .boton-ajustes'); await A.waitForTimeout(600);
  await A.click('#btn-restaurar-copia'); await A.waitForTimeout(400);
  await A.click('#hoja-botones button:has-text("Desde un archivo")'); await A.waitForTimeout(300);
  await A.setInputFiles('#archivo-copia', ruta); await A.waitForTimeout(600);
  console.log('   confirmación:', (await A.textContent('#hoja-titulo')).replace(/\n/g, ' | '));
  await A.click('#hoja-botones button:has-text("Restaurar")'); await A.waitForTimeout(800);
  console.log('   aviso:', (await A.textContent('#aviso')).replace(/\n/g, ' | '));
  const sesionesDespues = await idb(A, 'sesiones');
  const progresoDespues = await idb(A, 'progreso');
  const objetivos = await A.evaluate(async () => (await import('/src/datos/colecciones.js')).leerObjetivos());
  ok(sesionesDespues.length === sesionesAntes && sesionesDespues.every((s) => s.idOriginal), `sesiones recuperadas: ${sesionesDespues.length} de ${sesionesAntes}`);
  ok(progresoDespues.length >= 1 && objetivos['2026']?.libros === 15, 'posiciones y objetivo recuperados');
  await A.goBack(); await A.waitForTimeout(400);
  await sinc(A);
  const remotoDespues = drive.estado().sesiones.find((s) => s.dispositivo === 'iPhone').sesiones.length;
  ok(remotoDespues === remotoAntes, `sin doble conteo en Drive tras restaurar: ${remotoAntes} -> ${remotoDespues} sesiones`);

  // 5. Restaurar desde Drive en la tablet tras perder el objetivo, sin pisar lo más reciente
  await B.evaluate(async () => { const a = await import('/src/datos/almacen.js'); await a.guardarAjuste('objetivos', {}); });
  await B.click('#pantalla-biblioteca .boton-ajustes'); await B.waitForTimeout(600);
  await B.click('#btn-restaurar-copia'); await B.waitForTimeout(400);
  await B.click('#hoja-botones button:has-text("Desde Google Drive")'); await B.waitForTimeout(1200);
  const opciones = await B.$$eval('#hoja-botones .fila-hoja', (l) => l.map((x) => x.textContent));
  console.log('   copias en Drive:', opciones.join(' | '));
  await B.click('#hoja-botones .fila-hoja >> nth=0'); await B.waitForTimeout(1200);
  await B.click('#hoja-botones button:has-text("Restaurar")'); await B.waitForTimeout(800);
  const objB = await B.evaluate(async () => (await import('/src/datos/colecciones.js')).leerObjetivos());
  ok(objB['2026']?.libros === 15, 'la tablet recupera el objetivo desde la copia de Drive');
  console.log('   aviso:', (await B.textContent('#aviso')).replace(/\n/g, ' | '));

  // 6. Archivo que no es una copia
  fs.writeFileSync(`${SALIDA}/no-copia.json`, JSON.stringify({ hola: 1 }));
  await B.click('#btn-restaurar-copia'); await B.waitForTimeout(400);
  await B.click('#hoja-botones button:has-text("Desde un archivo")'); await B.waitForTimeout(300);
  await B.setInputFiles('#archivo-copia', `${SALIDA}/no-copia.json`); await B.waitForTimeout(500);
  ok(/no es una copia/.test(await B.textContent('#aviso')), 'un JSON ajeno se rechaza con un aviso');
  const diag = await B.textContent('#tabla-diagnostico');
  ok(/Última copia de seguridad en Drive/.test(diag), 'el diagnóstico muestra la última copia');

  console.log('errores iPhone:', A.errores, '| tablet:', B.errores);
  await b.close();
})();
