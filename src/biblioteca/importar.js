// Importación de EPUB (punto 7 del diseño). Se lee el archivo con JSZip, sin
// abrir epub.js, para que importar varios libros sea rápido.

import { leerLibro, guardarLibroImportado } from '../datos/libros.js';

export const MENSAJE_ILEGIBLE = 'Este libro no se puede abrir. Puede tener protección DRM.';
const ALTO_PORTADA = 300;

const NS_DC = 'http://purl.org/dc/elements/1.1/';
const NS_OPF = 'http://www.idpf.org/2007/opf';
const NS_CONTENEDOR = 'urn:oasis:names:tc:opendocument:xmlns:container';

// Algoritmos de ofuscación de fuentes: no son DRM.
const OFUSCACION_FUENTES = new Set([
  'http://www.idpf.org/2008/embedding',
  'http://ns.adobe.com/pdf/enc#RC',
]);

export class ErrorImportacion extends Error {}

export async function huella(datos) {
  const resumen = await crypto.subtle.digest('SHA-256', datos);
  return Array.from(new Uint8Array(resumen), (b) => b.toString(16).padStart(2, '0')).join('');
}

function xml(texto) {
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new ErrorImportacion('XML no válido');
  return doc;
}

function unirRuta(base, relativa) {
  const partes = (base ? `${base}/${relativa}` : relativa).split('/');
  const resultado = [];
  for (const p of partes) {
    if (p === '..') resultado.pop();
    else if (p && p !== '.') resultado.push(p);
  }
  return resultado.join('/');
}

function archivoZip(zip, ruta) {
  return zip.file(ruta) || zip.file(decodeURIComponent(ruta));
}

async function tieneDrm(zip) {
  if (zip.file('META-INF/rights.xml') || zip.file('META-INF/sinf.xml')) return true;
  const cifrado = zip.file('META-INF/encryption.xml');
  if (!cifrado) return false;
  const doc = xml(await cifrado.async('string'));
  const metodos = Array.from(doc.getElementsByTagNameNS('*', 'EncryptionMethod'));
  return metodos.some((m) => !OFUSCACION_FUENTES.has(m.getAttribute('Algorithm')));
}

function textoDc(opf, nombre) {
  return Array.from(opf.getElementsByTagNameNS(NS_DC, nombre)).map((e) => e.textContent.trim()).filter(Boolean);
}

function metaPorNombre(metas, nombre) {
  return metas.find((m) => m.getAttribute('name') === nombre)?.getAttribute('content')?.trim() || null;
}

function leerMetadatos(opf) {
  const paquete = opf.documentElement;
  const metas = Array.from(opf.getElementsByTagNameNS(NS_OPF, 'meta'));

  const idUnico = paquete.getAttribute('unique-identifier');
  const identificadores = Array.from(opf.getElementsByTagNameNS(NS_DC, 'identifier'));
  const identificador = (identificadores.find((e) => e.getAttribute('id') === idUnico) || identificadores[0])
    ?.textContent.trim() || null;

  // Serie: calibre:series en EPUB 2, belongs-to-collection en EPUB 3.
  let serie = metaPorNombre(metas, 'calibre:series');
  let numeroSerie = metaPorNombre(metas, 'calibre:series_index');
  if (!serie) {
    const coleccion = metas.find((m) => m.getAttribute('property') === 'belongs-to-collection');
    if (coleccion) {
      serie = coleccion.textContent.trim() || null;
      const id = coleccion.getAttribute('id');
      if (id) {
        numeroSerie = metas.find((m) => m.getAttribute('refines') === `#${id}`
          && m.getAttribute('property') === 'group-position')?.textContent.trim() || null;
      }
    }
  }

  return {
    titulo: textoDc(opf, 'title')[0] || null,
    autor: textoDc(opf, 'creator').slice(0, 3).join(', ') || null,
    idioma: textoDc(opf, 'language')[0] || null,
    identificadorEpub: identificador,
    serie: serie || null,
    numeroSerie: numeroSerie ? Number(numeroSerie) || numeroSerie : null,
  };
}

function rutaPortada(opf, baseOpf) {
  const items = Array.from(opf.getElementsByTagNameNS(NS_OPF, 'item'));
  const esImagen = (i) => (i.getAttribute('media-type') || '').startsWith('image/');
  let item = items.find((i) => (i.getAttribute('properties') || '').split(/\s+/).includes('cover-image'));
  if (!item) {
    const idMeta = Array.from(opf.getElementsByTagNameNS(NS_OPF, 'meta'))
      .find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content');
    if (idMeta) item = items.find((i) => i.getAttribute('id') === idMeta && esImagen(i));
  }
  if (!item) item = items.find((i) => esImagen(i) && /cover|portada/i.test(`${i.getAttribute('id')} ${i.getAttribute('href')}`));
  return item ? unirRuta(baseOpf, item.getAttribute('href')) : null;
}

function cargarImagen(blob) {
  return new Promise((resolver, rechazar) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolver(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rechazar(new Error('portada ilegible'));
    };
    img.src = url;
  });
}

async function miniaturaPortada(zip, ruta) {
  const entrada = archivoZip(zip, ruta);
  if (!entrada) return null;
  const extension = ruta.split('.').pop().toLowerCase();
  const tipo = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' }[extension];
  const blob = new Blob([await entrada.async('arraybuffer')], { type: tipo || 'image/jpeg' });
  const img = await cargarImagen(blob);
  const escala = Math.min(1, ALTO_PORTADA / img.naturalHeight);
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.max(1, Math.round(img.naturalWidth * escala));
  lienzo.height = Math.max(1, Math.round(img.naturalHeight * escala));
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
  return new Promise((resolver) => lienzo.toBlob(resolver, 'image/jpeg', 0.85));
}

async function analizar(datos) {
  let zip;
  try {
    zip = await JSZip.loadAsync(datos);
  } catch {
    throw new ErrorImportacion('no es un archivo ZIP válido');
  }
  if (await tieneDrm(zip)) throw new ErrorImportacion('tiene DRM');

  const contenedor = archivoZip(zip, 'META-INF/container.xml');
  if (!contenedor) throw new ErrorImportacion('falta META-INF/container.xml');
  const rutaOpf = xml(await contenedor.async('string'))
    .getElementsByTagNameNS(NS_CONTENEDOR, 'rootfile')[0]?.getAttribute('full-path');
  const entradaOpf = rutaOpf && archivoZip(zip, rutaOpf);
  if (!entradaOpf) throw new ErrorImportacion('falta el archivo OPF');
  const opf = xml(await entradaOpf.async('string'));
  if (!opf.getElementsByTagNameNS(NS_OPF, 'itemref').length) throw new ErrorImportacion('el libro no tiene contenido');

  const baseOpf = rutaOpf.includes('/') ? rutaOpf.slice(0, rutaOpf.lastIndexOf('/')) : '';
  const metadatos = leerMetadatos(opf);
  let portada = null;
  const ruta = rutaPortada(opf, baseOpf);
  if (ruta) {
    try {
      portada = await miniaturaPortada(zip, ruta);
    } catch {
      portada = null; // sin portada se muestra el título
    }
  }
  return { metadatos, portada };
}

// Devuelve { resultado: 'importado' | 'duplicado' | 'error', libro?, mensaje? }
export async function importarArchivo(archivo) {
  const datos = await archivo.arrayBuffer();
  const id = await huella(datos);

  const existente = await leerLibro(id);
  if (existente && !existente.eliminado) {
    return { resultado: 'duplicado', libro: existente };
  }

  let analisis;
  try {
    analisis = await analizar(datos);
  } catch (e) {
    return { resultado: 'error', mensaje: MENSAJE_ILEGIBLE, detalle: e.message };
  }

  const nombreSinExtension = archivo.name.replace(/\.epub$/i, '');
  const libro = await guardarLibroImportado({
    id,
    ...analisis.metadatos,
    titulo: analisis.metadatos.titulo || nombreSinExtension,
    tamanoBytes: datos.byteLength,
  }, datos, analisis.portada);
  return { resultado: 'importado', libro };
}
