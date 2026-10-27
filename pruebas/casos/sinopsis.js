// Lectura de la sinopsis y los datos de la edición de un EPUB (HTML a texto, sin scripts).
const { chromium } = require('playwright');
const { URL_APP, EPUBS: S, SALIDA, ok } = require('../lib/entorno.js');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto(URL_APP); await p.waitForTimeout(800);
  const r = await p.evaluate(async () => {
    await (await import('/src/lector/librerias.js')).cargarJSZip();
    const zip = new JSZip();
    zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    zip.file('OEBPS/content.opf', `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>T</dc:title><dc:description>&lt;p&gt;Primer &lt;b&gt;párrafo&lt;/b&gt;.&lt;/p&gt;&lt;p&gt;Segundo&lt;br/&gt;con salto.&lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;</dc:description><dc:publisher>Editorial Ejemplo</dc:publisher><dc:date>2019-03-05</dc:date><dc:language>es</dc:language><dc:subject>Novela</dc:subject><dc:subject>Aventuras</dc:subject></metadata><manifest/><spine/></package>`);
    const datos = await zip.generateAsync({ type: 'arraybuffer' });
    const m = await import('/src/biblioteca/importar.js');
    return m.leerDatosEdicion(datos);
  });
  console.log(JSON.stringify(r, null, 1));
  ok(r.sinopsis === 'Primer párrafo.\n\nSegundo\ncon salto.' && r.editorial === 'Editorial Ejemplo' && r.temas.length === 2, 'sinopsis en texto, sin el script, y datos de la edición');
  await b.close();
})();
