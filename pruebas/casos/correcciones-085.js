// Correcciones de la revisión 0.8.5: primer paso de página guardado en Móvil,
// EPUB con BOM, búsqueda con saltos de línea y espacios duros, índice con
// anclas en un mismo archivo y títulos sin enlace, barra de mes que abre su
// detalle en cada toque y Atrás con una hoja sobre la ficha.
const { chromium, devices } = require('playwright');
const JSZip = require('../../vendor/jszip-3.10.1.min.js');
const { URL_APP, EPUBS: S, ok } = require('../lib/entorno.js');

const BOM = '﻿';
const parrafos = (n) => Array.from({ length: n }, (_, i) => `<p>Párrafo ${i + 1} de relleno para que el capítulo ocupe varias páginas en la pantalla del lector.</p>`).join('');

// Un solo XHTML con tres capítulos (anclas) y un índice anidado con un título
// de parte sin enlace. container.xml y el OPF empiezan con BOM.
async function epubPrueba() {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', `${BOM}<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  zip.file('OEBPS/content.opf', `${BOM}<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:uuid:12345678-aaaa-bbbb-cccc-1234567890ab</dc:identifier><dc:title>Libro con anclas</dc:title><dc:creator>Autora de Prueba</dc:creator><dc:language>es</dc:language><meta property="dcterms:modified">2026-10-28T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="t" href="texto.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="t"/></spine></package>`);
  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Índice</title></head><body><nav epub:type="toc"><ol><li><span>Parte primera</span><ol><li><a href="texto.xhtml#c1">Capítulo 1</a></li><li><a href="texto.xhtml#c2">Capítulo 2</a></li><li><a href="texto.xhtml#c3">Capítulo 3</a></li></ol></li></ol></nav></body></html>`);
  zip.file('OEBPS/texto.xhtml', `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Texto</title></head><body>
<h1 id="c1">Capítulo 1</h1>${parrafos(25)}
<h1 id="c2">Capítulo 2</h1><p>El caballero de la
triste figura y Don&#160;Quijote salieron juntos.</p>${parrafos(25)}
<h1 id="c3">Capítulo 3</h1>${parrafos(25)}</body></html>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

(async () => {
  const datos = await epubPrueba();
  const b = await chromium.launch();
  for (const perfil of ['movil', 'tinta']) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const errores = []; p.on('pageerror', (e) => errores.push(e.message));
    await p.goto(URL_APP); await p.waitForTimeout(600);
    await p.click(`.opcion-grande[data-perfil=${perfil}]`); await p.click('#bienvenida-omitir'); await p.waitForTimeout(300);
    await p.setInputFiles('#archivo-epub', [{ name: 'anclas.epub', mimeType: 'application/epub+zip', buffer: datos }]);
    await p.waitForTimeout(1500);
    await p.setInputFiles('#archivo-epub', [`${S}/cubierta.epub`]);
    await p.waitForTimeout(1500);
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300);
    ok(await p.isVisible('#pantalla-biblioteca button[aria-label="Abrir Libro con anclas"]'), `${perfil}: un EPUB con BOM se importa`);

    // Primer paso de página tras abrir: se guarda (en Móvil se perdía).
    await p.click('#pantalla-biblioteca button[aria-label="Abrir Libro con anclas"]'); await p.waitForSelector('#visor iframe'); await p.waitForTimeout(1800);
    const progresoDe = () => p.evaluate(async () => {
      const a = await import('/src/datos/almacen.js');
      return (await a.leerTodos('progreso')).find((x) => x.capitulo !== undefined && x.cfi) || null;
    });
    const antes = await progresoDe();
    await p.touchscreen.tap(375, 330); await p.waitForTimeout(1200);
    const despues = await progresoDe();
    ok(despues?.fecha && despues.cfi !== antes?.cfi, `${perfil}: el primer paso de página se guarda (${antes?.cfi} -> ${despues?.cfi})`);

    // Índice: título de parte sin enlace como texto; salto a un ancla.
    await p.touchscreen.tap(195, 330); await p.waitForTimeout(400);
    await p.click('#btn-menu-lector'); await p.waitForTimeout(400); await p.click('#btn-indice'); await p.waitForTimeout(500);
    // "Parte primera" no tiene enlace propio: lleva a su primer capítulo.
    await p.click('#lista-indice button:has-text("Parte primera")'); await p.waitForTimeout(1500);
    ok(await p.isHidden('#panel-indice'), `${perfil}: un título de parte sin enlace lleva a su primer capítulo`);
    await p.touchscreen.tap(195, 330); await p.waitForTimeout(400);
    if (!(await p.isVisible('#btn-menu-lector'))) { await p.touchscreen.tap(195, 330); await p.waitForTimeout(400); }
    await p.click('#btn-menu-lector'); await p.waitForTimeout(400); await p.click('#btn-indice'); await p.waitForTimeout(500);
    await p.click('#lista-indice button:has-text("Capítulo 3")'); await p.waitForTimeout(1800);
    await p.touchscreen.tap(195, 330); await p.waitForTimeout(500);
    ok(/Capítulo 3/.test(await p.textContent('#info-capitulo')), `${perfil}: tras saltar al ancla, el capítulo es "${await p.textContent('#info-capitulo')}"`);
    await p.click('#btn-menu-lector'); await p.waitForTimeout(400); await p.click('#btn-indice'); await p.waitForTimeout(500);
    ok((await p.textContent('#lista-indice button.actual')).includes('Capítulo 3'), `${perfil}: el índice marca "Capítulo 3"`);
    await p.goBack(); await p.waitForTimeout(400);

    // Búsqueda con salto de línea y espacio duro en el texto.
    await p.touchscreen.tap(195, 330); await p.waitForTimeout(400);
    if (!(await p.isVisible('#btn-menu-lector'))) { await p.touchscreen.tap(195, 330); await p.waitForTimeout(400); }
    await p.click('#btn-menu-lector'); await p.waitForTimeout(400); await p.click('#btn-buscar-libro'); await p.waitForTimeout(500);
    await p.fill('#buscar-en-libro', 'la triste figura'); await p.press('#buscar-en-libro', 'Enter'); await p.waitForTimeout(1500);
    ok(/1 resultado/.test(await p.textContent('#estado-busqueda')), `${perfil}: "la triste figura" se encuentra aunque haya un salto de línea`);
    await p.fill('#buscar-en-libro', 'Don Quijote salieron'); await p.press('#buscar-en-libro', 'Enter'); await p.waitForTimeout(1500);
    ok(/1 resultado/.test(await p.textContent('#estado-busqueda')), `${perfil}: "Don Quijote" se encuentra con espacio duro`);
    await p.goBack(); await p.waitForTimeout(400);
    await p.goBack(); await p.waitForTimeout(1000);

    // Estadísticas: la barra del mes abre su detalle en cada toque.
    await p.evaluate(async () => {
      const a = await import('/src/datos/almacen.js');
      const ahora = new Date();
      const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1, 10).toISOString();
      const libros = await a.leerTodos('libros');
      await a.guardar('sesiones', { libroId: libros[0].id, inicio, fin: new Date(Date.parse(inicio) + 20 * 60000).toISOString(), paginas: 5, dispositivo: 'x' });
    });
    await p.click('.pestana[data-pestana=estadisticas]'); await p.waitForTimeout(700);
    const mes = new Date().getMonth();
    for (let vez = 1; vez <= 2; vez++) {
      await p.click(`#contenido-estadisticas .grafico >> nth=1 >> .barra >> nth=${mes}`); await p.waitForTimeout(800);
      ok(await p.isVisible('#panel-ficha'), `${perfil}: toque ${vez} en la barra del mes abre el detalle`);
      await p.click('#btn-cerrar-ficha'); await p.waitForTimeout(500);
    }

    // Atrás con una hoja sobre la ficha: la ficha conserva su entrada.
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300);
    await p.click('#pantalla-biblioteca button[aria-label="Acciones de Libro con cubierta"]'); await p.waitForTimeout(400);
    await p.click('#hoja-botones button:has-text("Ficha del libro")'); await p.waitForTimeout(900);
    await p.click('#ficha-contenido .nota-personal, #ficha-contenido button:has-text("Escribir una nota")'); await p.waitForTimeout(500);
    const hojaSobreFicha = await p.isVisible('#hoja-acciones');
    await p.goBack(); await p.waitForTimeout(500);
    ok(hojaSobreFicha && !(await p.isVisible('#hoja-acciones')) && await p.isVisible('#panel-ficha') && await p.evaluate(() => Boolean(history.state?.capa)),
      `${perfil}: Atrás cierra la hoja y la ficha sigue con su entrada`);
    await p.goBack(); await p.waitForTimeout(600);
    ok(!(await p.isVisible('#panel-ficha')) && await p.evaluate(() => Boolean(document.getElementById('pantalla-biblioteca'))), `${perfil}: otro Atrás cierra la ficha sin salir de la app`);
    console.log(perfil, 'errores', errores);
    await ctx.close();
  }
  await b.close();
})();
