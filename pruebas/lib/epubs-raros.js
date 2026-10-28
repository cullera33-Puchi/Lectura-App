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

module.exports = { epubDanado, epubIlustrado };
