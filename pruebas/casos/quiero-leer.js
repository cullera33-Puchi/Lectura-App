// Lista "Quiero leer": añadir desde ⋯, fila en Leyendo ahora en su orden,
// ordenar y quitar, grupo en la biblioteca y sincronización con la tablet.
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
  const accion = async (p, titulo, texto) => {
    await p.click(`#pantalla-biblioteca button[aria-label="Acciones de ${titulo}"]`); await p.waitForTimeout(350);
    await p.click(`#hoja-botones button:has-text("${texto}")`); await p.waitForTimeout(500);
  };
  const filaQuiero = (p) => p.evaluate(() => {
    const t = [...document.querySelectorAll('#contenido-inicio .seccion-cabecera')].find((x) => /Quiero leer/.test(x.textContent));
    const fila = t?.nextElementSibling;
    return fila ? [...fila.querySelectorAll('.miniatura-abrir')].map((x) => x.getAttribute('aria-label').replace('Abrir ', '')) : [];
  });

  const A = await disp('iPhone', 'movil');
  await A.setInputFiles('#archivo-epub', [`${S}/quijote.epub`, `${S}/cubierta.epub`, `${S}/sinopsis.epub`]); await A.waitForTimeout(2200);
  await accion(A, 'Libro con sinopsis', 'Añadir a Quiero leer');
  await accion(A, 'Don Quijote de prueba', 'Añadir a Quiero leer');
  await A.click('.pestana[data-pestana=inicio]'); await A.waitForTimeout(600);
  ok(JSON.stringify(await filaQuiero(A)) === JSON.stringify(['Libro con sinopsis', 'Don Quijote de prueba']), `Leyendo ahora muestra "Quiero leer" en orden: ${(await filaQuiero(A)).join(', ')}`);
  await A.click('#contenido-inicio .seccion-cabecera .enlace'); await A.waitForTimeout(800);
  await A.click('#ficha-contenido button[aria-label="Bajar Libro con sinopsis"]'); await A.waitForTimeout(600);
  ok(/1\. Don Quijote de prueba/.test(await A.textContent('#ficha-contenido')), 'se puede reordenar');
  await A.click('#btn-cerrar-ficha'); await A.waitForTimeout(600);
  ok(JSON.stringify(await filaQuiero(A)) === JSON.stringify(['Don Quijote de prueba', 'Libro con sinopsis']), 'la fila sigue el nuevo orden');
  await A.click('.pestana[data-pestana=biblioteca]'); await A.waitForTimeout(300);
  await A.click('#btn-colecciones'); await A.waitForTimeout(400);
  await A.click('#hoja-botones button:has-text("Quiero leer (2 libros)")'); await A.waitForTimeout(500);
  const enGrupo = await A.$$eval('#pantalla-biblioteca .libro-titulo', (l) => l.map((x) => x.textContent));
  ok(JSON.stringify(enGrupo) === JSON.stringify(['Don Quijote de prueba', 'Libro con sinopsis']), 'en la biblioteca, el grupo Quiero leer en su orden');
  await A.click('#btn-quitar-grupo'); await A.waitForTimeout(300);
  await sinc(A);
  ok(drive.estado().biblioteca.quieroLeer?.ids?.length === 2, 'la lista viaja en biblioteca.json');

  const B = await disp('Note Air 4C', 'tinta');
  await B.click('.pestana[data-pestana=inicio]'); await B.waitForTimeout(600);
  ok(JSON.stringify(await filaQuiero(B)) === JSON.stringify(['Don Quijote de prueba', 'Libro con sinopsis']), 'la tablet recibe la lista en el mismo orden');
  await B.click('.pestana[data-pestana=biblioteca]'); await B.waitForTimeout(300);
  await accion(B, 'Don Quijote de prueba', 'Quitar de Quiero leer');
  await sinc(B); await sinc(A);
  await A.click('.pestana[data-pestana=inicio]'); await A.waitForTimeout(600);
  ok(JSON.stringify(await filaQuiero(A)) === JSON.stringify(['Libro con sinopsis']), 'quitar en la tablet llega al iPhone');
  console.log('errores iPhone:', A.errores, '| tablet:', B.errores);
  await b.close();
})();
