// Meta diaria de minutos: se fija en Estadísticas, avisa al cumplirla leyendo
// (una vez al día), aparece en Leyendo ahora y llega a la tablet. Cancelar no
// la cambia y 0 la quita.
const { chromium, devices } = require('playwright');
const drive = require('../lib/drive-falso.js');
const { URL_APP, EPUBS: S, ok } = require('../lib/entorno.js');

(async () => {
  const b = await chromium.launch();
  async function disp(nombre, perfil) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    await drive.instalar(ctx);
    const p = await ctx.newPage();
    p.errores = []; p.on('pageerror', (e) => p.errores.push(e.message));
    await p.goto(URL_APP); await p.waitForTimeout(600);
    await p.click(`.opcion-grande[data-perfil=${perfil}]`); await p.fill('#bienvenida-nombre', nombre);
    await p.click('#bienvenida-conectar');
    await p.waitForFunction(() => /Todo al día|nuevo|subido/.test(document.getElementById('aviso').textContent), null, { timeout: 15000 });
    return p;
  }
  const esperar = (p) => p.waitForFunction(() => !document.getElementById('btn-sincronizar').disabled, null, { timeout: 20000 });
  const sinc = async (p) => { await esperar(p); await p.click('#btn-sincronizar'); await p.waitForTimeout(100); await esperar(p); await p.waitForTimeout(300); };
  const hoja = async (p, texto) => { await p.click(`#hoja-botones button:has-text("${texto}")`); await p.waitForTimeout(500); };
  const pestana = async (p, nombre) => { await p.click(`.pestana[data-pestana=${nombre}]`); await p.waitForTimeout(500); };
  const textoHoy = (p) => p.evaluate(() => document.querySelector('#contenido-estadisticas .grupo').textContent);
  const celdaHoy = (p) => p.evaluate(() => document.querySelector('#contenido-inicio .resumen-celda span')?.textContent);

  const A = await disp('iPhone', 'movil');
  await A.setInputFiles('#archivo-epub', [`${S}/quijote.epub`]); await A.waitForTimeout(1500);
  await pestana(A, 'estadisticas');
  await A.click('#contenido-estadisticas button:has-text("Fijar meta diaria")'); await A.waitForTimeout(300);
  await A.fill('.campo-hoja', '1'); await hoja(A, 'Guardar');
  ok(/Meta diaria: 1 min\. Te faltan 1 min/.test(await textoHoy(A)), `Estadísticas muestra la meta: "${await textoHoy(A)}"`);
  await pestana(A, 'inicio');
  ok(await celdaHoy(A) === 'Hoy, de 1 min', `Leyendo ahora la indica: "${await celdaHoy(A)}"`);

  // Dos minutos leídos hoy en este dispositivo; al pasar página, aviso.
  await A.evaluate(() => new Promise((ok) => {
    const peticion = indexedDB.open('lector-epub');
    peticion.onsuccess = () => {
      const tx = peticion.result.transaction('sesiones', 'readwrite');
      const fin = new Date();
      const inicio = new Date(fin.getTime() - 2 * 60000);
      tx.objectStore('sesiones').add({ libroId: 'x', dispositivo: 'iPhone', inicio: inicio.toISOString(), fin: fin.toISOString(), paginas: 4 });
      tx.oncomplete = () => ok();
    };
  }));
  await pestana(A, 'biblioteca');
  await A.click('#pantalla-biblioteca button[aria-label="Abrir Don Quijote de prueba"]'); await A.waitForSelector('#visor iframe'); await A.waitForTimeout(1500);
  let avisado = false;
  for (let i = 0; i < 3 && !avisado; i++) {
    await A.touchscreen.tap(375, 330);
    avisado = await A.waitForFunction(() => /Meta de hoy cumplida/.test(document.getElementById('aviso').textContent), null, { timeout: 2500 })
      .then(() => true, () => false);
  }
  ok(avisado, 'al pasar página avisa de que la meta está cumplida');
  await A.waitForTimeout(5500);
  await A.touchscreen.tap(375, 330); await A.waitForTimeout(1500);
  ok(await A.evaluate(() => document.getElementById('aviso').hidden), 'el aviso no se repite');
  await A.click('#btn-cerrar-libro').catch(async () => { await A.touchscreen.tap(195, 330); await A.waitForTimeout(400); await A.click('#btn-cerrar-libro'); });
  await A.waitForTimeout(800);
  await pestana(A, 'inicio');
  ok(await celdaHoy(A) === 'Meta cumplida', `Leyendo ahora: "${await celdaHoy(A)}"`);
  await A.screenshot({ path: `${process.env.SALIDA || '/tmp'}/meta-diaria-inicio.png` });
  await pestana(A, 'biblioteca');
  await sinc(A);
  ok(drive.estado().biblioteca.objetivos?.diario?.minutos === 1, 'la meta viaja en biblioteca.json');

  const B = await disp('Note Air 4C', 'tinta');
  await pestana(B, 'estadisticas');
  ok(/Meta de hoy cumplida \(1 min\)/.test(await textoHoy(B)), `la tablet recibe la meta: "${await textoHoy(B)}"`);
  await B.screenshot({ path: `${process.env.SALIDA || '/tmp'}/meta-diaria-tinta.png` });
  await B.click('#contenido-estadisticas button:has-text("Cambiar meta diaria")'); await B.waitForTimeout(300);
  await B.click('#hoja-cancelar'); await B.waitForTimeout(400);
  ok(/Meta de hoy cumplida/.test(await textoHoy(B)), 'cancelar no cambia la meta');
  await B.click('#contenido-estadisticas button:has-text("Cambiar meta diaria")'); await B.waitForTimeout(300);
  await B.fill('.campo-hoja', '0'); await hoja(B, 'Guardar');
  ok(!/Meta/.test(await textoHoy(B)) && /Fijar meta diaria/.test(await textoHoy(B)), '0 quita la meta');
  await pestana(B, 'biblioteca'); await pestana(A, 'biblioteca');
  await sinc(B); await sinc(A);
  await pestana(A, 'inicio');
  ok(await celdaHoy(A) === 'Hoy', 'quitarla en la tablet llega al iPhone');
  console.log('errores iPhone:', A.errores, '| tablet:', B.errores);
  await b.close();
})();
