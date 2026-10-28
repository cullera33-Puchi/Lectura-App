// Casos de la revisión general: reimportar tras eliminar, no pisar posiciones, JSON dañado, archivos que faltan, doble toque y botón Atrás.
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
  const sinc = async (p) => {
    await p.click('#btn-sincronizar');
    await p.waitForFunction(() => !document.getElementById('btn-sincronizar').disabled, null, { timeout: 20000 });
    await p.waitForTimeout(200);
    return p.textContent('#aviso');
  };
  const idb = (p, store) => p.evaluate((store) => new Promise((r) => { const q = indexedDB.open('lector-epub'); q.onsuccess = () => { const t = q.result.transaction(store).objectStore(store).getAll(); t.onsuccess = () => r(t.result); }; }), store);
  const accion = async (p, titulo, texto) => {
    await p.click(`#pantalla-biblioteca button[aria-label="Acciones de ${titulo}"]`); await p.waitForTimeout(350);
    await p.click(`#hoja-botones button:has-text("${texto}")`); await p.waitForTimeout(400);
  };

  const A = await disp('iPhone', 'movil');
  await A.setInputFiles('#archivo-epub', [`${S}/quijote.epub`]); await A.waitForTimeout(1200);
  await sinc(A);

  // 1. Eliminar y volver a importar antes de sincronizar
  await accion(A, 'Don Quijote de prueba', 'Eliminar de la biblioteca');
  await A.click('#hoja-botones button:has-text("Eliminar")'); await A.waitForTimeout(500);
  await A.setInputFiles('#archivo-epub', [`${S}/quijote.epub`]); await A.waitForTimeout(1200);
  await sinc(A);
  const vivos = [...drive.archivos.values()].filter((a) => !a.trashed && a.name.endsWith('.epub')).length;
  const bib = drive.estado().biblioteca.libros.find((l) => l.titulo.startsWith('Don'));
  ok(vivos === 1 && !bib.eliminado && drive.archivos.get(bib.archivoDriveId) && !drive.archivos.get(bib.archivoDriveId).trashed, 'reimportar tras eliminar no manda el archivo a la papelera');

  // Tablet lee hasta capítulo 4
  const B = await disp('Note Air 4C', 'tinta');
  await B.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]');
  await B.waitForSelector('#visor iframe', { timeout: 15000 }); await B.waitForTimeout(1200);
  await B.touchscreen.tap(195, 330); await B.waitForTimeout(300);
  await B.click('#btn-menu-lector'); await B.waitForTimeout(300); await B.click('#btn-indice'); await B.waitForTimeout(300);
  await B.click('#lista-indice button:has-text("Capítulo 4")'); await B.waitForTimeout(1000);
  await B.touchscreen.tap(375, 330); await B.waitForTimeout(800);
  await B.goBack(); await B.waitForTimeout(600);
  await sinc(B);
  const cfiTablet = drive.estado().progreso.progreso[bib.id].cfi;

  // 2. iPhone sin sincronizar abre el libro y lo cierra sin pasar página
  // Se espera a que se generen las ubicaciones (el porcentaje): antes de 0.8.5
  // eso le ponía fecha a la posición provisional y pisaba la de la tablet.
  await A.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]');
  await A.waitForSelector('#visor iframe');
  await A.waitForFunction(() => !document.getElementById('barra-libro').disabled, null, { timeout: 20000 }).catch(() => {});
  await A.waitForTimeout(800);
  await A.goBack(); await A.waitForTimeout(600);
  await sinc(A);
  ok(drive.estado().progreso.progreso[bib.id].cfi === cfiTablet, 'abrir sin pasar página no pisa la posición del otro dispositivo');

  // 3. Marcar terminado y no terminado conserva la posición más reciente
  await accion(A, 'Don Quijote de prueba', 'Marcar como terminado');
  await accion(A, 'Don Quijote de prueba', 'Marcar como no terminado');
  await sinc(A);
  ok(drive.estado().progreso.progreso[bib.id].cfi === cfiTablet, 'marcar terminado y no terminado conserva el CFI del otro dispositivo');

  // 4. JSON dañado
  drive.danar('biblioteca.json');
  const avisoDanado = await sinc(A);
  const nombres = [...drive.archivos.values()].filter((a) => !a.trashed).map((a) => a.name);
  ok(/dañado/.test(avisoDanado) && nombres.some((n) => /biblioteca\.danado-/.test(n)) && drive.estado().biblioteca?.libros?.length === 1, 'biblioteca.json dañado se aparta y se rehace');

  // 5. Archivo borrado en Drive: el dispositivo que lo tiene lo vuelve a subir
  drive.aPapelera(`${bib.id}.epub`);
  await sinc(A);
  const bib2 = drive.estado().biblioteca.libros.find((l) => l.id === bib.id);
  ok(bib2.archivoDriveId && !drive.archivos.get(bib2.archivoDriveId).trashed, 'un archivo que falta en Drive se vuelve a subir');

  // 6. No resucitar un libro eliminado en el otro dispositivo
  await B.setInputFiles('#archivo-epub', [`${S}/abecedario.epub`]); await B.waitForTimeout(1000);
  await sinc(B);
  await A.setInputFiles('#archivo-epub', [`${S}/abecedario.epub`]); await A.waitForTimeout(1000); // A lo importa sin conocerlo
  await accion(B, 'Abecedario sin portada', 'Eliminar de la biblioteca');
  await B.click('#hoja-botones button:has-text("Eliminar")'); await B.waitForTimeout(400);
  await B.waitForTimeout(50);
  await sinc(B);
  // A importó antes de la baja de B: la baja (más reciente) debe ganar
  await sinc(A);
  const abc = drive.estado().biblioteca.libros.find((l) => l.titulo.startsWith('Abecedario'));
  ok(abc.eliminado, 'un libro importado antes de que el otro lo eliminara no resucita');

  // 7. Doble toque al abrir y cerrar mientras se abre
  const histAntes = await A.evaluate(() => history.length);
  await A.evaluate(() => { const b = document.querySelector('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]'); b.click(); b.click(); });
  await A.waitForTimeout(800);
  console.log('   hoja visible tras doble toque:', await A.isVisible('#hoja-acciones'), await A.textContent('#hoja-titulo'));
  if (await A.isVisible('#hoja-acciones')) await A.click('#hoja-botones button:has-text("Ir allí")');
  await A.waitForTimeout(1500);
  const vistas = await A.evaluate(() => document.querySelectorAll('#visor .epub-container').length);
  console.log('   vistas', vistas, 'historial', await A.evaluate(() => history.length), histAntes);
  ok(vistas === 1, 'doble toque en la portada abre el libro una sola vez');
  await A.goBack(); await A.waitForTimeout(600);
  await A.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]');
  await A.goBack(); await A.waitForTimeout(2000);
  ok(await A.evaluate(() => document.getElementById('lector').hidden && !document.querySelector('#visor iframe')), 'cerrar mientras se abre no deja el lector abierto');

  // 8. Toques rápidos derecha-izquierda: sin saltos espurios
  await A.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]');
  await A.waitForSelector('#visor iframe'); await A.waitForTimeout(1500);
  const pos0 = await A.evaluate(() => document.querySelector('#visor .epub-container').scrollLeft);
  await A.touchscreen.tap(375, 330); await A.waitForTimeout(120); await A.touchscreen.tap(15, 330);
  await A.waitForTimeout(1500);
  const pos1 = await A.evaluate(() => document.querySelector('#visor .epub-container').scrollLeft);
  console.log('   posiciones', pos0, pos1, (await A.textContent('#lista-registro')).slice(0, 300));
  const registro = await A.textContent('#lista-registro');
  ok(pos0 === pos1 && !/respaldo/.test(registro), 'tocar derecha e izquierda rápido vuelve a la misma página sin saltos');
  // 9. Atrás con un panel abierto cierra solo el panel
  await A.touchscreen.tap(195, 330); await A.waitForTimeout(400);
  await A.click('#btn-menu-lector'); await A.waitForTimeout(400);
  await A.goBack(); await A.waitForTimeout(500);
  ok(await A.evaluate(() => !document.getElementById('lector').hidden && document.getElementById('panel-menu').hidden), 'Atrás con el menú abierto cierra el menú y no el libro');
  await A.goBack(); await A.waitForTimeout(600);
  ok(await A.isHidden('#lector'), 'el siguiente Atrás cierra el libro');

  console.log('errores iPhone:', A.errores, '| tablet:', B.errores);
  await b.close();
})();
