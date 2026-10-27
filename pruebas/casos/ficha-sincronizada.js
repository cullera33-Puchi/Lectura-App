// La ficha (sinopsis y datos de la edición) llega al otro dispositivo sin descargar el libro.
const { chromium, devices } = require('playwright');
const drive = require('../lib/drive-falso.js');
const { URL_APP, EPUBS: S, SALIDA, ok } = require('../lib/entorno.js');
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
  const abrirFicha = async (p, titulo) => {
    await p.click(`#pantalla-biblioteca button[aria-label="Acciones de ${titulo}"]`); await p.waitForTimeout(300);
    await p.click('#hoja-botones button:has-text("Ficha del libro")'); await p.waitForTimeout(900);
    return p.textContent('#ficha-contenido');
  };

  const A = await disp('iPhone', 'movil');
  await A.setInputFiles('#archivo-epub', [`${S}/sinopsis.epub`, `${S}/quijote.epub`]); await A.waitForTimeout(1500);
  // Un libro "antiguo" sin datos de edición: se completa al abrir la ficha
  await A.evaluate(async () => {
    const a = await import('/src/datos/almacen.js');
    const l = (await a.leerTodos('libros')).find((x) => x.titulo.startsWith('Don'));
    delete l.edicion; await a.guardar('libros', l);
  });
  await sinc(A);
  const bib = drive.estado().biblioteca;
  const conSinopsis = bib.libros.find((l) => l.titulo === 'Libro con sinopsis');
  ok(conSinopsis.edicion?.sinopsis?.startsWith('Una historia de prueba') && conSinopsis.edicion.editorial === 'Editorial Ejemplo', 'al importar, la edición va a biblioteca.json');
  ok(!bib.libros.find((l) => l.titulo.startsWith('Don')).edicion, 'el libro antiguo aún no tiene edición');
  await abrirFicha(A, 'Don Quijote de prueba');
  await A.click('#btn-cerrar-ficha'); await A.waitForTimeout(400);
  await sinc(A);
  ok(Boolean(drive.estado().biblioteca.libros.find((l) => l.titulo.startsWith('Don')).edicion), 'el libro antiguo completa su edición al abrir la ficha y la sincroniza');

  const B = await disp('Note Air 4C', 'tinta');
  const ficha = await abrirFicha(B, 'Libro con sinopsis');
  ok(/Sinopsis/.test(ficha) && /Segundo párrafo de la sinopsis/.test(ficha) && /Editorial Ejemplo/.test(ficha) && /Novela, Aventuras/.test(ficha) && /Solo en la nube/.test(ficha),
    'la tablet ve sinopsis y edición sin descargar el libro');
  console.log('   ficha tablet:', ficha.replace(/\s+/g, ' ').slice(0, 300));
  console.log('errores iPhone:', A.errores, '| tablet:', B.errores);
  await b.close();
})();
