// Prueba de la v2 y la v3 con dos dispositivos y el Drive falso.
const { chromium, devices } = require('playwright');
const drive = require('../lib/drive-falso.js');
const { URL_APP, EPUBS: S, SALIDA, ok } = require('../lib/entorno.js');
(async () => {
  const b = await chromium.launch();
  async function disp(nombre, perfil) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
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
  const sinc = async (p) => {
    await esperarSinc(p);
    await p.click('#btn-sincronizar');
    await p.waitForTimeout(100);
    await esperarSinc(p);
    await p.waitForTimeout(200);
    return p.textContent('#aviso');
  };
  const idb = (p, store) => p.evaluate((store) => new Promise((r) => { const q = indexedDB.open('lector-epub'); q.onsuccess = () => { const t = q.result.transaction(store).objectStore(store).getAll(); t.onsuccess = () => r(t.result); }; }), store);
  const hoja = async (p, texto) => { await p.click(`#hoja-botones button:has-text("${texto}")`); await p.waitForTimeout(400); };
  const accion = async (p, titulo, texto) => {
    await p.click(`#pantalla-biblioteca button[aria-label="Acciones de ${titulo}"]`); await p.waitForTimeout(350);
    await hoja(p, texto);
  };
  const titulos = (p) => p.$$eval('#pantalla-biblioteca .libro .libro-titulo', (l) => l.map((x) => x.textContent));

  const A = await disp('iPhone', 'movil');
  await A.setInputFiles('#archivo-epub', [`${S}/quijote.epub`, `${S}/cubierta.epub`, `${S}/abecedario.epub`]); await A.waitForTimeout(2000);
  await sinc(A);

  // --- Colecciones ---
  await A.click('#btn-colecciones'); await A.waitForTimeout(300);
  await hoja(A, 'Nueva colección...');
  await A.fill('.campo-hoja', 'Clásicos'); await hoja(A, 'Crear');
  await A.waitForTimeout(300);
  ok(await A.isVisible('#grupo-activo') && (await A.textContent('#grupo-nombre')) === 'Clásicos', 'crear una colección la deja seleccionada');
  ok((await titulos(A)).length === 0, 'colección nueva vacía');
  await A.click('#btn-quitar-grupo'); await A.waitForTimeout(300);
  await accion(A, 'Don Quijote de prueba', 'Añadir a una colección');
  await hoja(A, 'Clásicos');
  await A.click('#btn-colecciones'); await A.waitForTimeout(300);
  await hoja(A, 'Clásicos (1 libro)');
  ok(JSON.stringify(await titulos(A)) === JSON.stringify(['Don Quijote de prueba']), 'la colección muestra el libro añadido');
  await A.click('#btn-quitar-grupo'); await A.waitForTimeout(300);

  // --- Búsqueda ---
  await A.click('#btn-buscar'); await A.waitForTimeout(200);
  await A.fill('#buscar-biblioteca', 'quijote'); await A.waitForTimeout(500);
  ok(JSON.stringify(await titulos(A)) === JSON.stringify(['Don Quijote de prueba']), 'buscar "quijote" (sin mayúscula) encuentra el libro');
  await A.fill('#buscar-biblioteca', 'zzz'); await A.waitForTimeout(500);
  ok((await titulos(A)).length === 0 && /Ningún libro coincide/.test(await A.textContent('#biblioteca-vacia')), 'búsqueda sin resultados avisa');
  await A.click('#btn-cerrar-busqueda'); await A.waitForTimeout(400);
  ok((await titulos(A)).length === 3, 'Cancelar limpia la búsqueda');

  // --- Editar información y portada ---
  const png = await A.evaluate(() => new Promise((r) => { const c = document.createElement('canvas'); c.width = 60; c.height = 90; const x = c.getContext('2d'); x.fillStyle = '#0a7'; x.fillRect(0, 0, 60, 90); c.toBlob((bl) => bl.arrayBuffer().then((ab) => r([...new Uint8Array(ab)])), 'image/png'); }));
  await accion(A, 'Abecedario sin portada', 'Editar información');
  const campos = A.locator('.campo-formulario input');
  await campos.nth(0).fill('Abecedario editado');
  await campos.nth(2).fill('Saga de prueba');
  await campos.nth(3).fill('2');
  await A.setInputFiles('.campo-portada input[type=file]', { name: 'p.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await A.waitForTimeout(500);
  ok(await A.isVisible('.muestra-portada img'), 'la portada elegida se ve en el formulario');
  await A.click('#hoja-botones .fila-hoja:has-text("Guardar")'); await A.waitForTimeout(600);
  ok((await titulos(A)).includes('Abecedario editado'), 'el título editado aparece en la biblioteca');
  const pend = (await idb(A, 'pendientes')).map((p) => p.tipo).sort();
  ok(pend.includes('metadatos') && pend.includes('subirPortada'), `pendientes tras editar: ${pend.join(', ')}`);
  console.log('   aviso sinc:', await sinc(A));
  const bibA = drive.estado().biblioteca;
  const abc = bibA.libros.find((l) => l.titulo === 'Abecedario editado');
  ok(abc && abc.serie === 'Saga de prueba' && abc.numeroSerie === 2 && abc.portadaDriveId, 'biblioteca.json lleva título, serie, número y portada');
  ok(bibA.colecciones?.length === 1 && bibA.libros.find((l) => l.titulo.startsWith('Don')).colecciones?.length === 1, 'biblioteca.json lleva la colección');

  // --- Objetivo anual ---
  await A.click('.pestana[data-pestana=estadisticas]'); await A.waitForTimeout(500);
  await A.click('#contenido-estadisticas button:has-text("Fijar objetivo")'); await A.waitForTimeout(300);
  await A.fill('.campo-hoja', '20'); await hoja(A, 'Guardar'); await A.waitForTimeout(400);
  ok(/0 de 20/.test(await A.textContent('#contenido-estadisticas')), 'el objetivo se muestra en Estadísticas');

  // --- Lectura en el iPhone: sesiones, terminar y sincronización automática al cerrar ---
  await A.click('.pestana[data-pestana=biblioteca]'); await A.waitForTimeout(300);
  await A.click('#pantalla-biblioteca button[aria-label="Abrir Libro con cubierta"]');
  await A.waitForSelector('#visor iframe'); await A.waitForTimeout(1500);
  for (let i = 0; i < 6; i++) { await A.touchscreen.tap(375, 330); await A.waitForTimeout(500); }
  const finalVisible = await A.isVisible('#hoja-acciones');
  console.log('   hoja al final:', finalVisible, await A.textContent('#hoja-titulo'));
  if (finalVisible) await hoja(A, 'Marcar como terminado');
  await A.goBack(); await A.waitForTimeout(400);
  await esperarSinc(A); await A.waitForTimeout(300);
  const registro = await A.textContent('#lista-registro');
  ok(/Sincronización automática \(al cerrar un libro\)/.test(registro), 'al cerrar un libro se sincroniza solo');
  const sesionesDrive = drive.estado().sesiones;
  if (!finalVisible) { await accion(A, 'Libro con cubierta', 'Marcar como terminado'); await sinc(A); }
  ok(sesionesDrive.length === 1 && sesionesDrive[0].sesiones.length >= 1 && sesionesDrive[0].version === 1, `archivo de sesiones del iPhone en Drive (${sesionesDrive[0]?.sesiones.length} sesiones)`);

  // --- Tablet ---
  const B = await disp('Note Air 4C', 'tinta');
  const tb = await titulos(B);
  ok(tb.includes('Abecedario editado'), 'la tablet recibe el título editado');
  const portadaB = await B.evaluate(() => new Promise((r) => { const q = indexedDB.open('lector-epub'); q.onsuccess = () => { const t = q.result.transaction('libros').objectStore('libros').getAll(); t.onsuccess = () => { const l = t.result.find((x) => x.titulo === 'Abecedario editado'); const t2 = q.result.transaction('portadas').objectStore('portadas').get(l.id); t2.onsuccess = () => r(t2.result ? t2.result.size : 0); }; }; }));
  ok(portadaB > 0, `la tablet descarga la portada nueva (${portadaB} bytes)`);
  await B.click('#btn-colecciones'); await B.waitForTimeout(300);
  const opciones = await B.$$eval('#hoja-botones .fila-hoja', (l) => l.map((x) => x.textContent));
  ok(opciones.some((o) => /Clásicos \(1 libro\)/.test(o)) && opciones.some((o) => /Serie: Saga de prueba/.test(o)), `la tablet ve la colección y la serie: ${opciones.join(' | ')}`);
  await B.click('#hoja-cancelar'); await B.waitForTimeout(300);
  await B.click('.pestana[data-pestana=estadisticas]'); await B.waitForTimeout(500);
  const estB = await B.textContent('#contenido-estadisticas');
  ok(/1 de 20/.test(estB), 'la tablet ve el objetivo y el libro terminado en el iPhone');
  ok(/iPhone/.test(estB), 'la tablet ve el tiempo leído en el iPhone por dispositivo');

  // La tablet cambia la portada otra vez: el iPhone la vuelve a descargar
  await B.click('.pestana[data-pestana=biblioteca]'); await B.waitForTimeout(300);
  await accion(B, 'Abecedario editado', 'Editar información');
  const png2 = await B.evaluate(() => new Promise((r) => { const c = document.createElement('canvas'); c.width = 80; c.height = 120; const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(0, 0, 80, 120); x.fillStyle = '#fff'; x.fillRect(10, 10, 30, 30); c.toBlob((bl) => bl.arrayBuffer().then((ab) => r([...new Uint8Array(ab)])), 'image/png'); }));
  await B.setInputFiles('.campo-portada input[type=file]', { name: 'p.png', mimeType: 'image/png', buffer: Buffer.from(png2) });
  await B.waitForTimeout(400);
  await B.click('#hoja-botones .fila-hoja:has-text("Guardar")'); await B.waitForTimeout(500);
  const portadaAntes = drive.estado().biblioteca.libros.find((l) => l.titulo === 'Abecedario editado').portadaDriveId;
  await sinc(B);
  const portadaDespues = drive.estado().biblioteca.libros.find((l) => l.titulo === 'Abecedario editado').portadaDriveId;
  ok(portadaAntes !== portadaDespues && drive.archivos.get(portadaAntes).trashed && !drive.archivos.get(portadaDespues).trashed, 'portada nueva subida y la anterior en la papelera');
  const tamA = async () => A.evaluate(() => new Promise((r) => { const q = indexedDB.open('lector-epub'); q.onsuccess = () => { const t = q.result.transaction('libros').objectStore('libros').getAll(); t.onsuccess = () => { const l = t.result.find((x) => x.titulo === 'Abecedario editado'); const t2 = q.result.transaction('portadas').objectStore('portadas').get(l.id); t2.onsuccess = () => r(t2.result ? t2.result.size : 0); }; }; }));
  const antesA = await tamA();
  await sinc(A);
  const despuesA = await tamA();
  ok(despuesA > 0 && despuesA === drive.archivos.get(portadaDespues).contenido.length && antesA !== despuesA, `el iPhone descarga la portada cambiada (${antesA} -> ${despuesA} bytes)`);

  // --- Sesión caducada: indicador "!" ---
  await A.evaluate(async () => {
    const g = await import('/src/sync/google.js');
    await g.invalidarToken();
  });
  await A.waitForTimeout(300);
  const ind = await A.evaluate(() => { const b = document.getElementById('btn-sincronizar'); return [b.querySelector('.indicador').hidden, b.querySelector('.indicador').textContent, b.classList.contains('sesion-caducada')]; });
  ok(!ind[0] && ind[1] === '!' && ind[2], `indicador de sesión caducada: ${JSON.stringify(ind)}`);

  // --- Sincronización automática desactivada ---
  await A.click('#btn-ajustes'); await A.waitForTimeout(300);
  ok(await A.isChecked('#sincronizacion-automatica'), 'la sincronización automática está activada por defecto');
  await A.click('.fila-interruptor'); await A.waitForTimeout(200);
  ok(!(await A.isChecked('#sincronizacion-automatica')), 'se puede desactivar');
  await A.goBack(); await A.waitForTimeout(300);

  // --- Tiempo restante con un ritmo ya aprendido ---
  await A.evaluate(async () => {
    const a = await import('/src/datos/almacen.js');
    await a.guardarAjuste('ritmoLectura', { msPorPagina: 60000, ubicacionesPorPagina: 0.5, muestras: 20 });
  });
  await A.reload(); await A.waitForTimeout(1200);
  await A.click('.pestana[data-pestana=biblioteca]'); await A.waitForTimeout(300);
  await A.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]');
  await A.waitForSelector('#visor iframe'); await A.waitForTimeout(5000);
  const info = await A.textContent('#info-progreso');
  ok(/Capítulo: .* min/.test(info) && /Libro: .*(min|h)/.test(info), `tiempo restante: "${info}"`);
  await A.goBack(); await A.waitForTimeout(500);

  // --- ⋯ en Leyendo ahora ---
  await A.click('.pestana[data-pestana=inicio]'); await A.waitForTimeout(400);
  const botonesMas = await A.$$eval('#contenido-inicio .libro-mas', (l) => l.length);
  await A.click('#contenido-inicio .tarjeta-actual-caja .libro-mas'); await A.waitForTimeout(300);
  ok(botonesMas >= 2 && /Don Quijote/.test(await A.textContent('#hoja-titulo')), `botón ⋯ en Leyendo ahora (${botonesMas})`);
  await A.click('#hoja-cancelar');

  console.log('errores iPhone:', A.errores, '| tablet:', B.errores);
  await b.close();
})();
