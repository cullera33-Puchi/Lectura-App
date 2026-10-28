// Mejora 24: con un libro abierto la pantalla no se apaga. Se suelta tras
// 5 minutos sin pasar página y al cerrar el libro. El bloqueo del navegador se
// simula para poder contar peticiones y liberaciones.
const { chromium, devices } = require('playwright');
const { URL_APP, EPUBS: S, ok } = require('../lib/entorno.js');

(async () => {
  const b = await chromium.launch();
  for (const perfil of ['movil', 'tinta']) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    await ctx.clock.install();
    await ctx.addInitScript(() => {
      window.__bloqueo = { pedidos: 0, activos: 0 };
      Object.defineProperty(navigator, 'wakeLock', {
        value: {
          async request() {
            window.__bloqueo.pedidos += 1;
            window.__bloqueo.activos += 1;
            const oyentes = [];
            return {
              released: false,
              addEventListener: (t, f) => oyentes.push(f),
              async release() {
                if (this.released) return;
                this.released = true;
                window.__bloqueo.activos -= 1;
                oyentes.forEach((f) => f());
              },
            };
          },
        },
      });
    });
    const p = await ctx.newPage();
    const errores = []; p.on('pageerror', (e) => errores.push(e.message));
    await p.goto(URL_APP); await p.waitForTimeout(600);
    await p.click(`.opcion-grande[data-perfil=${perfil}]`); await p.click('#bienvenida-omitir'); await p.waitForTimeout(300);
    await p.setInputFiles('#archivo-epub', [`${S}/quijote.epub`]); await p.waitForTimeout(1500);
    const bloqueo = () => p.evaluate(() => window.__bloqueo);
    const estado = () => p.evaluate(async () => (await import('/src/lector/pantalla-encendida.js')).estadoPantalla());
    ok((await bloqueo()).activos === 0, `${perfil}: sin libro abierto no se pide`);
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300);
    await p.click('#pantalla-biblioteca .libro-abrir'); await p.waitForSelector('#visor iframe'); await p.waitForTimeout(1500);
    ok((await bloqueo()).activos === 1 && /encendida/.test(await estado()), `${perfil}: al abrir el libro la pantalla queda encendida (${await estado()})`);
    await p.clock.fastForward('04:00');
    await p.touchscreen.tap(370, 330); await p.waitForTimeout(800);
    await p.clock.fastForward('04:00');
    ok((await bloqueo()).activos === 1, `${perfil}: pasar página reinicia la cuenta de 5 minutos`);
    await p.clock.fastForward('01:30');
    ok((await bloqueo()).activos === 0 && /5 min/.test(await estado()), `${perfil}: tras 5 minutos sin pasar página se suelta (${await estado()})`);
    await p.touchscreen.tap(370, 330); await p.waitForTimeout(800);
    ok((await bloqueo()).activos === 1, `${perfil}: al volver a pasar página se pide otra vez`);
    await p.goBack(); await p.waitForTimeout(800);
    ok((await bloqueo()).activos === 0 && /sin libro/.test(await estado()), `${perfil}: al cerrar el libro se suelta`);
    console.log(perfil, 'errores', errores);
    await ctx.close();
  }
  await b.close();
})();
