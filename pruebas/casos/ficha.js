// Ficha del libro y resumen del año en los dos perfiles.
const { chromium, devices } = require('playwright');
const drive = require('../lib/drive-falso.js');
const { URL_APP, EPUBS: S, SALIDA, ok } = require('../lib/entorno.js');
(async () => {
  const b = await chromium.launch();
  for (const perfil of ['movil', 'tinta']) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    await drive.instalar(ctx);
    const p = await ctx.newPage();
    const errores = []; p.on('pageerror', (e) => errores.push(e.message));
    await p.goto(URL_APP); await p.waitForTimeout(600);
    await p.click(`.opcion-grande[data-perfil=${perfil}]`); await p.click('#bienvenida-omitir'); await p.waitForTimeout(300);
    await p.setInputFiles('#archivo-epub', [`${S}/quijote.epub`, `${S}/cubierta.epub`]); await p.waitForTimeout(1800);
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300);
    await p.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]'); await p.waitForSelector('#visor iframe'); await p.waitForTimeout(1500);
    for (let i = 0; i < 4; i++) { await p.touchscreen.tap(375, 330); await p.waitForTimeout(600); }
    await p.goBack(); await p.waitForTimeout(600);
    // Sesiones simuladas de este año, otro dispositivo y un año anterior
    await p.evaluate(async () => {
      const a = await import('/src/datos/almacen.js');
      const pr = await import('/src/datos/pendientes.js');
      const libros = await a.leerTodos('libros');
      const q = libros.find((l) => l.titulo.startsWith('Don')).id;
      const s = (dia, h, min) => ({ id: `x:${dia}${h}`, libroId: q, inicio: `${dia}T${h}:00:00`, fin: new Date(Date.parse(`${dia}T${h}:00:00`) + min * 60000).toISOString(), paginas: Math.round(min / 2) });
      await pr.guardarSincronizacion('sesionesRemotas', { otro: { dispositivo: 'Note Air 4C', sesiones: [s('2026-10-04', '22', 90), s('2026-10-05', '22', 45), s('2026-03-07', '10', 30), s('2025-06-01', '18', 60)] } });
      const progreso = await import('/src/datos/progreso.js');
      await progreso.cambiarEstado(libros.find((l) => l.titulo.startsWith('Libro')).id, 'terminado');
    });
    await p.click('#pantalla-biblioteca button[aria-label="Acciones de Don Quijote de prueba"]'); await p.waitForTimeout(300);
    await p.click('#hoja-botones button:has-text("Ficha del libro")'); await p.waitForTimeout(900);
    const ficha = await p.textContent('#ficha-contenido');
    await p.screenshot({ path: `${SALIDA}/ficha-${perfil}.png`, fullPage: false });
    ok(await p.isVisible('#panel-ficha') && /Tu lectura/.test(ficha) && /Tiempo de lectura\s*3 h 45 min/.test(ficha) && /Sesiones\s*5/.test(ficha), `${perfil}: ficha con el tiempo del libro en los dos dispositivos y todos los años`);
    ok(/Datos del libro/.test(ficha) && /En la biblioteca desde/.test(ficha), `${perfil}: ficha con datos del libro`);
    console.log('   ficha:', ficha.replace(/\s+/g, ' ').slice(0, 400));
    // Atrás cierra la ficha
    await p.evaluate(() => { history.pushState({ pantalla: 'x' }, ''); }); await p.goBack(); await p.waitForTimeout(500);
    ok(!(await p.isVisible('#panel-ficha')), `${perfil}: Atrás cierra la ficha`);
    // Resumen del año
    await p.click('.pestana[data-pestana=estadisticas]'); await p.waitForTimeout(600);
    await p.click('#contenido-estadisticas button:has-text("Resumen de 2026")'); await p.waitForTimeout(800);
    const resumen = await p.textContent('#ficha-contenido');
    await p.screenshot({ path: `${SALIDA}/resumen-${perfil}.png`, fullPage: false });
    ok(/octubre/.test(resumen) && /por la noche/.test(resumen) && /Libro con cubierta/.test(resumen) && /Note Air 4C/.test(resumen), `${perfil}: resumen del año con mes, franja, terminados y dispositivos`);
    console.log('   resumen:', resumen.replace(/\s+/g, ' ').slice(0, 500));
    await p.click('#btn-cerrar-ficha'); await p.waitForTimeout(500);
    await p.click('#contenido-estadisticas button[aria-label="Resumen de 2025"]'); await p.waitForTimeout(800);
    ok(/En 2025 has leído 1 h/.test(await p.textContent('#ficha-contenido')), `${perfil}: resumen de un año anterior`);
    await p.click('#btn-cerrar-ficha'); await p.waitForTimeout(400);
    console.log('   errores', errores);
    await ctx.close();
  }
  await b.close();
})();
