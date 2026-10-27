// Sincronización con menos llamadas a Drive (0.8.3): sin cambios, solo se
// comprueba la carpeta y se listan su contenido y el de los libros; lo que cambia en el otro
// dispositivo sí se descarga; si la carpeta guardada va a la papelera, se
// vuelve a localizar.
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
    p.peticiones = [];
    p.on('request', (r) => { if (r.url().includes('googleapis.com')) p.peticiones.push(`${r.method()} ${new URL(r.url()).pathname}`); });
    await p.goto(URL_APP); await p.waitForTimeout(600);
    await p.click(`.opcion-grande[data-perfil=${perfil}]`); await p.fill('#bienvenida-nombre', nombre);
    await p.click('#bienvenida-conectar');
    await p.waitForFunction(() => /Todo al día|nuevo|subido/.test(document.getElementById('aviso').textContent), null, { timeout: 15000 });
    await p.click('.pestana[data-pestana=biblioteca]'); await p.waitForTimeout(300);
    return p;
  }
  const esperar = (p) => p.waitForFunction(() => !document.getElementById('btn-sincronizar').disabled, null, { timeout: 20000 });
  const sinc = async (p) => {
    await esperar(p); p.peticiones = [];
    await p.click('#btn-sincronizar'); await p.waitForTimeout(100); await esperar(p); await p.waitForTimeout(300);
    return [...p.peticiones];
  };

  const A = await disp('iPhone', 'movil');
  await A.setInputFiles('#archivo-epub', [`${S}/quijote.epub`]); await A.waitForTimeout(1500);
  await sinc(A);
  const sinCambios = await sinc(A);
  ok(sinCambios.length <= 3, `sin cambios, ${sinCambios.length} peticiones a Drive: ${sinCambios.join(', ')}`);
  ok(/Todo al día/.test(await A.textContent('#aviso')), 'y el resumen dice "Todo al día"');

  // La tablet pone un marcador: el iPhone lo descarga.
  const B = await disp('Note Air 4C', 'tinta');
  await B.evaluate(async () => {
    const libros = await (await import('/src/datos/libros.js')).todosLosLibros();
    await (await import('/src/datos/anotaciones.js')).crearMarcador(libros[0].id, { cfi: 'epubcfi(/6/2!/4/2/1:0)', capitulo: 'Capítulo 1', porcentaje: 0, texto: 'En un lugar' });
  });
  await sinc(B);
  const conCambio = await sinc(A);
  const marcadores = await A.evaluate(async () => Object.keys(await (await import('/src/datos/anotaciones.js')).todasLasAnotaciones()).length);
  ok(marcadores === 1 && conCambio.some((x) => x.startsWith('GET /drive/v3/files/')), `el cambio de la tablet se descarga (${conCambio.length} peticiones)`);
  ok((await sinc(A)).length <= 3, 'y la siguiente vuelve a ser ligera');

  // La progresión de una posición en el iPhone se escribe en Drive.
  await A.evaluate(async () => {
    const libros = await (await import('/src/datos/libros.js')).todosLosLibros();
    await (await import('/src/datos/progreso.js')).guardarProgreso(libros[0].id, { cfi: 'epubcfi(/6/4!/4/2/1:0)', porcentaje: 0.2, estado: 'leyendo' });
  });
  await sinc(A);
  ok(drive.estado().progreso.progreso[Object.keys(drive.estado().progreso.progreso)[0]].porcentaje === 0.2, 'un cambio local se sigue escribiendo en Drive');

  // Carpeta guardada en la papelera: se vuelve a localizar (o crear).
  // Como en Drive, la papelera se lleva también lo que hay dentro.
  const raiz = [...drive.archivos.values()].find((x) => x.name === 'Lector EPUB' && !x.trashed);
  const dentro = (id) => [...drive.archivos.values()].filter((x) => x.parents.includes(id));
  const vaciar = (id) => { for (const x of dentro(id)) { x.trashed = true; vaciar(x.id); } };
  raiz.trashed = true; vaciar(raiz.id);
  await sinc(A);
  const vivas = drive.estado().vivos.filter((n) => n === 'Lector EPUB').length;
  ok(vivas === 1 && /libro subido|Todo al día|posición/.test(await A.textContent('#aviso')), `con la carpeta en la papelera, se crea otra y se sincroniza ("${await A.textContent('#aviso')}")`);
  console.log('errores iPhone:', A.errores, '| tablet:', B.errores);
  await b.close();
})();
