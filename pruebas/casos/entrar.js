// Al entrar en la app con la sesión de Google caducada se pide conectar; un toque reconecta y sincroniza.
const { chromium, devices } = require('playwright');
const { URL_APP, EPUBS: S, SALIDA, ok } = require('../lib/entorno.js');
const drive = require('../lib/drive-falso.js');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  await drive.instalar(ctx);
  const p = await ctx.newPage();
  const errores = []; p.on('pageerror', (e) => errores.push(e.message));
  await p.goto(URL_APP); await p.waitForTimeout(600);
  await p.click('.opcion-grande[data-perfil=movil]'); await p.fill('#bienvenida-nombre', 'iPhone');
  await p.click('#bienvenida-conectar');
  await p.waitForFunction(() => /Todo al día/.test(document.getElementById('aviso').textContent), null, { timeout: 15000 });
  // Sesión vigente: al reabrir no se pide nada
  await p.reload(); await p.waitForTimeout(1500);
  ok(!(await p.isVisible('#hoja-acciones')), 'con sesión vigente no se pide conectar al abrir');
  // Sesión caducada: al abrir se pide conectar
  await p.evaluate(async () => { const g = await import('/src/sync/google.js'); await g.invalidarToken(); });
  await p.reload(); await p.waitForTimeout(1500);
  const titulo = await p.textContent('#hoja-titulo');
  ok(await p.isVisible('#hoja-acciones') && /caducado/.test(titulo), `al abrir con la sesión caducada se pide conectar: "${titulo.replace(/\n/g, ' | ')}"`);
  await p.click('#hoja-botones button:has-text("Conectar y sincronizar")');
  await p.waitForFunction(() => /Todo al día/.test(document.getElementById('aviso').textContent), null, { timeout: 15000 });
  const vigente = await p.evaluate(async () => (await import('/src/sync/google.js')).tokenVigente());
  ok(vigente, 'un toque renueva la sesión y sincroniza');
  // Volver a la app tras más de 5 minutos con la sesión caducada
  await p.evaluate(async () => { const g = await import('/src/sync/google.js'); await g.invalidarToken(); });
  const cambiarVisibilidad = (estado, desplazar = 0) => p.evaluate(([estado, desplazar]) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => estado });
    if (desplazar) { const real = Date.now; Date.now = () => real() + desplazar; }
    document.dispatchEvent(new Event('visibilitychange'));
  }, [estado, desplazar]);
  await cambiarVisibilidad('hidden'); await cambiarVisibilidad('visible', 60 * 1000); await p.waitForTimeout(500);
  ok(!(await p.isVisible('#hoja-acciones')), 'volver tras 1 minuto no pide nada');
  await cambiarVisibilidad('hidden'); await cambiarVisibilidad('visible', 6 * 60 * 1000); await p.waitForTimeout(500);
  ok(await p.isVisible('#hoja-acciones'), 'volver tras más de 5 minutos con la sesión caducada pide conectar');
  await p.click('#hoja-cancelar'); await p.waitForTimeout(400);
  ok(!(await p.isVisible('#hoja-acciones')), 'se puede posponer con Cancelar');
  // Con la sincronización automática desactivada no se pide
  await p.evaluate(async () => { const pr = await import('/src/datos/preferencias.js'); await pr.cambiarDispositivo({ sincronizacionAutomatica: false }); });
  await p.reload(); await p.waitForTimeout(1500);
  ok(!(await p.isVisible('#hoja-acciones')), 'con la sincronización automática desactivada no se pide');
  const registro = await p.$$eval('#lista-registro li', (l) => l.map((x) => x.textContent).filter((t) => /pide conectar|pospuesta/.test(t)));
  console.log('   registro:', registro.join(' | '));
  console.log('errores', errores);
  await b.close();
})();
