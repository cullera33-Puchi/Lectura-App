// Ejecuta todas las pruebas (o las que se indiquen) contra una copia local de
// la app. Levanta un servidor propio en un puerto libre.
//
//   node ejecutar.js              todas
//   node ejecutar.js ficha copias solo las que contienen esos nombres
//
// Una prueba falla si termina con error, si escribe una línea "FALLO" o si
// informa de errores de la página.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.epub': 'application/epub+zip',
};

const PRUEBAS = [
  ['unidad/fusion.mjs'],
  ['unidad/calculo.mjs'],
  ['casos/sincronizacion.js'],
  ['casos/revision.js'],
  ['casos/v2-v3.js'],
  ['casos/copias.js'],
  ['casos/entrar.js'],
  ['casos/ficha.js'],
  ['casos/ficha-sincronizada.js'],
  ['casos/inicio-y-ficha.js'],
  ['casos/deslizar-hojas.js'],
  ['casos/deslizar-pestanas.js'],
  ['casos/sinopsis.js'],
  ['casos/buscar-libro.js'],
  ['casos/barra-libro.js'],
  ['casos/marcadores.js'],
  ['casos/volver.js'],
  ['casos/valoracion.js'],
  ['casos/quiero-leer.js'],
  ['casos/duplicados.js'],
  ['casos/meta-diaria.js'],
  ['casos/fin-previsto.js'],
  ['casos/doble-pagina.js'],
  ['casos/animacion.js', 'movil'],
  ['casos/animacion.js', 'tinta'],
  ['casos/ajustes-aa.js'],
  ['casos/ajustes-libro.js'],
  ['casos/seguridad.js'],
  ['casos/sin-conexion.js'],
];

function servidor() {
  const srv = http.createServer((pet, res) => {
    const ruta = decodeURIComponent(new URL(pet.url, 'http://x').pathname);
    let archivo = path.join(RAIZ, ruta);
    if (!archivo.startsWith(RAIZ)) { res.writeHead(403); res.end(); return; }
    if (ruta.endsWith('/')) archivo = path.join(archivo, 'index.html');
    fs.readFile(archivo, (error, datos) => {
      if (error) { res.writeHead(404); res.end('no encontrado'); return; }
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(datos);
    });
  });
  return new Promise((resolver) => srv.listen(0, '127.0.0.1', () => resolver(srv)));
}

function ejecutar([archivo, ...args], url) {
  return new Promise((resolver) => {
    const inicio = Date.now();
    const hijo = spawn(process.execPath, [path.join(__dirname, archivo), ...args], {
      env: { ...process.env, PRUEBAS_URL: url },
    });
    let salida = '';
    hijo.stdout.on('data', (d) => { salida += d; });
    hijo.stderr.on('data', (d) => { salida += d; });
    hijo.on('close', (codigo) => {
      const lineas = salida.split('\n');
      const fallos = lineas.filter((l) => l.startsWith('FALLO'));
      const errores = lineas.filter((l) => /errores/i.test(l) && /\[\s*['"]/.test(l));
      const correctas = lineas.filter((l) => l.startsWith('OK')).length;
      resolver({ archivo: [archivo, ...args].join(' '), codigo, fallos, errores, correctas, salida, segundos: Math.round((Date.now() - inicio) / 1000) });
    });
  });
}

(async () => {
  const filtros = process.argv.slice(2);
  const elegidas = PRUEBAS.filter(([a]) => !filtros.length || filtros.some((f) => a.includes(f)));
  const srv = await servidor();
  const url = `http://localhost:${srv.address().port}/`;
  console.log(`App servida en ${url}. ${elegidas.length} pruebas.\n`);
  let total = 0;
  const malas = [];
  const correcta = (r) => r.codigo === 0 && !r.fallos.length && !r.errores.length;
  const intermitentes = [];
  for (const prueba of elegidas) {
    let r = await ejecutar(prueba, url);
    // Un caso del navegador que falla se repite una vez. Si entonces pasa, se
    // marca como intermitente: suele ser un problema de tiempos de la prueba,
    // pero conviene revisarlo.
    if (!correcta(r) && prueba[0].startsWith('casos/')) {
      const segunda = await ejecutar(prueba, url);
      if (correcta(segunda)) {
        intermitentes.push(r.archivo);
        r = segunda;
      }
    }
    const bien = correcta(r);
    total += r.correctas;
    const nota = intermitentes.includes(r.archivo) ? ', intermitente: falló la primera vez' : '';
    console.log(`${bien ? 'BIEN ' : 'MAL  '} ${r.archivo} (${r.correctas} comprobaciones, ${r.segundos} s${nota})`);
    if (!bien) {
      malas.push(r);
      for (const l of [...r.fallos, ...r.errores]) console.log(`       ${l}`);
      if (r.codigo !== 0) console.log(r.salida.split('\n').slice(-15).map((l) => `       ${l}`).join('\n'));
    }
  }
  srv.close();
  console.log(`\n${elegidas.length - malas.length} de ${elegidas.length} pruebas correctas, ${total} comprobaciones.`);
  if (intermitentes.length) console.log(`Intermitentes (pasaron al repetir): ${intermitentes.join(', ')}`);
  process.exit(malas.length ? 1 : 0);
})();
