// API REST de Drive v3 con fetch. Con drive.file la app solo ve lo que ha creado.

const API = 'https://www.googleapis.com/drive/v3';
const API_SUBIDA = 'https://www.googleapis.com/upload/drive/v3';
const TIPO_CARPETA = 'application/vnd.google-apps.folder';

export const NOMBRE_CARPETA = 'Lector EPUB';
const MARCA_APP = { clave: 'app', valor: 'lector-epub' };

export class ErrorDrive extends Error {
  constructor(mensaje, estadoHttp, detalle) {
    super(mensaje);
    this.estadoHttp = estadoHttp;
    this.detalle = detalle;
  }
}

function mensajeError(estadoHttp, detalle) {
  const motivo = detalle?.error?.errors?.[0]?.reason || '';
  if (estadoHttp === 401) return 'La sesión de Google ha caducado o no es válida';
  if (motivo === 'storageQuotaExceeded') return 'La cuota de Google Drive está llena';
  if (estadoHttp === 403) return `Drive ha denegado la operación (${motivo || 'sin motivo'})`;
  if (estadoHttp === 404) return 'El archivo ya no existe en Drive';
  return `Error de Drive ${estadoHttp}${detalle?.error?.message ? `: ${detalle.error.message}` : ''}`;
}

async function peticion(token, url, opciones = {}) {
  let respuesta;
  try {
    respuesta = await fetch(url, {
      ...opciones,
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...opciones.headers },
    });
  } catch (e) {
    throw new ErrorDrive(navigator.onLine ? `No se pudo contactar con Drive (${e.message})` : 'Sin conexión', 0);
  }
  if (!respuesta.ok) {
    let detalle = null;
    try {
      detalle = await respuesta.json();
    } catch {
      // cuerpo vacío o no JSON
    }
    throw new ErrorDrive(mensajeError(respuesta.status, detalle), respuesta.status, detalle);
  }
  return respuesta;
}

function literal(texto) {
  return `'${String(texto).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

async function buscar(token, consulta, campos = 'id,name,createdTime,modifiedTime') {
  const parametros = new URLSearchParams({
    q: consulta,
    fields: `files(${campos})`,
    orderBy: 'createdTime',
    spaces: 'drive',
    pageSize: '10',
  });
  const r = await peticion(token, `${API}/files?${parametros}`);
  return (await r.json()).files || [];
}

export async function obtenerUsuario(token) {
  const r = await peticion(token, `${API}/about?fields=user(displayName,emailAddress)`);
  return (await r.json()).user;
}

// Busca la carpeta de la app por su marca. Si hay varias (por ejemplo, creadas
// a la vez desde los dos dispositivos), se queda con la más antigua.
export async function localizarCarpeta(token) {
  const consulta = [
    `mimeType = ${literal(TIPO_CARPETA)}`,
    `appProperties has { key=${literal(MARCA_APP.clave)} and value=${literal(MARCA_APP.valor)} }`,
    'trashed = false',
  ].join(' and ');
  const encontradas = await buscar(token, consulta);
  if (encontradas.length) {
    return { carpeta: encontradas[0], creada: false, total: encontradas.length };
  }
  const r = await peticion(token, `${API}/files?fields=id,name,createdTime`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      name: NOMBRE_CARPETA,
      mimeType: TIPO_CARPETA,
      appProperties: { [MARCA_APP.clave]: MARCA_APP.valor },
    }),
  });
  return { carpeta: await r.json(), creada: true, total: 1 };
}

export async function buscarArchivo(token, carpetaId, nombre) {
  const consulta = `name = ${literal(nombre)} and ${literal(carpetaId)} in parents and trashed = false`;
  const encontrados = await buscar(token, consulta);
  return encontrados[0] || null;
}

export async function leerJson(token, archivoId) {
  const r = await peticion(token, `${API}/files/${encodeURIComponent(archivoId)}?alt=media`);
  return r.json();
}

export async function crearJson(token, carpetaId, nombre, datos) {
  const separador = `lector-${crypto.getRandomValues(new Uint32Array(2)).join('')}`;
  const metadatos = { name: nombre, parents: [carpetaId], mimeType: 'application/json' };
  const cuerpo = [
    `--${separador}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadatos),
    `--${separador}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(datos, null, 2),
    `--${separador}--`,
    '',
  ].join('\r\n');
  const r = await peticion(token, `${API_SUBIDA}/files?uploadType=multipart&fields=id,name,modifiedTime`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${separador}` },
    body: cuerpo,
  });
  return r.json();
}

export async function actualizarJson(token, archivoId, datos) {
  const url = `${API_SUBIDA}/files/${encodeURIComponent(archivoId)}?uploadType=media&fields=id,name,modifiedTime`;
  const r = await peticion(token, url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(datos, null, 2),
  });
  return r.json();
}
