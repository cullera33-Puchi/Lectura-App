// Barra para recorrer el libro: se activa cuando hay porcentaje, muestra el
// destino mientras se arrastra y salta al soltar.
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
    await p.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]'); await p.waitForSelector('#visor iframe');
    await p.waitForFunction(() => !document.getElementById('barra-libro').disabled, null, { timeout: 20000 });
    await p.touchscreen.tap(195, 330); await p.waitForTimeout(400);
    ok(await p.isVisible('#barra-libro'), `${perfil}: la barra aparece en los controles con el porcentaje calculado`);
    const mover = (valor, evento) => p.evaluate(([v, e]) => {
      const barra = document.getElementById('barra-libro');
      barra.value = String(v);
      barra.dispatchEvent(new Event(e, { bubbles: true }));
    }, [valor, evento]);
    await mover(700, 'input'); await p.waitForTimeout(200);
    const vista = `${await p.textContent('#info-capitulo')} | ${await p.textContent('#info-progreso')}`;
    ok(/Capítulo [45]/.test(vista) && /Ir al 70 %/.test(vista), `${perfil}: al arrastrar muestra el destino (${vista})`);
    await mover(700, 'change'); await p.waitForTimeout(2000);
    const progreso = await p.textContent('#info-progreso');
    const pct = Number((progreso.match(/(\d+) %/) || [])[1]);
    ok(pct >= 65 && pct <= 75 && /Capítulo [45]/.test(await p.textContent('#info-capitulo')), `${perfil}: al soltar salta a ese punto (${await p.textContent('#info-capitulo')}, ${progreso})`);
    ok(Math.abs(Number(await p.inputValue('#barra-libro')) - pct * 10) <= 20, `${perfil}: la barra queda en la posición nueva`);
    console.log('errores', errores);
    await ctx.close();
  }
  await b.close();
})();
