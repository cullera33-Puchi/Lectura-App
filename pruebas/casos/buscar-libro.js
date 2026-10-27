// Búsqueda dentro del libro: sin distinguir mayúsculas ni tildes, resultados
// con capítulo y fragmento, salto al resultado con resaltado temporal.
const { chromium, devices } = require('playwright');
const { URL_APP, EPUBS: S, ok } = require('../lib/entorno.js');

(async () => {
  const b = await chromium.launch();
  for (const perfil of ['movil', 'tinta']) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const errores = []; p.on('pageerror', (e) => errores.push(e.message));
    await p.goto(URL_APP); await p.waitForTimeout(600);
    await p.click(`.opcion-grande[data-perfil=${perfil}]`); await p.click('#bienvenida-omitir'); await p.waitForTimeout(300);
    await p.setInputFiles('#archivo-epub', [`${S}/quijote.epub`]); await p.waitForTimeout(1500);
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300);
    await p.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]'); await p.waitForSelector('#visor iframe'); await p.waitForTimeout(1500);
    const abrirBuscar = async () => {
      await p.touchscreen.tap(195, 330); await p.waitForTimeout(400);
      await p.click('#btn-menu-lector'); await p.waitForTimeout(400);
      await p.click('#btn-buscar-libro'); await p.waitForTimeout(500);
    };
    const buscar = async (texto) => {
      await p.fill('#buscar-en-libro', texto);
      await p.press('#buscar-en-libro', 'Enter');
      await p.waitForFunction(() => !/Buscando/.test(document.getElementById('estado-busqueda').textContent), null, { timeout: 20000 });
      return p.textContent('#estado-busqueda');
    };
    await abrirBuscar();
    let estado = await buscar('ACORDÁRME');
    const n = await p.$$eval('#lista-busqueda li', (l) => l.length);
    ok(n > 10 && /resultados/.test(estado), `${perfil}: sin mayúsculas ni tildes, "ACORDÁRME" encuentra "acordarme" (${estado})`);
    const primero = await p.textContent('#lista-busqueda li .resultado-capitulo');
    ok(/Capítulo 1/.test(primero) && await p.textContent('#lista-busqueda li mark') === 'acordarme', `${perfil}: cada resultado lleva capítulo y la coincidencia marcada`);
    estado = await buscar('4.10.');
    ok(/1 resultado/.test(estado), `${perfil}: una frase concreta da un solo resultado (${estado})`);
    await p.click('#lista-busqueda li button'); await p.waitForTimeout(1800);
    await p.touchscreen.tap(195, 330); await p.waitForTimeout(400);
    ok(/Capítulo 4/.test(await p.textContent('#info-capitulo')), `${perfil}: tocar el resultado lleva a su página (${await p.textContent('#info-capitulo')})`);
    ok(await p.evaluate(() => Boolean(document.querySelector('#visor .resultado-busqueda'))), `${perfil}: la coincidencia queda resaltada`);
    await p.touchscreen.tap(195, 330); await p.waitForTimeout(300);
    await p.touchscreen.tap(375, 330); await p.waitForTimeout(1200);
    ok(await p.evaluate(() => !document.querySelector('#visor .resultado-busqueda')), `${perfil}: al pasar página se quita el resaltado`);
    await abrirBuscar();
    ok(await p.inputValue('#buscar-en-libro') === '4.10.', `${perfil}: al volver a abrir se conserva la última búsqueda`);
    estado = await buscar('zzzz');
    ok(/No se ha encontrado/.test(estado), `${perfil}: sin resultados, se avisa`);
    console.log('errores', errores);
    await ctx.close();
  }
  await b.close();
})();
