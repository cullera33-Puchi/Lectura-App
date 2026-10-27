// Previsión de fin en la ficha: con el tiempo dedicado al libro, el porcentaje
// leído y la media diaria de los últimos 14 días. No aparece en un libro sin
// datos suficientes ni en uno terminado.
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
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300);
    await p.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]'); await p.waitForSelector('#visor iframe'); await p.waitForTimeout(1500);
    for (let i = 0; i < 2; i++) { await p.touchscreen.tap(375, 330); await p.waitForTimeout(600); }
    await p.goBack(); await p.waitForTimeout(600);
    const ficha = async (titulo) => {
      await p.click(`#pantalla-biblioteca button[aria-label="Acciones de ${titulo}"]`); await p.waitForTimeout(300);
      await p.click('#hoja-botones button:has-text("Ficha del libro")'); await p.waitForTimeout(900);
      const texto = (await p.textContent('#ficha-contenido')).replace(/\s+/g, ' ');
      return texto;
    };
    const cerrar = async () => { await p.click('#btn-cerrar-ficha'); await p.waitForTimeout(500); };

    ok(!/Fin previsto/.test(await ficha('Don Quijote de prueba')), `${perfil}: sin datos suficientes no hay previsión`);
    await cerrar();

    // 2 h en el libro en los últimos días (desde la tablet) y el 40 % leído:
    // quedan unas 3 h. Con 30 min más en otro libro, la media de los últimos
    // 14 días es de 150 min / 14, así que faltan unos 17 días.
    await p.evaluate(async () => {
      const a = await import('/src/datos/almacen.js');
      const pr = await import('/src/datos/pendientes.js');
      const progreso = await import('/src/datos/progreso.js');
      const libros = await a.leerTodos('libros');
      const q = libros.find((l) => l.titulo.startsWith('Don')).id;
      const hace = (dias) => new Date(Date.now() - dias * 86400000);
      const s = (dias, min) => ({ id: `x:${dias}`, libroId: q, inicio: hace(dias).toISOString(), fin: new Date(hace(dias).getTime() + min * 60000).toISOString(), paginas: 10 });
      await pr.guardarSincronizacion('sesionesRemotas', { otro: { dispositivo: 'Note Air 4C', sesiones: [s(2, 60), s(5, 40), s(9, 20), { ...s(3, 30), id: 'x:otro', libroId: 'otro-libro' }] } });
      const actual = await progreso.leerProgreso(q);
      await progreso.guardarProgreso(q, { ...actual, porcentaje: 0.4, estado: 'leyendo' });
      await progreso.cambiarEstado(libros.find((l) => l.titulo.startsWith('Libro')).id, 'terminado');
    });
    await p.reload(); await p.waitForTimeout(1200); // la biblioteca se pinta con el nuevo avance
    if (await p.isVisible('#hoja-acciones')) { await p.click('#hoja-cancelar'); await p.waitForTimeout(500); } // propuesta al entrar
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(400);
    const texto = await ficha('Don Quijote de prueba');
    const fecha = new Date(Date.now() + 17 * 86400000).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
    ok(new RegExp(`Fin previsto ?Hacia el ${fecha}`).test(texto) && /alrededor de 3 h de lectura/.test(texto),
      `${perfil}: previsión "${(texto.match(/Fin previsto[^)]*\)/) || ['ninguna'])[0]}" (esperado hacia el ${fecha})`);
    if (perfil === 'movil') await p.screenshot({ path: `${process.env.SALIDA || '/tmp'}/fin-previsto.png` });
    await cerrar();
    ok(!/Fin previsto/.test(await ficha('Libro con cubierta')), `${perfil}: un libro terminado no tiene previsión`);
    await cerrar();
    console.log('errores', errores);
    await ctx.close();
  }
  await b.close();
})();
