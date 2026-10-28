// Tercer dispositivo: el ordenador. Nombre propuesto "Ordenador", EPUB
// arrastrados a la ventana, paso de página con la rueda del ratón (una
// página por gesto, también con la inercia del panel táctil) y líneas de
// longitud cómoda en monitores muy anchos.
const { chromium } = require('playwright');
const { URL_APP, ok } = require('../lib/entorno.js');

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errores = []; p.on('pageerror', (e) => errores.push(e.message));
  await p.goto(URL_APP); await p.waitForTimeout(700);
  const opciones = await p.$$eval('#bienvenida-paso1 .opcion-grande strong', (l) => l.map((x) => x.textContent));
  ok(opciones.join('|') === 'Móvil|Tinta electrónica|Ordenador', `la bienvenida ofrece ${opciones.join(', ')}`);
  await p.click('.opcion-grande[data-tipo=ordenador]'); await p.waitForTimeout(300);
  ok(await p.inputValue('#bienvenida-nombre') === 'Ordenador', `nombre propuesto: "${await p.inputValue('#bienvenida-nombre')}"`);
  await p.click('#bienvenida-omitir'); await p.waitForTimeout(300);
  const disp = await p.evaluate(async () => { const m = await import('/src/datos/preferencias.js'); return { tipo: m.tipoDispositivo(), perfil: m.perfilActual(), cuerpo: document.body.dataset.perfil }; });
  ok(disp.tipo === 'ordenador' && disp.perfil === 'movil' && disp.cuerpo === 'movil', `el ordenador usa el perfil Móvil (${JSON.stringify(disp)})`);
  // En Ajustes aparece marcado "Ordenador".
  await p.locator('.boton-ajustes:visible').first().click(); await p.waitForTimeout(500);
  ok(await p.isChecked('input[name=perfil][value=ordenador]'), 'Ajustes muestra "Ordenador" como dispositivo');
  await p.screenshot({ path: `${require('../lib/entorno.js').SALIDA}/ajustes-ordenador.png` });
  await p.goBack(); await p.waitForTimeout(400);

  // Arrastrar un EPUB (y un archivo que no lo es) a la ventana.
  const soltar = (nombres) => p.evaluate(async (lista) => {
    const dt = new DataTransfer();
    for (const n of lista) {
      const datos = n.endsWith('.epub') ? await (await fetch(`/pruebas/epubs/${n}`)).blob() : new Blob(['hola']);
      dt.items.add(new File([datos], n, { type: n.endsWith('.epub') ? 'application/epub+zip' : 'text/plain' }));
    }
    document.body.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
    const aviso = document.body.classList.contains('soltando-archivos');
    document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    return aviso;
  }, nombres);
  const avisoVisible = await soltar(['quijote.epub', 'notas.txt']);
  await p.waitForTimeout(2000);
  await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(400);
  ok(avisoVisible && await p.isVisible('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]') && !(await p.evaluate(() => document.body.classList.contains('soltando-archivos'))),
    'un EPUB arrastrado a la ventana se añade a la biblioteca');

  // Rueda del ratón en el lector.
  await p.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]'); await p.waitForSelector('#visor iframe'); await p.waitForTimeout(2000);
  const posicion = () => p.evaluate(() => document.querySelector('#visor .epub-container').scrollLeft);
  const inicio = await posicion();
  await p.mouse.move(720, 450);
  await p.mouse.wheel(0, 120); await p.waitForTimeout(900);
  const tras1 = await posicion();
  ok(tras1 > inicio, `la rueda hacia abajo pasa página (${inicio} a ${tras1})`);
  // Panel táctil: muchos movimientos pequeños seguidos son un solo gesto.
  for (let i = 0; i < 25; i++) { await p.mouse.wheel(0, 12); await p.waitForTimeout(20); }
  await p.waitForTimeout(900);
  const tras2 = await posicion();
  const pagina = tras1 - inicio;
  ok(tras2 - tras1 === pagina, `un gesto largo del panel táctil pasa una sola página (${tras1} a ${tras2})`);
  await p.mouse.wheel(0, -120); await p.waitForTimeout(900);
  ok(await posicion() === tras1, 'la rueda hacia arriba vuelve una página');
  await p.goBack(); await p.waitForTimeout(600);

  // Diagnóstico con el sistema del ordenador.
  const navegador = (await p.evaluate(async () => (await import('/src/ui/diagnostico.js')).nombreNavegador()));
  ok(/ en (Linux|Windows|macOS)/.test(navegador), `Diagnóstico nombra el sistema: ${navegador}`);

  // Monitor muy ancho: el lector no pasa de 1500 px.
  await p.setViewportSize({ width: 2400, height: 1200 }); await p.waitForTimeout(400);
  await p.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]'); await p.waitForSelector('#visor iframe'); await p.waitForTimeout(2000);
  const ancho = await p.evaluate(() => document.getElementById('visor').getBoundingClientRect());
  ok(Math.round(ancho.width) === 1500 && Math.round(ancho.left) === 450, `en un monitor de 2400 px el lector ocupa ${Math.round(ancho.width)} px centrados`);
  console.log('errores', errores);
  await b.close();
})();
