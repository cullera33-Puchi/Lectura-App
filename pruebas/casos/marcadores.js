// Marcadores: añadir y quitar desde el lector, lista con salto, y
// sincronización entre los dos dispositivos (también las bajas).
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
  const controles = async (p) => { if (!(await p.isVisible('#btn-marcador'))) { await p.touchscreen.tap(195, 330); await p.waitForTimeout(400); } };
  const pulsado = (p) => p.getAttribute('#btn-marcador', 'aria-pressed');
  const abrirLista = async (p) => {
    await controles(p);
    await p.click('#btn-menu-lector'); await p.waitForTimeout(400);
    await p.click('#btn-marcadores'); await p.waitForTimeout(500);
  };

  const A = await disp('iPhone', 'movil');
  await A.setInputFiles('#archivo-epub', [`${S}/quijote.epub`]); await A.waitForTimeout(1500);
  await A.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]'); await A.waitForSelector('#visor iframe'); await A.waitForTimeout(1500);
  for (let i = 0; i < 3; i++) { await A.touchscreen.tap(375, 330); await A.waitForTimeout(600); }
  await controles(A);
  ok(await pulsado(A) === 'false', 'sin marcador, el botón está vacío');
  await A.click('#btn-marcador'); await A.waitForTimeout(500);
  ok(await pulsado(A) === 'true', 'al tocarlo, la página queda marcada');
  await A.touchscreen.tap(195, 330); await A.waitForTimeout(300);
  await A.touchscreen.tap(375, 330); await A.waitForTimeout(800);
  await controles(A);
  ok(await pulsado(A) === 'false', 'en la página siguiente no hay marcador');
  await A.touchscreen.tap(195, 330); await A.waitForTimeout(300);
  for (let i = 0; i < 3; i++) { await A.touchscreen.tap(375, 330); await A.waitForTimeout(600); }
  await abrirLista(A);
  const filas = await A.$$eval('#lista-marcadores li', (l) => l.map((x) => x.textContent));
  ok(filas.length === 1 && /Capítulo 1/.test(filas[0]) && /En un lugar/.test(filas[0]), `la lista muestra el marcador con capítulo y texto (${filas[0]?.slice(0, 60)})`);
  await A.click('#lista-marcadores li button'); await A.waitForTimeout(1500);
  await controles(A);
  ok(await pulsado(A) === 'true', 'tocar el marcador lleva a su página');
  await A.touchscreen.tap(195, 330); await A.waitForTimeout(300);
  await A.goBack(); await A.waitForTimeout(800);
  await sinc(A);
  const anot = drive.estado().anotaciones;
  const vivos = Object.values(anot?.anotaciones || {}).filter((x) => !x.eliminado);
  ok(anot?.version === 1 && vivos.length === 1 && vivos[0].tipo === 'marcador', 'anotaciones.json en Drive con versión y el marcador');

  const B = await disp('Note Air 4C', 'tinta');
  await B.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]');
  // Se descarga y, como el iPhone iba más adelante, pregunta si continuar allí.
  await B.waitForSelector('#hoja-acciones:not([hidden]), #visor iframe', { timeout: 20000 });
  if (await B.isVisible('#hoja-acciones')) await B.click('#hoja-botones button:has-text("Ir allí")');
  await B.waitForSelector('#visor iframe', { timeout: 15000 }); await B.waitForTimeout(1500);
  await abrirLista(B);
  ok((await B.$$('#lista-marcadores li')).length === 1, 'la tablet recibe el marcador');
  await B.click('#lista-marcadores .marcador-quitar'); await B.waitForTimeout(500);
  ok((await B.$$('#lista-marcadores li')).length === 0 && await B.isVisible('#marcadores-vacio'), 'se puede quitar desde la lista');
  await B.click('#btn-cerrar-marcadores'); await B.waitForTimeout(300);
  await B.goBack(); await B.waitForTimeout(800);
  await sinc(B);
  ok(Object.values(drive.estado().anotaciones.anotaciones).every((x) => x.eliminado), 'la baja llega a Drive');
  await sinc(A);
  const quedan = await A.evaluate(async () => (await import('/src/datos/anotaciones.js')).anotacionesDeLibro((await (await import('/src/datos/almacen.js')).leerTodos('libros'))[0].id, 'marcador'));
  ok(quedan.length === 0, 'y al iPhone');
  console.log('errores iPhone:', A.errores, '| tablet:', B.errores);
  await b.close();
})();
