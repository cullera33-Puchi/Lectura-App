// Mejora 31: prueba guiada en Diagnóstico. Explica cada prueba, recoge las
// teclas que llegan (botones físicos), guarda lo que se elige y lo incluye en
// el diagnóstico.
const { chromium, devices } = require('playwright');
const { URL_APP, SALIDA, ok } = require('../lib/entorno.js');

(async () => {
  const b = await chromium.launch();
  for (const perfil of ['movil', 'tinta']) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const errores = []; p.on('pageerror', (e) => errores.push(e.message));
    await p.goto(URL_APP); await p.waitForTimeout(600);
    await p.click(`.opcion-grande[data-perfil=${perfil}]`); await p.click('#bienvenida-omitir'); await p.waitForTimeout(300);
    await p.locator('.boton-ajustes:visible').first().click(); await p.waitForTimeout(600);
    await p.click('#btn-prueba-guiada'); await p.waitForTimeout(600);
    const texto = () => p.textContent('#ficha-contenido');
    ok(await p.isVisible('#panel-ficha') && /Botones físicos/.test(await texto()) && /Restos de páginas/.test(await texto()), `${perfil}: se abre la prueba guiada con sus pruebas`);
    // Botones físicos: llegan teclas.
    await p.keyboard.press('PageDown'); await p.keyboard.press('AudioVolumeDown'); await p.waitForTimeout(400);
    ok(/Recibidas: PageDown, AudioVolumeDown/.test(await texto()) && /aún no las usa/.test(await texto()), `${perfil}: muestra las teclas recibidas`);
    await p.click('#ficha-contenido [data-prueba=restos] button:has-text("Quedan restos")'); await p.waitForTimeout(400);
    ok(await p.getAttribute('#ficha-contenido [data-prueba=restos] button:has-text("Quedan restos")', 'aria-pressed') === 'true', `${perfil}: marca la respuesta elegida`);
    if (perfil === 'movil') await p.screenshot({ path: `${SALIDA}/prueba-guiada.png` });
    await p.click('#btn-cerrar-ficha'); await p.waitForTimeout(400);
    const diag = await p.evaluate(async () => (await import('/src/ui/diagnostico.js')).datosDiagnostico());
    const fila = diag.find(([k]) => k === 'Prueba guiada')[1];
    ok(/Botones físicos: PageDown, AudioVolumeDown/.test(fila) && /Restos de páginas anteriores: Quedan restos/.test(fila), `${perfil}: el diagnóstico incluye el resultado (${fila})`);
    // Al reabrir, se conserva lo elegido.
    await p.click('#btn-prueba-guiada'); await p.waitForTimeout(500);
    ok(await p.getAttribute('#ficha-contenido [data-prueba=restos] button:has-text("Quedan restos")', 'aria-pressed') === 'true', `${perfil}: al reabrir conserva las respuestas`);
    console.log(perfil, 'errores', errores);
    await ctx.close();
  }
  await b.close();
})();
