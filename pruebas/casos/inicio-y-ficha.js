// "Leyendo ahora" en el iPhone 17: el libro en curso, los objetivos y la fila
// "Seguir leyendo" caben sin cortes y las filas cortas se centran. El título
// abre la ficha (con la sinopsis) y la portada abre el libro.
const { chromium } = require('playwright');
const { URL_APP, EPUBS: S, SALIDA, ok } = require('../lib/entorno.js');

// Tamaño útil del iPhone 17 (402 x 874) sin la barra de estado (62) ni la zona inferior (34).
const ANCHO = 402;
const ALTO = 778;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: ANCHO, height: ALTO }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errores = []; p.on('pageerror', (e) => errores.push(e.message));
  await p.goto(URL_APP); await p.waitForTimeout(600);
  await p.click('.opcion-grande[data-perfil=movil]'); await p.click('#bienvenida-omitir'); await p.waitForTimeout(300);
  await p.setInputFiles('#archivo-epub', [`${S}/quijote.epub`, `${S}/cubierta.epub`, `${S}/abecedario.epub`, `${S}/sinopsis.epub`]); await p.waitForTimeout(2200);
  ok(!(await p.isVisible('#hoja-acciones')), 'tras la bienvenida no aparece por sorpresa el aviso de conectar');
  for (const t of ['Abecedario sin portada', 'Libro con cubierta', 'Libro con sinopsis']) {
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300);
    await p.click(`#pantalla-biblioteca button[aria-label="Abrir ${t}"]`); await p.waitForSelector('#visor iframe'); await p.waitForTimeout(1200);
    await p.touchscreen.tap(ANCHO - 20, ALTO / 2); await p.waitForTimeout(600);
    await p.goBack(); await p.waitForTimeout(500);
  }
  await p.click('.pestana[data-pestana=inicio]'); await p.waitForTimeout(800);
  await p.screenshot({ path: `${SALIDA}/inicio-iphone17.png` });
  const m = await p.evaluate(() => {
    const pestanas = document.getElementById('barra-pestanas').getBoundingClientRect().top;
    const fila = document.querySelector('#contenido-inicio .carrusel');
    const pies = [...fila.querySelectorAll('.m-pie')].map((x) => x.getBoundingClientRect().bottom);
    const caja = [...fila.children].map((x) => x.getBoundingClientRect());
    return {
      fin: Math.max(...pies), pestanas,
      izquierda: caja[0].left, derecha: innerWidth - caja[caja.length - 1].right,
      centrado: fila.classList.contains('centrado'),
      estado: document.querySelector('.tarjeta-datos .t-detalle').textContent,
    };
  });
  ok(m.fin <= m.pestanas, `la fila "Seguir leyendo" cabe entera (termina en ${Math.round(m.fin)}, las pestañas empiezan en ${Math.round(m.pestanas)})`);
  ok(m.centrado && Math.abs(m.izquierda - m.derecha) <= 2, 'la fila corta queda centrada');
  ok(!/1970/.test(m.estado), `el estado del libro en curso no muestra fechas vacías (${m.estado})`);

  // Título del libro en curso: abre la ficha con la sinopsis
  await p.click('.tarjeta-datos'); await p.waitForTimeout(900);
  const ficha = await p.textContent('#ficha-contenido');
  ok(await p.isVisible('#panel-ficha') && /Una historia de prueba para la ficha/.test(ficha), 'tocar el título del libro en curso abre la ficha con la sinopsis');
  await p.click('#btn-cerrar-ficha'); await p.waitForTimeout(500);

  // Biblioteca: el título abre la ficha y la portada abre el libro
  await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300);
  await p.click('#pantalla-biblioteca button[aria-label="Ficha de Libro con sinopsis"]'); await p.waitForTimeout(900);
  ok(await p.isVisible('#panel-ficha') && /Editorial Ejemplo/.test(await p.textContent('#ficha-contenido')), 'en la biblioteca, tocar el título abre la ficha');
  await p.click('#btn-cerrar-ficha'); await p.waitForTimeout(500);
  await p.click('#pantalla-biblioteca button[aria-label="Abrir Libro con sinopsis"]'); await p.waitForSelector('#visor iframe'); await p.waitForTimeout(800);
  ok(await p.isVisible('#lector'), 'tocar la portada abre el libro');
  console.log('errores', errores);
  await b.close();
})();
