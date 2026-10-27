// Aviso de duplicados: el mismo libro importado desde dos archivos distintos.
// Aviso al importar y en la biblioteca, "No son el mismo libro" en el iPhone
// y "Quedarme con este" en la tablet, con la baja sincronizada.
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
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300);
    return p;
  }
  const esperar = (p) => p.waitForFunction(() => !document.getElementById('btn-sincronizar').disabled, null, { timeout: 20000 });
  const sinc = async (p) => { await esperar(p); await p.click('#btn-sincronizar'); await p.waitForTimeout(100); await esperar(p); await p.waitForTimeout(300); };
  const avisoVisible = (p) => p.evaluate(() => !document.getElementById('aviso-duplicados').hidden);
  const titulos = (p) => p.$$eval('#pantalla-biblioteca .libro-titulo', (l) => l.map((x) => x.textContent));

  const A = await disp('iPhone', 'movil');
  await A.setInputFiles('#archivo-epub', [`${S}/quijote.epub`, `${S}/cubierta.epub`]); await A.waitForTimeout(2000);
  ok(!(await avisoVisible(A)), 'sin duplicados no hay aviso');
  await A.setInputFiles('#archivo-epub', [`${S}/quijote-otra-edicion.epub`]);
  await A.waitForFunction(() => /otra copia/.test(document.getElementById('aviso').textContent), null, { timeout: 8000 });
  ok(true, 'al importar avisa de que parece otra copia');
  ok(await avisoVisible(A), 'la biblioteca muestra el aviso');
  ok(/Un libro parece estar dos veces/.test(await A.textContent('#aviso-duplicados')), 'el aviso cuenta los grupos');
  await A.click('#aviso-duplicados'); await A.waitForTimeout(700);
  ok((await A.$$('#ficha-contenido .fila-duplicado')).length === 2, 'la revisión muestra las dos copias');
  await A.screenshot({ path: `${process.env.SALIDA || '/tmp'}/duplicados-movil.png` });
  await A.click('#btn-cerrar-ficha'); await A.waitForTimeout(500);
  await sinc(A);

  // La tablet recibe los dos libros y decide quedarse con uno.
  const B = await disp('Note Air 4C', 'tinta');
  ok(await avisoVisible(B), 'la tablet también avisa');
  await B.click('#aviso-duplicados'); await B.waitForTimeout(400);
  await B.click('#ficha-contenido .fila-duplicado >> nth=0 >> button:has-text("Quedarme con este")'); await B.waitForTimeout(400);
  await B.click('#hoja-botones button:has-text("Eliminar las demás")'); await B.waitForTimeout(800);
  ok(await B.evaluate(() => document.getElementById('panel-ficha').hidden), 'sin más grupos, la revisión se cierra');
  ok(!(await avisoVisible(B)), 'el aviso desaparece en la tablet');
  ok((await titulos(B)).filter((t) => t === 'Don Quijote de prueba').length === 1, 'en la tablet queda una sola copia');
  await sinc(B);

  // La baja hecha en la tablet llega al iPhone.
  await sinc(A);
  ok((await titulos(A)).filter((t) => t === 'Don Quijote de prueba').length === 1, 'la baja llega al iPhone');
  ok(!(await avisoVisible(A)), 'y el aviso desaparece en el iPhone');

  // "No son el mismo libro": deja de avisar de ese grupo en este dispositivo.
  await A.setInputFiles('#archivo-epub', [`${S}/quijote-otra-edicion.epub`, `${S}/quijote.epub`]); await A.waitForTimeout(2200);
  ok(await avisoVisible(A), 'al volver a importar la otra copia, vuelve el aviso');
  await A.click('#aviso-duplicados'); await A.waitForTimeout(700);
  await A.click('#ficha-contenido button:has-text("No son el mismo libro")'); await A.waitForTimeout(900);
  ok(await A.evaluate(() => document.getElementById('panel-ficha').hidden), 'la revisión se cierra');
  ok(!(await avisoVisible(A)), '"No son el mismo libro" quita el aviso');
  ok((await titulos(A)).filter((t) => t === 'Don Quijote de prueba').length === 2, 'y no elimina nada');
  console.log('errores iPhone:', A.errores, '| tablet:', B.errores);
  await b.close();
})();
