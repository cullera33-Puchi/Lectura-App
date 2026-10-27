// Valoración y nota personal: estrellas y nota en la ficha, propuesta de
// valorar al terminar, sincronización con el otro dispositivo y resumen del año.
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
  const ficha = async (p, titulo) => {
    await p.click(`#pantalla-biblioteca button[aria-label="Acciones de ${titulo}"]`); await p.waitForTimeout(350);
    await p.click('#hoja-botones button:has-text("Ficha del libro")'); await p.waitForTimeout(900);
  };

  const A = await disp('iPhone', 'movil');
  await A.setInputFiles('#archivo-epub', [`${S}/cubierta.epub`, `${S}/sinopsis.epub`]); await A.waitForTimeout(1800);
  // Al llegar al final se propone terminar y después valorar.
  await A.click('#pantalla-biblioteca button[aria-label="Abrir Libro con cubierta"]'); await A.waitForSelector('#visor iframe'); await A.waitForTimeout(1500);
  let n = 0;
  while (!(await A.isVisible('#hoja-acciones')) && n < 70) { await A.touchscreen.tap(375, 330); await A.waitForTimeout(400); n += 1; }
  await A.click('#hoja-botones button:has-text("Marcar como terminado")'); await A.waitForTimeout(700);
  ok(/Qué te ha parecido/.test(await A.textContent('#hoja-titulo')), 'al terminar, propone valorar el libro');
  await A.click('#hoja-botones button:has-text("★★★★☆")'); await A.waitForTimeout(600);
  await A.goBack(); await A.waitForTimeout(800);
  await ficha(A, 'Libro con cubierta');
  ok(await A.$$eval('#ficha-contenido .estrella[aria-pressed="true"]', (e) => e.length) === 4 && /Me ha gustado/.test(await A.textContent('.estrellas-texto')), 'la ficha muestra 4 estrellas');
  await A.click('#ficha-contenido .nota-personal'); await A.waitForTimeout(500);
  await A.fill('.campo-nota', 'Muy recomendable para el verano.');
  await A.click('#hoja-botones .fila-hoja:has-text("Guardar")'); await A.waitForTimeout(600);
  ok(/Muy recomendable para el verano/.test(await A.textContent('#ficha-contenido .nota-personal')), 'se guarda la nota personal');
  await A.click('#btn-cerrar-ficha'); await A.waitForTimeout(400);
  // Otro libro: valorar desde la ficha y quitar la valoración tocando la misma estrella
  await ficha(A, 'Libro con sinopsis');
  await A.click('#ficha-contenido .estrella >> nth=1'); await A.waitForTimeout(400);
  ok(await A.$$eval('#ficha-contenido .estrella[aria-pressed="true"]', (e) => e.length) === 2, 'se puede valorar desde la ficha');
  await A.click('#ficha-contenido .estrella >> nth=1'); await A.waitForTimeout(400);
  ok(await A.$$eval('#ficha-contenido .estrella[aria-pressed="true"]', (e) => e.length) === 0, 'tocar la misma estrella quita la valoración');
  await A.click('#btn-cerrar-ficha'); await A.waitForTimeout(400);
  await sinc(A);
  const enDrive = drive.estado().biblioteca.libros.find((l) => l.titulo === 'Libro con cubierta').valoracion;
  ok(enDrive?.estrellas === 4 && /verano/.test(enDrive.nota), 'la valoración viaja en biblioteca.json');

  const B = await disp('Note Air 4C', 'tinta');
  await ficha(B, 'Libro con cubierta');
  ok(await B.$$eval('#ficha-contenido .estrella[aria-pressed="true"]', (e) => e.length) === 4 && /verano/.test(await B.textContent('#ficha-contenido')), 'la tablet ve las estrellas y la nota');
  await B.click('#btn-cerrar-ficha'); await B.waitForTimeout(300);
  await B.click('.pestana[data-pestana=estadisticas]'); await B.waitForTimeout(600);
  await B.click('#contenido-estadisticas button:has-text("Resumen de")'); await B.waitForTimeout(900);
  ok(/★★★★/.test(await B.textContent('#ficha-contenido .lista-terminados')), 'el resumen del año muestra las estrellas');
  console.log('errores iPhone:', A.errores, '| tablet:', B.errores);
  await b.close();
})();
