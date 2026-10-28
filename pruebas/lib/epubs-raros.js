// EPUB generados para las pruebas de la mejora 19: uno con capítulos dañados
// y otro muy ilustrado.
const crypto = require('crypto');
const JSZip = require('../../vendor/jszip-3.10.1.min.js');

const parrafos = (n, t) => Array.from({ length: n }, (_, i) => `<p>${t}: párrafo ${i + 1} de relleno para que el capítulo ocupe varias páginas en la pantalla.</p>`).join('');
const xhtml = (titulo, cuerpo) => `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${titulo}</title></head><body>${cuerpo}</body></html>`;

function base(zip, titulo, items, spine, toc) {
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:uuid:${crypto.randomUUID()}</dc:identifier><dc:title>${titulo}</dc:title><dc:creator>Autora de Prueba</dc:creator><dc:language>es</dc:language><meta property="dcterms:modified">2026-10-28T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${items}</manifest><spine>${spine}</spine></package>`);
  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Índice</title></head><body><nav epub:type="toc"><ol>${toc}</ol></nav></body></html>`);
}

// c1 bien, c2 con XHTML mal formado (&nbsp; sin declarar y etiqueta sin
// cerrar), c3 en el manifiesto pero ausente del archivo, c4 bien.
async function epubDanado() {
  const zip = new JSZip();
  const caps = [1, 2, 3, 4];
  base(zip, 'Libro dañado',
    caps.map((n) => `<item id="c${n}" href="c${n}.xhtml" media-type="application/xhtml+xml"/>`).join(''),
    caps.map((n) => `<itemref idref="c${n}"/>`).join(''),
    caps.map((n) => `<li><a href="c${n}.xhtml">Capítulo ${n}</a></li>`).join(''));
  zip.file('OEBPS/c1.xhtml', xhtml('Uno', `<h1>Capítulo 1</h1>${parrafos(30, 'Uno')}`));
  zip.file('OEBPS/c2.xhtml', xhtml('Dos', `<h1>Capítulo 2</h1><p>Texto&nbsp;con espacio duro sin declarar.<br>Y una línea sin cerrar.</p>${parrafos(10, 'Dos')}`));
  zip.file('OEBPS/c4.xhtml', xhtml('Cuatro', `<h1>Capítulo 4</h1>${parrafos(10, 'Cuatro')}`));
  return zip.generateAsync({ type: 'nodebuffer' });
}

// n imágenes de tam MB (datos aleatorios: no se comprimen), una por capítulo.
async function epubIlustrado(n = 40, tam = 2) {
  const zip = new JSZip();
  const caps = Array.from({ length: n }, (_, i) => i + 1);
  base(zip, 'Libro ilustrado',
    caps.map((i) => `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/><item id="i${i}" href="img/i${i}.jpg" media-type="image/jpeg"/>`).join(''),
    caps.map((i) => `<itemref idref="c${i}"/>`).join(''),
    caps.map((i) => `<li><a href="c${i}.xhtml">Lámina ${i}</a></li>`).join(''));
  for (const i of caps) {
    zip.file(`OEBPS/c${i}.xhtml`, xhtml(`Lámina ${i}`, `<h1>Lámina ${i}</h1><p>Texto de la lámina ${i}.</p><img src="img/i${i}.jpg" alt="Lámina ${i}"/>${parrafos(3, `L${i}`)}`));
    zip.file(`OEBPS/img/i${i}.jpg`, crypto.randomBytes(tam * 1024 * 1024));
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

// Notas al pie en varios formatos (mejora 22). c1.xhtml lleva las llamadas
// al principio, para que estén en la primera página.
async function epubNotas() {
  const zip = new JSZip();
  base(zip, 'Libro con notas',
    '<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/><item id="notas" href="notas.xhtml" media-type="application/xhtml+xml"/>',
    '<itemref idref="c1"/><itemref idref="c2"/><itemref idref="notas"/>',
    '<li><a href="c1.xhtml">Capítulo 1</a></li><li><a href="c2.xhtml">Capítulo 2</a></li><li><a href="notas.xhtml">Notas</a></li>');
  const ops = 'xmlns:epub="http://www.idpf.org/2007/ops"';
  zip.file('OEBPS/c1.xhtml', `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" ${ops}><head><title>Uno</title></head><body>
<h1>Capítulo 1</h1>
<p>EPUB 3<a epub:type="noteref" id="r1" href="#n1">1</a>, Calibre<a href="notas.xhtml#ftn2" id="ftnref2"><sup>[2]</sup></a>, Kindle<sup><a href="notas.xhtml#filepos900">3</a></sup>, final<a epub:type="noteref" href="notas.xhtml#en4">4</a>.</p>
<p>Enlaces normales: <a href="c2.xhtml#cap2">2</a> y <a href="c2.xhtml">véase el capítulo 2</a>.</p>
${parrafos(20, 'Uno')}
<aside epub:type="footnote" id="n1"><p><a href="#r1">1</a> Nota en formato EPUB 3.</p></aside>
</body></html>`);
  zip.file('OEBPS/c2.xhtml', xhtml('Dos', `<h1 id="cap2">Capítulo 2</h1>${parrafos(10, 'Dos')}`));
  zip.file('OEBPS/notas.xhtml', `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" ${ops}><head><title>Notas</title></head><body>
<h1>Notas</h1>
<p><a href="c1.xhtml#ftnref2" id="ftn2">[2]</a> Nota de Calibre en otro archivo.</p>
<p><a id="filepos900"></a>3. Nota de una conversión de Kindle.</p>
<ol><li id="en4" epub:type="endnote"><p>Nota final cuatro.</p><p>Con un segundo párrafo. <a href="c1.xhtml" epub:type="backlink">↩</a></p></li></ol>
</body></html>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

module.exports = { epubDanado, epubIlustrado, epubNotas };
