// Cambiar de pestaña deslizando en horizontal, sin interferir con las filas de
// portadas ni con el desplazamiento vertical.
const { chromium, devices } = require('playwright');
const { URL_APP, EPUBS: S, ok } = require('../lib/entorno.js');

(async () => {
  const b = await chromium.launch();
  for (const perfil of ['movil', 'tinta']) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const errores = []; p.on('pageerror', (e) => errores.push(e.message));
    const cdp = await ctx.newCDPSession(p);
    const arrastrar = async (x0, y0, dx, dy = 0, pasos = 10) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
      for (let k = 1; k <= pasos; k++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * k) / pasos, y: y0 + (dy * k) / pasos }] });
        await p.waitForTimeout(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.waitForTimeout(800);
    };
    // Punto de partida sobre el título grande de la pantalla visible.
    const sobreTitulo = async () => {
      const caja = await p.evaluate(() => {
        const n = ['inicio', 'biblioteca', 'estadisticas'].find((x) => !document.getElementById(`pantalla-${x}`).hidden);
        const r = document.querySelector(`#pantalla-${n} .titulo-grande`).getBoundingClientRect();
        return { y: r.top + r.height / 2 };
      });
      return caja.y;
    };
    const visible = () => p.evaluate(() => ['inicio', 'biblioteca', 'estadisticas'].find((n) => !document.getElementById(`pantalla-${n}`).hidden));
    await p.goto(URL_APP); await p.waitForTimeout(600);
    await p.click(`.opcion-grande[data-perfil=${perfil}]`); await p.click('#bienvenida-omitir'); await p.waitForTimeout(300);
    await p.setInputFiles('#archivo-epub', [`${S}/quijote.epub`, `${S}/cubierta.epub`, `${S}/abecedario.epub`, `${S}/sinopsis.epub`]); await p.waitForTimeout(5000);
    await p.click('.pestana[data-pestana=inicio]'); await p.waitForTimeout(500);

    await arrastrar(300, await sobreTitulo(), -220);
    ok(await visible() === 'biblioteca', `${perfil}: deslizar a la izquierda pasa de Leyendo ahora a Biblioteca`);
    await arrastrar(300, await sobreTitulo(), -220);
    ok(await visible() === 'estadisticas', `${perfil}: y de Biblioteca a Estadísticas`);
    await arrastrar(300, await sobreTitulo(), -220);
    ok(await visible() === 'estadisticas', `${perfil}: en la última pestaña no pasa de largo`);
    await arrastrar(80, await sobreTitulo(), 220);
    ok(await visible() === 'biblioteca', `${perfil}: deslizar a la derecha vuelve a Biblioteca`);
    ok(await p.evaluate(() => document.querySelector('.pestana.activa')?.dataset.pestana) === 'biblioteca', `${perfil}: la barra de pestañas marca la pestaña nueva`);
    await arrastrar(300, await sobreTitulo(), -50);
    ok(await visible() === 'biblioteca', `${perfil}: un arrastre corto no cambia de pestaña`);
    await arrastrar(200, 600, 20, -250);
    ok(await visible() === 'biblioteca', `${perfil}: desplazar en vertical no cambia de pestaña`);
    // Sobre una fila de portadas que se desplaza, el gesto es de la fila hasta su final
    await p.click('.pestana[data-pestana=inicio]'); await p.waitForTimeout(500);
    await p.evaluate(() => { const f = document.querySelector('#contenido-inicio .carrusel'); f.style.gridAutoColumns = '200px'; f.classList.remove('centrado'); f.scrollLeft = 0; });
    const fila = await p.locator('#contenido-inicio .carrusel').first().boundingBox();
    await arrastrar(fila.x + fila.width - 40, fila.y + 60, -150);
    ok(await visible() === 'inicio', `${perfil}: deslizar sobre una fila de portadas que se desplaza no cambia de pestaña`);
    await p.evaluate(() => { const f = document.querySelector('#contenido-inicio .carrusel'); f.scrollLeft = f.scrollWidth; });
    await arrastrar(fila.x + fila.width - 40, fila.y + 60, -220);
    ok(await visible() === 'biblioteca', `${perfil}: con la fila al final, el siguiente deslizamiento cambia de pestaña`);
    await p.click('.pestana[data-pestana=inicio]'); await p.waitForTimeout(500);
    const estilos = await p.evaluate(() => ['inicio', 'biblioteca', 'estadisticas'].map((n) => document.getElementById(`pantalla-${n}`).style.transform).join(''));
    ok(estilos === '', `${perfil}: no quedan desplazamientos a medias`);
    console.log('errores', errores);
    await ctx.close();
  }
  await b.close();
})();
