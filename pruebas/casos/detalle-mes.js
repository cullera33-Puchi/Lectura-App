// Detalle de un mes en Estadísticas (mejora 21): al tocar la barra de un mes
// se abre una hoja con los libros, sus tiempos y los terminados, sumando los
// dos dispositivos. Cada libro abre su ficha.
const { chromium, devices } = require('playwright');
const { URL_APP, EPUBS: S, SALIDA, ok } = require('../lib/entorno.js');

(async () => {
  const b = await chromium.launch();
  for (const perfil of ['movil', 'tinta']) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const errores = []; p.on('pageerror', (e) => errores.push(e.message));
    await p.goto(URL_APP); await p.waitForTimeout(600);
    await p.click(`.opcion-grande[data-perfil=${perfil}]`); await p.click('#bienvenida-omitir'); await p.waitForTimeout(300);
    await p.setInputFiles('#archivo-epub', [`${S}/quijote.epub`, `${S}/cubierta.epub`]); await p.waitForTimeout(1800);
    // Este mes: 50 min del Quijote (30 en este dispositivo y 20 en la tablet)
    // y 15 min de "Libro con cubierta", que se termina este mes.
    const mes = await p.evaluate(async () => {
      const a = await import('/src/datos/almacen.js');
      const pr = await import('/src/datos/pendientes.js');
      const progreso = await import('/src/datos/progreso.js');
      const libros = await a.leerTodos('libros');
      const q = libros.find((l) => l.titulo.startsWith('Don')).id;
      const c = libros.find((l) => l.titulo.startsWith('Libro')).id;
      const ahora = new Date();
      const dia = (n, h) => new Date(ahora.getFullYear(), ahora.getMonth(), n, h).toISOString();
      const s = (libroId, n, min, paginas) => ({ libroId, inicio: dia(n, 10), fin: new Date(Date.parse(dia(n, 10)) + min * 60000).toISOString(), paginas });
      await a.guardar('sesiones', { ...s(q, 1, 30, 12), dispositivo: 'iPhone' });
      await pr.guardarSincronizacion('sesionesRemotas', { otro: { dispositivo: 'Tablet de prueba', sesiones: [{ ...s(q, 1, 20, 8), id: 'x:1' }, { ...s(c, 1, 15, 6), id: 'x:2' }] } });
      await progreso.cambiarEstado(c, 'terminado');
      return ahora.getMonth();
    });
    await p.click('.pestana[data-pestana=estadisticas]'); await p.waitForTimeout(700);
    // Gráfico "Tiempo de lectura por mes": la barra del mes actual.
    await p.click(`#contenido-estadisticas .grafico >> nth=1 >> .barra >> nth=${mes}`); await p.waitForTimeout(900);
    const texto = (await p.textContent('#ficha-contenido')).replace(/\s+/g, ' ');
    const titulo = await p.textContent('#ficha-titulo');
    ok(await p.isVisible('#panel-ficha') && / de \d{4}$/.test(titulo), `${perfil}: tocar el mes abre su detalle ("${titulo}")`);
    ok(/1 h 5 min ?de lectura/.test(texto) && /1 ?libro terminado/.test(texto), `${perfil}: totales del mes con los dos dispositivos`);
    const filas = await p.$$eval('#ficha-contenido .fila-libro-mes .t-titulo', (l) => l.map((x) => x.textContent));
    ok(filas.join('|') === 'Don Quijote de prueba|Libro con cubierta', `${perfil}: libros por tiempo: ${filas.join(', ')}`);
    ok(/50 min, 20 páginas/.test(texto) && /Terminado el/.test(texto), `${perfil}: tiempo y páginas de cada libro y fecha de fin`);
    ok(/Por dispositivo/.test(texto), `${perfil}: reparto por dispositivo`);
    if (perfil === 'movil') await p.screenshot({ path: `${SALIDA}/detalle-mes.png` });
    await p.click('#ficha-contenido .fila-libro-mes >> nth=0'); await p.waitForTimeout(1000);
    ok(/Tu lectura/.test(await p.textContent('#ficha-contenido')), `${perfil}: un libro abre su ficha`);
    await p.click('#btn-cerrar-ficha'); await p.waitForTimeout(500);
    // Un mes sin lectura
    const otro = mes === 0 ? 1 : 0;
    if (otro < mes) {
      await p.click(`#contenido-estadisticas .grafico >> nth=1 >> .barra >> nth=${otro}`); await p.waitForTimeout(800);
      ok(/No hay lecturas registradas/.test(await p.textContent('#ficha-contenido')), `${perfil}: un mes vacío lo dice`);
      await p.click('#btn-cerrar-ficha'); await p.waitForTimeout(400);
    }
    console.log(perfil, 'errores', errores);
    await ctx.close();
  }
  await b.close();
})();
