// Mejora 18: un dispositivo con la hora atrasada. Tras recibir la posición del
// otro y seguir leyendo, su posición gana al sincronizar, y Diagnóstico avisa
// de la diferencia de hora con Google.
const { chromium, devices } = require('playwright');
const drive = require('../lib/drive-falso.js');
const { URL_APP, EPUBS: S, ok } = require('../lib/entorno.js');

const ATRASO_MS = 30 * 60000;

(async () => {
  const b = await chromium.launch();
  async function dispositivo(nombre, perfil, atraso = 0) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    if (atraso) await ctx.clock.install({ time: Date.now() - atraso });
    await drive.instalar(ctx);
    const p = await ctx.newPage();
    p.errores = [];
    p.on('pageerror', (e) => p.errores.push(e.message));
    await p.goto(URL_APP); await p.waitForTimeout(700);
    await p.click(`.opcion-grande[data-perfil=${perfil}]`); await p.waitForTimeout(200);
    await p.fill('#bienvenida-nombre', nombre);
    await p.click('#bienvenida-conectar');
    await p.waitForFunction(() => !document.getElementById('pantalla-inicio').hidden);
    await p.waitForFunction(() => /Todo al día|nuevo|subido|recibido/.test(document.getElementById('aviso').textContent), null, { timeout: 15000 });
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(400);
    return p;
  }
  async function sincronizar(p) {
    await p.click('#btn-sincronizar');
    await p.waitForFunction(() => !document.getElementById('btn-sincronizar').disabled && !/\.\.\.$/.test(document.getElementById('aviso').textContent), null, { timeout: 20000 });
  }
  async function irAlCapitulo(p, capitulo) {
    await p.touchscreen.tap(195, 330); await p.waitForTimeout(300);
    await p.click('#btn-menu-lector'); await p.waitForTimeout(400); await p.click('#btn-indice');
    await p.click(`#lista-indice button:has-text("${capitulo}")`); await p.waitForTimeout(1200);
  }
  const abrir = async (p) => {
    await p.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]');
    await p.waitForSelector('#visor iframe', { timeout: 15000 }); await p.waitForTimeout(1500);
  };

  // iPhone con la hora bien: lee hasta el capítulo 2 y sincroniza.
  const A = await dispositivo('iPhone', 'movil');
  await A.setInputFiles('#archivo-epub', [`${S}/quijote.epub`]); await A.waitForTimeout(1500);
  await abrir(A);
  await irAlCapitulo(A, 'Capítulo 2');
  await A.touchscreen.tap(370, 330); await A.waitForTimeout(800);
  await A.goBack(); await A.waitForTimeout(600);
  await sincronizar(A);
  const deA = Object.values(drive.estado().progreso.progreso)[0];
  ok(deA.dispositivo === 'iPhone', 'progreso.json con la posición del iPhone');

  // Tablet con la hora 30 min atrasada: acepta la posición del iPhone y sigue.
  const B = await dispositivo('Tablet', 'tinta', ATRASO_MS);
  await B.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]');
  await B.waitForSelector('#hoja-acciones:not([hidden])', { timeout: 15000 });
  await B.click('#hoja-botones button:has-text("Ir allí")');
  await B.waitForSelector('#visor iframe'); await B.waitForTimeout(1500);
  await irAlCapitulo(B, 'Capítulo 4');
  await B.touchscreen.tap(370, 330); await B.waitForTimeout(800);
  const local = await B.evaluate(async () => (await (await import('/src/datos/almacen.js')).leerTodos('progreso'))[0]);
  ok(local.fecha > deA.fecha, `la fecha de la tablet es posterior a la recibida (${local.fecha} frente a ${deA.fecha})`);
  await B.goBack(); await B.waitForTimeout(600);
  await sincronizar(B);
  const enDrive = Object.values(drive.estado().progreso.progreso)[0];
  ok(enDrive.dispositivo === 'Tablet' && enDrive.capitulo === 'Capítulo 4', `gana la posición de la tablet al sincronizar (${enDrive.dispositivo}, ${enDrive.capitulo})`);

  // El iPhone recibe la posición de la tablet.
  await sincronizar(A);
  await A.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]');
  await A.waitForSelector('#hoja-acciones:not([hidden])', { timeout: 15000 });
  ok(/Capítulo 4/.test(await A.textContent('#hoja-titulo')), 'el iPhone ofrece continuar en el capítulo 4 de la tablet');
  await A.click('#hoja-botones button:has-text("Quedarme aquí")'); await A.waitForTimeout(800);
  await A.goBack(); await A.waitForTimeout(500);

  // Diagnóstico de la tablet: hora atrasada.
  const diag = await B.evaluate(async () => (await import('/src/ui/diagnostico.js')).datosDiagnostico());
  const hora = diag.find(([k]) => k === 'Hora del dispositivo')[1];
  ok(/atrasada 30 min/.test(hora), `Diagnóstico de la tablet: ${hora}`);
  const diagA = await A.evaluate(async () => (await import('/src/ui/diagnostico.js')).datosDiagnostico());
  ok(/correcta/.test(diagA.find(([k]) => k === 'Hora del dispositivo')[1]), 'Diagnóstico del iPhone: hora correcta');

  // Quitar de Quiero leer en la tablet tras añadirlo en el iPhone: la baja gana.
  await A.evaluate(async () => {
    const q = await import('/src/datos/quiero-leer.js');
    const libros = await (await import('/src/datos/almacen.js')).leerTodos('libros');
    await q.alternarQuieroLeer(libros[0].id);
  });
  await sincronizar(A); await sincronizar(B);
  const enLista = await B.evaluate(async () => {
    const q = await import('/src/datos/quiero-leer.js');
    const libros = await (await import('/src/datos/almacen.js')).leerTodos('libros');
    const dentro = await q.estaEnQuieroLeer(libros[0].id);
    if (dentro) await q.alternarQuieroLeer(libros[0].id);
    return dentro;
  });
  await sincronizar(B); await sincronizar(A);
  const enA = await A.evaluate(async () => {
    const q = await import('/src/datos/quiero-leer.js');
    const libros = await (await import('/src/datos/almacen.js')).leerTodos('libros');
    return q.estaEnQuieroLeer(libros[0].id);
  });
  ok(enLista && !enA, 'Quiero leer: quitar en la tablet atrasada después de añadir en el iPhone llega al iPhone');
  console.log('errores', A.errores, B.errores);
  await b.close();
})();
