// Mejora 5: filtrar, buscar u ordenar la biblioteca reutiliza las filas ya
// pintadas; una fila se rehace solo si cambian sus datos. Mide la búsqueda
// con 300 libros.
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
    await p.setInputFiles('#archivo-epub', [`${S}/quijote.epub`, `${S}/cubierta.epub`]); await p.waitForTimeout(1800);
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(400);
    const marcar = () => p.$$eval('#lista-libros .libro', (ls) => ls.forEach((l, i) => { l.marca = `fila${i}`; }));
    const marcas = () => p.$$eval('#lista-libros .libro', (ls) => ls.map((l) => `${l.querySelector('.libro-titulo').textContent}=${l.marca || 'nueva'}`));
    await marcar();
    const inicial = await marcas();

    await p.click('.chip[data-filtro=pendiente]'); await p.waitForTimeout(300);
    await p.click('.chip[data-filtro=todos]'); await p.waitForTimeout(300);
    ok(JSON.stringify(await marcas()) === JSON.stringify(inicial), `${perfil}: cambiar de filtro reutiliza las filas (${(await marcas()).join(', ')})`);

    await p.click('#btn-buscar'); await p.fill('#buscar-biblioteca', 'quij'); await p.waitForTimeout(500);
    const buscando = await marcas();
    await p.fill('#buscar-biblioteca', ''); await p.waitForTimeout(500);
    ok(buscando.length === 1 && /Quijote/.test(buscando[0]) && !/nueva/.test(buscando[0]) && JSON.stringify(await marcas()) === JSON.stringify(inicial),
      `${perfil}: buscar y borrar la búsqueda reutiliza las filas`);
    await p.click('#btn-cerrar-busqueda'); await p.waitForTimeout(300);

    await p.click('#btn-ordenar'); await p.click('#hoja-botones button:has-text("Título")'); await p.waitForTimeout(400);
    const ordenadas = await marcas();
    ok(ordenadas.every((m) => !/nueva/.test(m)) && ordenadas[0].startsWith('Don Quijote'), `${perfil}: ordenar por título mueve las mismas filas (${ordenadas.join(', ')})`);

    // Un cambio en un libro rehace solo su fila.
    await p.click('#pantalla-biblioteca button[aria-label="Acciones de Libro con cubierta"]'); await p.waitForTimeout(300);
    await p.click('#hoja-botones button:has-text("Marcar como terminado")'); await p.waitForTimeout(800);
    if (await p.isVisible('#hoja-acciones')) { await p.goBack(); await p.waitForTimeout(400); } // propuesta de valorar
    const tras = await marcas();
    const estado = await p.textContent('#pantalla-biblioteca article.libro:has-text("Libro con cubierta") .libro-estado');
    ok(tras.some((m) => m === 'Libro con cubierta=nueva') && tras.some((m) => /Quijote.*=fila/.test(m)) && /Terminado/.test(estado),
      `${perfil}: al terminar un libro se rehace solo su fila (${tras.join(', ')}; "${estado}")`);

    // 300 libros: tiempo de una búsqueda y de volver a la lista completa.
    await p.evaluate(async () => {
      const a = await import('/src/datos/almacen.js');
      const ahora = new Date().toISOString();
      const ops = Array.from({ length: 300 }, (_, i) => ({ almacen: 'libros', valor: { id: `falso-${i}`, titulo: `Libro de relleno ${i}`, autor: `Autora ${i % 17}`, fechaAlta: ahora, fechaModificacion: ahora, eliminado: false, archivoDriveId: `d${i}` } }));
      await a.escribirVarios(ops);
    });
    await p.click('.pestana[data-pestana=inicio]'); await p.waitForTimeout(300);
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(1500);
    const medir = (texto) => p.evaluate(async (t) => {
      const campo = document.getElementById('buscar-biblioteca');
      const bib = await import('/src/biblioteca/biblioteca.js');
      campo.value = t;
      const inicio = performance.now();
      campo.dispatchEvent(new Event('input'));
      await new Promise((r) => setTimeout(r, 210)); // espera de la búsqueda
      await bib.pintarBiblioteca(); // misma pintura que la búsqueda
      return Math.round(performance.now() - inicio - 210);
    }, texto);
    await p.click('#btn-buscar');
    await medir('');
    const n = await p.$$eval('#lista-libros .libro', (ls) => ls.length);
    const tBuscar = await medir('relleno 1');
    const tTodos = await medir('');
    console.log(`${perfil}: ${n} libros. Buscar: ${tBuscar} ms. Volver a todos: ${tTodos} ms`);
    ok(n === 302 && tTodos < 400, `${perfil}: con ${n} libros, volver a la lista completa tarda ${tTodos} ms`);
    console.log(perfil, 'errores', errores);
    await ctx.close();
  }
  await b.close();
})();
