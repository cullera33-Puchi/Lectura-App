// Seguir como un dispositivo anterior: al estrenar la app en otra dirección
// el navegador empieza sin datos. Si Drive ya conoce un dispositivo con el
// mismo nombre, la bienvenida ofrece seguir como él; se reutiliza su identificador,
// se traen sus sesiones y no aparece dos veces en "Por dispositivo". Elegir
// "Es un dispositivo nuevo" crea su propio archivo de sesiones.
const { chromium, devices } = require('playwright');
const drive = require('../lib/drive-falso.js');
const { URL_APP, EPUBS: S, ok } = require('../lib/entorno.js');

(async () => {
  const b = await chromium.launch();
  const errores = [];
  async function abrir(nombre, perfil) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    await drive.instalar(ctx);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errores.push(e.message));
    await p.goto(URL_APP); await p.waitForTimeout(700);
    await p.click(`.opcion-grande[data-perfil=${perfil}]`); await p.waitForTimeout(200);
    await p.fill('#bienvenida-nombre', nombre);
    await p.click('#bienvenida-conectar');
    return p;
  }
  const esperarSincronizado = async (p) => { await p.waitForTimeout(500); await p.waitForFunction(() => document.getElementById('pantalla-bienvenida').hidden
    && !document.getElementById('btn-sincronizar').disabled && !/\.\.\.$/.test(document.getElementById('aviso').textContent), null, { timeout: 20000 }); };
  const sincronizar = async (p) => { await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300); await p.click('#btn-sincronizar'); await p.waitForTimeout(300); await esperarSincronizado(p); };
  const id = (p) => p.evaluate(async () => (await import('/src/datos/preferencias.js')).idDispositivo());
  const locales = (p) => p.evaluate(async () => (await (await import('/src/datos/sesiones.js')).listarSesiones()).length);
  const archivosSesiones = () => drive.estado().vivos.filter((n) => n.startsWith('sesiones-')).length;

  // Dirección antigua: el iPhone lee y sincroniza tres sesiones.
  const A = await abrir('iPhone', 'movil');
  await esperarSincronizado(A);
  await A.setInputFiles('#archivo-epub', [`${S}/quijote.epub`]); await A.waitForTimeout(1500);
  await A.evaluate(async () => {
    const a = await import('/src/datos/almacen.js');
    const libro = (await a.leerTodos('libros'))[0].id;
    for (const d of [1, 2, 3]) {
      const inicio = new Date(Date.now() - d * 86400000).toISOString();
      await a.guardar('sesiones', { libroId: libro, inicio, fin: new Date(Date.parse(inicio) + 20 * 60000).toISOString(), paginas: 10, dispositivo: 'iPhone' });
    }
  });
  await sincronizar(A);
  const idA = await id(A);
  ok(archivosSesiones() === 1, 'el iPhone tiene su archivo de sesiones en Drive');

  // Dirección nueva en el mismo iPhone: se ofrece seguir como el iPhone.
  const C = await abrir('iPhone', 'movil');
  await C.waitForSelector('#hoja-acciones:not([hidden])', { timeout: 15000 });
  const opciones = await C.$$eval('#hoja-botones button', (bs) => bs.map((x) => x.textContent));
  ok(opciones.length === 1 && /^iPhone, última lectura el /.test(opciones[0]) && /dispositivo nuevo/.test(await C.textContent('#hoja-cancelar')),
    `la bienvenida ofrece seguir como el iPhone: ${opciones.join(' | ')}`);
  await C.click('#hoja-botones button');
  await esperarSincronizado(C);
  ok(await id(C) === idA, 'el iPhone nuevo reutiliza el identificador anterior');
  ok(await locales(C) === 3 && archivosSesiones() === 1 && drive.estado().sesiones[0].sesiones.length === 3,
    `trae las 3 sesiones y sigue habiendo un solo archivo de sesiones (${await locales(C)} locales, ${archivosSesiones()} archivos)`);
  await C.click('.pestana[data-pestana=estadisticas]'); await C.waitForTimeout(800);
  const filas = await C.$$eval('.fila-dispositivo', (fs) => fs.map((f) => f.textContent));
  ok(filas.length === 1 && /iPhone/.test(filas[0]) && /1 h/.test(filas[0]), `"Por dispositivo" muestra el iPhone una sola vez: ${filas.join(' | ')}`);

  // Una tablet nueva, con otro nombre: no se pregunta y crea su propio archivo.
  const D = await abrir('Note Air 4C', 'tinta');
  await esperarSincronizado(D);
  ok(!(await D.isVisible('#hoja-acciones')), 'con otro nombre no se pregunta');
  ok(await id(D) !== idA && await locales(D) === 0, 'la tablet nueva tiene su propio identificador y no hereda sesiones');
  await D.evaluate(async () => {
    const a = await import('/src/datos/almacen.js');
    const libro = (await a.leerTodos('libros'))[0]?.id || 'x';
    const inicio = new Date(Date.now() - 3600000).toISOString();
    await a.guardar('sesiones', { libroId: libro, inicio, fin: new Date(Date.parse(inicio) + 10 * 60000).toISOString(), paginas: 5, dispositivo: 'Note Air 4C' });
  });
  await sincronizar(D);
  ok(archivosSesiones() === 2, `la tablet escribe su propio archivo (${archivosSesiones()} archivos de sesiones)`);
  // Otro iPhone que elige "Es un dispositivo nuevo": también tiene su archivo.
  const E = await abrir('iphone', 'movil');
  await E.waitForSelector('#hoja-acciones:not([hidden])', { timeout: 15000 });
  await E.click('#hoja-cancelar');
  await esperarSincronizado(E);
  ok(await id(E) !== idA && await locales(E) === 0, 'con el mismo nombre se pregunta, y "Es un dispositivo nuevo" no hereda nada');
  console.log('errores', errores);
  await b.close();
})();
