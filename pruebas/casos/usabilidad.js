// Mejoras de usabilidad 0.8.2: controles ocultos al pasar página, teclas de
// página, zonas de toque de 44 px, búsqueda vacía con filtro, previsión del
// objetivo anual y resumen de sincronización con marcadores recibidos.
const { chromium, devices } = require('playwright');
const drive = require('../lib/drive-falso.js');
const { URL_APP, EPUBS: S, ok } = require('../lib/entorno.js');

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
    await p.waitForFunction(() => /Todo al día|nuevo|subido/.test(document.getElementById('aviso').textContent), null, { timeout: 15000 });
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300);
    return p;
  }
  const esperar = (p) => p.waitForFunction(() => !document.getElementById('btn-sincronizar').disabled, null, { timeout: 20000 });
  const sinc = async (p) => { await esperar(p); await p.click('#btn-sincronizar'); await p.waitForTimeout(100); await esperar(p); await p.waitForTimeout(300); };
  // El elemento que recibe un toque en (x, y) es el indicado o está dentro de él.
  const recibe = (p, selector, dx, dy, borde) => p.evaluate(([sel, dx, dy, borde]) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    const x = borde === 'derecha' ? r.right + dx : r.left + r.width / 2 + dx;
    const y = borde === 'arriba' ? r.top + dy : r.top + r.height / 2 + dy;
    const tocado = document.elementFromPoint(x, y);
    return Boolean(tocado && (tocado === el || el.contains(tocado)));
  }, [selector, dx, dy, borde]);

  const A = await disp('iPhone', 'movil');
  await A.setInputFiles('#archivo-epub', [`${S}/quijote.epub`, `${S}/cubierta.epub`]); await A.waitForTimeout(2000);
  await sinc(A);

  // 15: búsqueda vacía por el filtro activo
  await A.click('.chip[data-filtro=terminado]'); await A.waitForTimeout(300);
  await A.click('#btn-buscar'); await A.fill('#buscar-biblioteca', 'Quijote'); await A.waitForTimeout(600);
  ok(/filtro "Terminados".*En toda la biblioteca hay 1 que coincide/.test(await A.textContent('#biblioteca-vacia')), `búsqueda vacía con filtro: "${await A.textContent('#biblioteca-vacia')}"`);
  await A.click('#btn-cerrar-busqueda'); await A.click('.chip[data-filtro=todos]'); await A.waitForTimeout(300);
  ok(await A.getAttribute('.chip[data-filtro=todos]', 'aria-pressed') === 'true', 'los filtros indican el activo con aria-pressed');

  // 14: zonas de toque (4 px por encima del filtro, que se ve de 32 px)
  ok(await recibe(A, '.chip[data-filtro=leyendo]', 0, -4, 'arriba'), 'el filtro responde por encima de su borde visible');

  // 10 y 11: lector
  await A.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]'); await A.waitForSelector('#visor iframe'); await A.waitForTimeout(1500);
  await A.touchscreen.tap(195, 330); await A.waitForTimeout(500);
  ok(await A.evaluate(() => document.getElementById('controles-lector').classList.contains('abierta')), 'tocar el centro muestra los controles');
  await A.touchscreen.tap(375, 330); await A.waitForTimeout(800);
  ok(!(await A.evaluate(() => document.getElementById('controles-lector').classList.contains('abierta'))), 'pasar página oculta los controles');
  const antes = await A.evaluate(() => document.getElementById('info-progreso').textContent);
  await A.keyboard.press('PageDown'); await A.waitForTimeout(900);
  await A.keyboard.press('Space'); await A.waitForTimeout(900);
  await A.touchscreen.tap(195, 330); await A.waitForTimeout(500);
  const despues = await A.evaluate(() => document.getElementById('info-progreso').textContent);
  ok(antes !== despues, `Avance de página y espacio pasan página ("${antes}" y "${despues}")`);
  await A.click('#btn-marcador'); await A.waitForTimeout(600);
  await A.click('#btn-marcadores').catch(async () => { await A.click('#btn-menu-lector'); await A.waitForTimeout(400); await A.click('#btn-marcadores'); });
  await A.waitForTimeout(600);
  ok(await recibe(A, '#btn-cerrar-marcadores', 5, 0, 'derecha'), 'el botón de cerrar responde fuera de su círculo de 30 px');
  await A.goBack(); await A.waitForTimeout(400);
  await A.goBack(); await A.waitForTimeout(800);

  // 16: previsión del objetivo anual sin libros terminados
  await A.click('.pestana[data-pestana=estadisticas]'); await A.waitForTimeout(500);
  await A.click('#contenido-estadisticas button:has-text("Fijar objetivo")'); await A.waitForTimeout(300);
  await A.fill('.campo-hoja', '12'); await A.click('#hoja-botones button:has-text("Guardar")'); await A.waitForTimeout(600);
  const objetivo = await A.textContent('#contenido-estadisticas');
  ok(/Te quedan 12 libros para cumplirlo/.test(objetivo) && !/terminarás unos 0/.test(objetivo), 'sin libros terminados no hay proyección vacía');

  // 13: resumen con marcadores recibidos
  await A.click('.pestana[data-pestana=biblioteca]'); await A.waitForTimeout(300);
  await sinc(A);
  const B = await disp('Note Air 4C', 'tinta');
  await sinc(B);
  const resumen = await B.evaluate(async () => {
    const m = await import('/src/sync/sincronizar.js');
    return m.textoResumen({ subidos: 0, nuevos: 0, bajas: 0, posiciones: 0, marcadores: 1, colecciones: true, objetivos: true, quieroLeer: false, sesiones: 3, avisos: [] });
  });
  ok(resumen === '1 marcador recibido, cambios en colecciones y objetivos, 3 sesiones de lectura recibidas.', `texto del resumen: "${resumen}"`);
  const marcadoresB = await B.evaluate(async () => Object.keys(await (await import('/src/datos/anotaciones.js')).todasLasAnotaciones()).length);
  ok(marcadoresB === 1, 'la tablet recibe el marcador');
  console.log('errores iPhone:', A.errores, '| tablet:', B.errores);
  await b.close();
})();
